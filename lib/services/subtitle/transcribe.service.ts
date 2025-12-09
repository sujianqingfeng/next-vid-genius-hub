import { eq } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { getDb, schema, type TranscriptionWord } from '~/lib/db'
import { logger } from '~/lib/logger'
import { type CloudflareInputFormat, type WhisperModel, WHISPER_MODELS } from '~/lib/subtitle/config/models'
import { validateVttContent, normalizeVttContent } from '~/lib/subtitle/utils/vtt'
import { putObjectByKey, upsertMediaManifest, startCloudJob, getJobStatus } from '~/lib/cloudflare'
import { bucketPaths } from '~/lib/storage/bucket-paths'

export async function transcribe(input: {
	mediaId: string
	model: WhisperModel
	language?: string
	inputFormat?: CloudflareInputFormat
}): Promise<{ success: true; transcription: string; words?: TranscriptionWord[] }> {
	const { mediaId, model } = input
	const normalizedLanguage =
		input.language && input.language !== 'auto' ? input.language : undefined
	const modelConfig = WHISPER_MODELS[model]
	const supportsLanguageHint = Boolean(modelConfig?.supportsLanguageHint)
	const languageForCloud = supportsLanguageHint ? normalizedLanguage : undefined
	const cloudflareInputFormat: CloudflareInputFormat =
		input.inputFormat ?? modelConfig?.cloudflareInputFormat ?? 'binary'

	logger.info('transcription', `Starting transcription for media ${mediaId} with cloudflare/${model}`)

	const db = await getDb()
	const mediaRecord = await db.query.media.findFirst({
		where: eq(schema.media.id, mediaId),
	})
	if (!mediaRecord) {
		logger.error('transcription', 'Media not found')
		throw new Error('Media not found.')
	}

	let vttContent: string
	let transcriptionWords: TranscriptionWord[] | undefined
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
	const cloudflareModelMap: Record<
		string,
		'@cf/openai/whisper-tiny-en' | '@cf/openai/whisper-large-v3-turbo' | '@cf/openai/whisper'
	> = {
		'whisper-tiny-en': '@cf/openai/whisper-tiny-en',
		'whisper-large-v3-turbo': '@cf/openai/whisper-large-v3-turbo',
		'whisper-medium': '@cf/openai/whisper',
	}
	const modelId = cloudflareModelMap[model]
	if (!modelId) throw new Error(`Model ${model} is not supported by Cloudflare provider`)

	const taskId = createId()
	const now = new Date()
	await db.insert(schema.tasks).values({
		id: taskId,
		userId: mediaRecord.userId ?? null,
		kind: 'asr',
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
		const job = await startCloudJob({
			mediaId,
			engine: 'asr-pipeline',
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

	logger.info(
		'transcription',
		`Cloud ASR job started: ${jobId} (maxBytes=${targetBytes}, bitrates=[${targetBitrates.join(',')}], sr=${sampleRate})`,
	)
	const startedAt = Date.now()
	let lastStatus = 'queued'
	let vttUrl: string | undefined
	let wordsUrl: string | undefined
	while (Date.now() - startedAt < 180_000) {
		const st = await getJobStatus(jobId!)
		lastStatus = st.status
		logger.debug(
			'transcription',
			`Cloud ASR status for ${jobId}: ${st.status} phase=${st.phase ?? '-'} progress=${st.progress ?? '-'}`,
		)
		try {
			const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.jobId, jobId!) })
			if (task) {
				await db
					.update(schema.tasks)
					.set({
						status: st.status,
						progress: typeof st.progress === 'number' ? Math.round(st.progress * 100) : task.progress,
						jobStatusSnapshot: st,
						updatedAt: new Date(),
						finishedAt: ['completed', 'failed', 'canceled'].includes(st.status) ? new Date() : task.finishedAt,
					})
					.where(eq(schema.tasks.id, task.id))
			}
		} catch {
			// best-effort
		}
		if (st.status === 'completed') {
			vttUrl = st.outputs?.vtt?.url
			wordsUrl = st.outputs?.words?.url
			break
		}
		if (st.status === 'failed' || st.status === 'canceled') {
			const msg = st.message || 'Cloud ASR pipeline failed'
			await db
				.update(schema.tasks)
				.set({
					status: st.status,
					error: msg,
					finishedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(schema.tasks.jobId, jobId!))
			throw new Error(`job ${jobId}: ${msg}`)
		}
		await new Promise((r) => setTimeout(r, 1200))
	}
	if (!vttUrl) {
		await db
			.update(schema.tasks)
			.set({
				status: 'failed',
				error: `timeout:${lastStatus}`,
				finishedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(schema.tasks.jobId, jobId!))
		throw new Error(`Cloud ASR pipeline timeout for ${jobId}; last status=${lastStatus}`)
	}
	const vttResp = await fetch(vttUrl)
	if (!vttResp.ok) throw new Error(`fetch vtt failed: ${vttResp.status}`)
	vttContent = await vttResp.text()
	if (wordsUrl) {
		try {
			const wr = await fetch(wordsUrl)
			if (wr.ok) transcriptionWords = (await wr.json()) as TranscriptionWord[]
		} catch {}
	}

	// Validate/normalize VTT
	const validation = validateVttContent(vttContent)
	if (!validation.isValid) {
		logger.warn(
			'transcription',
			`VTT format validation failed for cloudflare: ${validation.errors.join(', ')}`,
		)
		vttContent = normalizeVttContent(vttContent)
		const revalidation = validateVttContent(vttContent)
		if (!revalidation.isValid) {
			logger.error(
				'transcription',
				`Failed to normalize VTT format for cloudflare: ${revalidation.errors.join(', ')}`,
			)
			throw new Error(
				`Invalid VTT format from cloudflare transcription: ${revalidation.errors.join(', ')}`,
			)
		}
	}

	await db
		.update(schema.media)
		.set({ transcription: vttContent, transcriptionWords })
		.where(eq(schema.media.id, mediaId))
	try {
		const vttKey = bucketPaths.inputs.subtitles(mediaId)
		await putObjectByKey(vttKey, 'text/vtt', vttContent)
		await upsertMediaManifest(mediaId, { vttKey })
		logger.info('transcription', `VTT materialized to bucket: ${vttKey}`)
	} catch (err) {
		logger.warn(
			'transcription',
			`VTT materialization skipped: ${err instanceof Error ? err.message : String(err)}`,
		)
	}

	logger.info('transcription', `Transcription completed successfully for media ${mediaId}`)
	try {
		await db
			.update(schema.tasks)
			.set({
				status: 'completed',
				progress: 100,
				finishedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(schema.tasks.jobId, jobId!))
	} catch {
		// ignore
	}
	return { success: true, transcription: vttContent, words: transcriptionWords }
}
