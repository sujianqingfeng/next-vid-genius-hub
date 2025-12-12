import { eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import { type CloudflareInputFormat } from '~/lib/subtitle/config/models'
import { startCloudJob, putJobManifest, type JobManifest } from '~/lib/cloudflare'
import { TASK_KINDS } from '~/lib/job/task'
import { getAiModelConfig } from '~/lib/ai/config/service'

export async function transcribe(input: {
	mediaId: string
	model: string
	language?: string
	inputFormat?: CloudflareInputFormat
}): Promise<{ success: true; jobId: string; durationSeconds: number }> {
	const { mediaId, model } = input
	const normalizedLanguage =
		input.language && input.language !== 'auto' ? input.language : undefined

	const modelCfg = await getAiModelConfig(model)
	if (!modelCfg || modelCfg.kind !== 'asr' || !modelCfg.enabled) {
		throw new Error(`ASR model ${model} is not available`)
	}
	if (!modelCfg.provider.enabled || modelCfg.provider.kind !== 'asr') {
		throw new Error(`ASR provider for model ${model} is not available`)
	}

	const caps = (modelCfg.capabilities as any) || {}
	const supportsLanguageHint = Boolean(caps.supportsLanguageHint)
	const languageForCloud = supportsLanguageHint ? normalizedLanguage : undefined
	const cloudflareInputFormat: CloudflareInputFormat =
		input.inputFormat ?? (caps.inputFormat as CloudflareInputFormat | undefined) ?? 'binary'

	logger.info('transcription', `Starting transcription for media ${mediaId} with cloudflare/${model}`)

	const db = await getDb()
	const mediaRecord = await db.query.media.findFirst({
		where: eq(schema.media.id, mediaId),
	})
	if (!mediaRecord) {
		logger.error('transcription', 'Media not found')
		throw new Error('Media not found.')
	}

	const remoteAudioKey = mediaRecord.remoteAudioKey
	if (!remoteAudioKey) {
		logger.error(
			'transcription',
			'Cloud transcription requires remoteAudioKey (audio not uploaded to storage)',
		)
		throw new Error(
			'Remote audio is not available. Please upload audio to storage before transcribing.',
		)
	}

	const targetBytes = Number(process.env.CLOUDFLARE_ASR_MAX_UPLOAD_BYTES || 4 * 1024 * 1024)
	const sampleRate = Number(process.env.ASR_SAMPLE_RATE || 16000)
	const targetBitrates = (process.env.ASR_TARGET_BITRATES || '48,24')
		.split(',')
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isFinite(n) && n > 0)
	const modelId = modelCfg.remoteModelId

	const taskId = createId()
	const now = new Date()
	await db.insert(schema.tasks).values({
		id: taskId,
		userId: mediaRecord.userId ?? null,
		kind: TASK_KINDS.ASR,
		engine: 'asr-pipeline',
		targetType: 'media',
		targetId: mediaId,
		status: 'queued',
		progress: 0,
		payload: {
			sourceKey: remoteAudioKey,
			maxBytes: targetBytes,
			targetBitrates,
			sampleRate,
			model: modelId,
			inputFormat: cloudflareInputFormat,
			...(languageForCloud ? { language: languageForCloud } : {}),
		},
		createdAt: now,
		updatedAt: now,
	})

	let jobId: string | null = null
	try {
		// Generate jobId so we can snapshot inputs into a per-job manifest.
		jobId = `job_${createId()}`

		const manifest: JobManifest = {
			jobId,
			mediaId,
			engine: 'asr-pipeline',
			createdAt: Date.now(),
			inputs: {
				asrSourceKey: remoteAudioKey,
			},
			optionsSnapshot: {
				sourceKey: remoteAudioKey,
				maxBytes: targetBytes,
				targetBitrates,
				sampleRate,
				model: modelId,
				inputFormat: cloudflareInputFormat,
				language: languageForCloud ?? null,
			},
		}
		await putJobManifest(jobId, manifest)

		const job = await startCloudJob({
			jobId,
			mediaId,
			engine: 'asr-pipeline',
			title: mediaRecord.title || undefined,
			options: {
				sourceKey: remoteAudioKey,
				maxBytes: targetBytes,
				targetBitrates,
				sampleRate,
				model: modelId,
				inputFormat: cloudflareInputFormat,
				...(languageForCloud ? { language: languageForCloud } : {}),
			},
		})
		jobId = job.jobId
		await db
			.update(schema.tasks)
			.set({
				jobId: job.jobId,
				startedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(schema.tasks.id, taskId))
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to start ASR pipeline'
		await db
			.update(schema.tasks)
			.set({
				status: 'failed',
				error: message,
				finishedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(schema.tasks.id, taskId))
		throw error
	}

	const durationSeconds = typeof mediaRecord.duration === 'number' && mediaRecord.duration > 0 ? mediaRecord.duration : 0

	return { success: true, jobId: jobId!, durationSeconds }
}
