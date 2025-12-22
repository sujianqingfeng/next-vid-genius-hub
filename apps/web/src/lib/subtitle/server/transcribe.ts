import { deriveCloudflareAsrCapabilities } from '@app/media-domain'
import { eq } from 'drizzle-orm'
import { getAiModelConfig } from '~/lib/ai/config/service'
import {
	type JobManifest,
	putJobManifest,
	startCloudJob,
} from '~/lib/cloudflare'
import { getDb, schema } from '~/lib/db'
import { TASK_KINDS } from '~/lib/job/task'
import { logger } from '~/lib/logger'
import { createId } from '~/lib/utils/id'

export async function transcribe(input: {
	mediaId: string
	model: string
	language?: string
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

	const provider = modelCfg.provider
	if (provider.type !== 'cloudflare_asr' && provider.type !== 'whisper_api') {
		throw new Error(
			`ASR provider type ${provider.type} is not supported by cloud asr-pipeline`,
		)
	}
	const supportsLanguageHint =
		provider.type === 'cloudflare_asr'
			? deriveCloudflareAsrCapabilities(modelCfg.remoteModelId)
					.supportsLanguageHint
			: true
	const languageForProvider = supportsLanguageHint
		? normalizedLanguage
		: undefined

	logger.info(
		'transcription',
		`Starting transcription for media ${mediaId} with ${provider.slug}/${model}`,
	)

	const db = await getDb()
	const mediaRecord = await db.query.media.findFirst({
		where: eq(schema.media.id, mediaId),
	})
	if (!mediaRecord) {
		logger.error('transcription', 'Media not found')
		throw new Error('Media not found.')
	}

	// Prefer processed audio for ASR (more stable for single-language + consistent sample rate),
	// fall back to legacy remoteAudioKey, then raw source audio when available.
	const sourceKey =
		mediaRecord.remoteAudioProcessedKey ||
		mediaRecord.remoteAudioKey ||
		mediaRecord.remoteAudioSourceKey
	if (!sourceKey) {
		logger.error(
			'transcription',
			'Cloud transcription requires remote audio in storage (processed/source audio key missing)',
		)
		throw new Error(
			'Remote audio is not available. Please upload audio to storage before transcribing.',
		)
	}

	const configuredMaxUploadBytes =
		typeof (provider.metadata as any)?.maxUploadBytes === 'number'
			? Number((provider.metadata as any).maxUploadBytes)
			: undefined
	const defaultMaxUploadBytes =
		provider.type === 'whisper_api'
			? 500 * 1024 * 1024
			: Number(process.env.CLOUDFLARE_ASR_MAX_UPLOAD_BYTES || 4 * 1024 * 1024)
	const targetBytes =
		typeof configuredMaxUploadBytes === 'number' &&
		Number.isFinite(configuredMaxUploadBytes) &&
		configuredMaxUploadBytes > 0
			? configuredMaxUploadBytes
			: defaultMaxUploadBytes
	const sampleRate = Number(process.env.ASR_SAMPLE_RATE || 16000)
	const targetBitrates = (process.env.ASR_TARGET_BITRATES || '48,24')
		.split(',')
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isFinite(n) && n > 0)
	// Use DB model id for billing/pricing rules; pass remoteModelId separately for the orchestrator runner.
	const modelId = modelCfg.id
	const remoteModelId = modelCfg.remoteModelId

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
			sourceKey,
			maxBytes: targetBytes,
			targetBitrates,
			sampleRate,
			model: modelId,
			remoteModelId,
			providerType: provider.type,
			providerId: provider.id,
			...(languageForProvider ? { language: languageForProvider } : {}),
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
				asrSourceKey: sourceKey,
			},
			optionsSnapshot: {
				sourceKey,
				maxBytes: targetBytes,
				targetBitrates,
				sampleRate,
				model: modelId,
				remoteModelId,
				providerType: provider.type,
				providerId: provider.id,
				language: languageForProvider ?? null,
			},
		}
		await putJobManifest(jobId, manifest)

		const job = await startCloudJob({
			jobId,
			mediaId,
			engine: 'asr-pipeline',
			title: mediaRecord.title || undefined,
			options: {
				sourceKey,
				maxBytes: targetBytes,
				targetBitrates,
				sampleRate,
				model: modelId,
				remoteModelId,
				providerType: provider.type,
				providerId: provider.id,
				...(languageForProvider ? { language: languageForProvider } : {}),
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
		const message =
			error instanceof Error ? error.message : 'Failed to start ASR pipeline'
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

	const durationSeconds =
		typeof mediaRecord.duration === 'number' && mediaRecord.duration > 0
			? mediaRecord.duration
			: 0

	return { success: true, jobId: jobId!, durationSeconds }
}
