import fs from 'node:fs/promises'
import path from 'node:path'
import { os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { AIModelIds } from '~/lib/ai/models'
import { generateObject } from '~/lib/ai/chat'
import { transcribeWithWhisper } from '~/lib/asr/whisper'
import { logger } from '~/lib/logger'
import {
	OPERATIONS_DIR,
} from '~/lib/config/app.config'
import {
	WHISPER_CPP_PATH,
	RENDERED_VIDEO_FILENAME,
	CLOUDFLARE_ACCOUNT_ID,
	CLOUDFLARE_API_TOKEN,
} from '~/lib/config/app.config'
import { db, schema, type TranscriptionWord } from '~/lib/db'
import { renderVideoWithSubtitles } from '@app/media-subtitles'
import {
	getTranslationPrompt,
	DEFAULT_TRANSLATION_PROMPT_ID
} from '~/lib/subtitle/config/prompts'
import {
    subtitleRenderConfigSchema,
} from '~/lib/subtitle/types'
import { startCloudJob, getJobStatus, presignGetByKey } from '~/lib/cloudflare'
import { tmpdir } from 'node:os'
import {
	parseVttCues,
	serializeVttCues,
	validateVttContent,
	normalizeVttContent
} from '~/lib/subtitle/utils/vtt'
import { buildCandidateBreaks, buildSegmentsByAI, segmentsToVtt, applyOrphanGuard, applyPhraseGuard } from '~/lib/subtitle/utils/segment'
// removed unused types from models

export const transcribe = os
    .input(
        z.object({
            mediaId: z.string(),
            model: z.enum(['whisper-large', 'whisper-medium', 'whisper-tiny-en', 'whisper-large-v3-turbo']),
            provider: z.enum(['local', 'cloudflare']).default('local'),
            downsampleBackend: z.enum(['auto','local','cloud']).default('auto').optional(),
        }),
    )
	.handler(async ({ input }) => {
		const { mediaId, model, provider } = input

		logger.info('transcription', `Starting transcription for media ${mediaId} with ${provider}/${model}`)

        const mediaRecord = await db.query.media.findFirst({
            where: eq(schema.media.id, mediaId),
        })

        if (!mediaRecord) {
            logger.error('transcription', 'Media not found')
            throw new Error('Media not found.')
        }

        let vttContent: string
        let transcriptionWords: TranscriptionWord[] | undefined
        let tempAudioPath: string | undefined
        let remoteAudioBuffer: ArrayBuffer | undefined
        const downsampleBackend = input.downsampleBackend || 'auto'
        const useCloudDownsample = provider === 'cloudflare' && (
            downsampleBackend === 'cloud' || (
                downsampleBackend === 'auto' && (
                    Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) ||
                    process.env.FORCE_CLOUD_DOWNSAMPLE === 'true'
                )
            )
        )

        // Resolve audio source: prefer local audioFilePath; otherwise try remoteAudioKey
        const hasLocalAudio = Boolean(mediaRecord.audioFilePath)
        if (!hasLocalAudio) {
            if (mediaRecord.remoteAudioKey) {
                // 若使用云端降采样，则不需要把音频拉回 Next；否则按原逻辑拉取
                if (!(useCloudDownsample && provider === 'cloudflare')) {
                    try {
                        const signedUrl = await presignGetByKey(mediaRecord.remoteAudioKey)
                        const r = await fetch(signedUrl)
                        if (!r.ok) throw new Error(`fetch audio failed: ${r.status}`)
                        if (provider === 'cloudflare') {
                            remoteAudioBuffer = await r.arrayBuffer()
                            try {
                                const size = remoteAudioBuffer.byteLength
                                const mb = (size / (1024 * 1024)).toFixed(2)
                                logger.info('transcription', `Remote audio fetched: ${size} bytes (~${mb} MB) for media ${mediaId}`)
                            } catch {}
                        } else {
                            // Local whisper requires a file path; write to temp and cleanup later
                            const buf = Buffer.from(await r.arrayBuffer())
                            const fileName = `${mediaId}-tmp-${Date.now()}.mp3`
                            tempAudioPath = path.join(tmpdir(), fileName)
                            await fs.writeFile(tempAudioPath, buf)
                        }
                    } catch (e) {
                        logger.error('transcription', `Failed to fetch remote audio: ${e instanceof Error ? e.message : String(e)}`)
                        throw new Error('Audio not available: local path missing and remote fetch failed')
                    }
                }
            } else {
                logger.error('transcription', 'Audio not available: missing audioFilePath and remoteAudioKey')
                throw new Error('Audio not available: missing audioFilePath and remoteAudioKey')
            }
        }

        if (provider === 'cloudflare') {
            // Phase 2: 当使用 asr-pipeline（云端流水线）时，Next 端无需本地 AI 凭据
            const useAsrPipeline = Boolean(useCloudDownsample && mediaRecord.remoteAudioKey)

            // 仅在需要走旧路径（Next 直连 Workers AI）时才校验本地凭据
            if (!useAsrPipeline) {
                if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
                    logger.error('transcription', 'Cloudflare configuration is missing')
                    throw new Error(
                        'Cloudflare configuration is missing. Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables.',
                    )
                }
            }

            logger.info('transcription', `Using Cloudflare provider with model ${model}`)
            if (useAsrPipeline) {
                // Phase 2: asr-pipeline（Worker 端降采样 + ASR）
                const targetBytes = Number(process.env.CLOUDFLARE_ASR_MAX_UPLOAD_BYTES || 4 * 1024 * 1024)
                const sampleRate = Number(process.env.ASR_SAMPLE_RATE || 16000)
                const targetBitrates = (process.env.ASR_TARGET_BITRATES || '48,24').split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0)
                const cloudflareModelMap: Record<string, '@cf/openai/whisper-tiny-en' | '@cf/openai/whisper-large-v3-turbo' | '@cf/openai/whisper'> = {
                    'whisper-tiny-en': '@cf/openai/whisper-tiny-en',
                    'whisper-large-v3-turbo': '@cf/openai/whisper-large-v3-turbo',
                    'whisper-medium': '@cf/openai/whisper',
                    'whisper-large': '@cf/openai/whisper',
                }
                const modelId = cloudflareModelMap[model]
                const job = await startCloudJob({
                    mediaId,
                    engine: 'asr-pipeline',
                    options: { sourceKey: mediaRecord.remoteAudioKey, maxBytes: targetBytes, targetBitrates, sampleRate, model: modelId },
                })
                const startedAt = Date.now()
                let lastStatus = 'queued'
                let vttUrl: string | undefined
                let wordsUrl: string | undefined
                while (Date.now() - startedAt < 180_000) { // 最多 180s
                    const st = await getJobStatus(job.jobId)
                    lastStatus = st.status
                    if (st.status === 'completed') {
                        vttUrl = st.outputs?.vtt?.url
                        wordsUrl = st.outputs?.words?.url
                        break
                    }
                    if (st.status === 'failed' || st.status === 'canceled') {
                        const msg = (st as any).error || (st as any).message || 'Cloud ASR pipeline failed'
                        throw new Error(msg)
                    }
                    await new Promise(r => setTimeout(r, 1200))
                }
                if (!vttUrl) throw new Error(`Cloud ASR pipeline timeout; last status=${lastStatus}`)
                const vttResp = await fetch(vttUrl)
                if (!vttResp.ok) throw new Error(`fetch vtt failed: ${vttResp.status}`)
                vttContent = await vttResp.text()
                if (wordsUrl) {
                    try {
                        const wr = await fetch(wordsUrl)
                        if (wr.ok) transcriptionWords = await wr.json() as any
                    } catch {}
                }
            } else {
                // Phase 1 路径：Next 端直连 Workers AI
                const transcriptionResult = await transcribeWithWhisper({
                    audioPath: hasLocalAudio ? mediaRecord.audioFilePath! : undefined,
                    audioBuffer: remoteAudioBuffer,
                    model,
                    provider: 'cloudflare',
                    cloudflareConfig: {
                        accountId: CLOUDFLARE_ACCOUNT_ID,
                        apiToken: CLOUDFLARE_API_TOKEN,
                    },
                })
                vttContent = transcriptionResult.vtt
                transcriptionWords = transcriptionResult.words
            }
        } else {
            // Validate local Whisper configuration
            if (!WHISPER_CPP_PATH) {
                logger.error('transcription', 'Whisper.cpp path is not configured')
                throw new Error(
                    'WHISPER_CPP_PATH is not set in the environment variables.',
                )
            }

            logger.info('transcription', `Using local Whisper provider with model ${model}`)
            const transcriptionResult = await transcribeWithWhisper({
                audioPath: hasLocalAudio ? mediaRecord.audioFilePath! : (tempAudioPath as string),
                model,
                provider: 'local',
                whisperProjectPath: WHISPER_CPP_PATH,
            })
            vttContent = transcriptionResult.vtt
            transcriptionWords = transcriptionResult.words
        }

		// 验证并标准化VTT格式
		const validation = validateVttContent(vttContent)
		if (!validation.isValid) {
			logger.warn('transcription', `VTT format validation failed for ${provider}: ${validation.errors.join(', ')}`)

			// 尝试标准化格式
			vttContent = normalizeVttContent(vttContent)

			// 重新验证
			const revalidation = validateVttContent(vttContent)
			if (revalidation.isValid) {
				logger.info('transcription', `Successfully normalized VTT format for ${provider}`)
			} else {
				logger.error('transcription', `Failed to normalize VTT format for ${provider}: ${revalidation.errors.join(', ')}`)
				throw new Error(`Invalid VTT format from ${provider} transcription: ${revalidation.errors.join(', ')}`)
			}
		}

		await db
			.update(schema.media)
			.set({
				transcription: vttContent,
				transcriptionWords: transcriptionWords,
			})
			.where(eq(schema.media.id, mediaId))

        // Cleanup temp file if any
        try {
            if (tempAudioPath) await fs.unlink(tempAudioPath).catch(() => {})
        } catch {}

        logger.info('transcription', `Transcription completed successfully for media ${mediaId}`)
        return { success: true, transcription: vttContent }
	})

const translateInput = z.object({
	mediaId: z.string(),
	model: z.enum(AIModelIds),
	promptId: z.string().default(DEFAULT_TRANSLATION_PROMPT_ID).optional(),
})

export const translate = os.input(translateInput).handler(async ({ input }) => {
	const { mediaId, model, promptId } = input

	const where = eq(schema.media.id, mediaId)

	const media = await db.query.media.findFirst({
		where,
	})

    if (!media?.transcription && !media?.optimizedTranscription) {
        throw new Error('Transcription not found')
    }

	// 使用配置化的提示词（用于约束说明）
	const promptConfig = getTranslationPrompt(promptId || DEFAULT_TRANSLATION_PROMPT_ID)
	if (!promptConfig) {
		throw new Error(`Invalid translation prompt ID: ${promptId}`)
	}

	logger.info('translation', `Using translation prompt: ${promptConfig.name} for media ${mediaId}`)
	const sourceVtt = media.optimizedTranscription || media.transcription!
	logger.info('translation', `Preparing to translate ${sourceVtt.length} characters for media ${mediaId} with model ${model}`)

    // 解析原始 VTT 片段，作为时间轴的唯一来源
    const originalCues = parseVttCues(sourceVtt)
    if (!originalCues || originalCues.length === 0) {
        throw new Error('Source VTT has no cues to translate')
    }

    // 压缩输入载荷（减少无关噪声）
    const compact = originalCues.map((c) => ({
        start: c.start,
        end: c.end,
        text: c.lines.join(' ').replace(/\s+/g, ' ').trim(),
    }))

    // 结构化输出 schema
    const Schema = z.object({
        cues: z.array(
            z.object({
                start: z.string(),
                end: z.string(),
                en: z.string().optional().default(''),
                zh: z.string(),
            }),
        ).min(1),
    })

    // 严格 JSON 指令（生成对象）
    const system = `You are a subtitle translator that outputs JSON only. Translate English to Chinese.
Strict rules:
- Keep timestamps (start, end) EXACTLY as provided
- Produce the SAME number of cues, same order
- For each cue: keep 'en' as concise English (optionally identical to input, without trailing punctuation), and 'zh' as natural Chinese
- Do NOT add bullets, dashes, or extra commentary
- Remove trailing sentence-ending punctuation in both languages
- Output strictly valid JSON matching the provided schema`

    const prompt = `Original WebVTT cues (timestamps + text):\n${JSON.stringify(compact)}\n\nReturn JSON with shape { cues: [{ start, end, en, zh }] } only.`

    // 主路径：统一使用 generateObject（不再使用自由文本兜底）
    let objectCues: Array<{ start: string; end: string; en?: string; zh: string }>
    try {
        const { object } = await generateObject({ model, system, prompt, schema: Schema })
        const out = Array.isArray(object?.cues) ? object.cues : []
        if (!out.length) throw new Error('Empty cues from structured translation')
        objectCues = out
        logger.info('translation', `Structured translation produced ${out.length} items for media ${mediaId}`)
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        logger.error('translation', `Structured translation failed for media ${mediaId}: ${msg}`)
        throw new Error(`Structured translation failed: ${msg}`)
    }

    // 由结构化结果 + 原始时间戳重建 VTT
    const pairs = originalCues.map((c, i) => {
        const enFallback = c.lines.join(' ').trim()
        const rawEn = (objectCues[i]?.en ?? enFallback).trim()
        const rawZh = (objectCues[i]?.zh ?? '').trim()
        const clean = (s: string) => s.replace(/^[-•\s]+/, '').replace(/[.,!?，。！？]$/g, '').trim()
        const enText = clean(rawEn || enFallback)
        const zhText = clean(rawZh || rawEn || enFallback)
        const lines = [enText, zhText]
        return { start: c.start, end: c.end, lines }
    })
    const rebuilt = serializeVttCues(pairs)
    const vtt = rebuilt.trim().startsWith('WEBVTT') ? rebuilt : `WEBVTT\n\n${rebuilt}`
    const check = validateVttContent(vtt)
    if (!check.cues.length) throw new Error('Rebuilt VTT has 0 cues')

    await db.update(schema.media).set({ translation: vtt }).where(where)
    return { translation: vtt }
})

// 使用新架构中的Schema，移除重复定义

export const render = os
    .input(
        z.object({
            mediaId: z.string(),
            subtitleConfig: subtitleRenderConfigSchema.optional(),
            backend: z.enum(['local', 'cloud']).optional().default('local'),
        }),
    )
    .handler(async ({ input }) => {
        const where = eq(schema.media.id, input.mediaId)
        const media = await db.query.media.findFirst({
            where,
        })

		if (!media) {
			throw new Error('Media not found')
		}

		if (!media.translation) {
			throw new Error('Translation not found')
		}

		if (!media.filePath) {
			throw new Error('Media file path not found')
		}

        if (input.backend === 'cloud') {
            const job = await startCloudJob({
                mediaId: media.id,
                engine: 'burner-ffmpeg',
                options: { subtitleConfig: input.subtitleConfig },
            })
            return { message: 'Cloud render queued', jobId: job.jobId }
        }

        const operationDir = path.join(OPERATIONS_DIR, media.id)
        await fs.mkdir(operationDir, { recursive: true })

        const originalFilePath = media.filePath
        const outputPath = path.join(operationDir, RENDERED_VIDEO_FILENAME)

        // Pass subtitle content directly instead of writing to file
        await renderVideoWithSubtitles(
            originalFilePath,
            media.translation,
            outputPath,
            input.subtitleConfig,
        )

        await db
            .update(schema.media)
            .set({ videoWithSubtitlesPath: outputPath })
            .where(where)

        return {
            message: 'Rendering started',
        }
    })

export const updateTranslation = os
	.input(
		z.object({
			mediaId: z.string(),
			translation: z.string(),
		}),
	)
	.handler(async ({ input }) => {
		const where = eq(schema.media.id, input.mediaId)
		await db
			.update(schema.media)
			.set({ translation: input.translation })
			.where(where)
		return { success: true }
	})

export const deleteTranslationCue = os
	.input(
		z.object({
			mediaId: z.string(),
			index: z.number().min(0),
		}),
	)
	.handler(async ({ input }) => {
		const where = eq(schema.media.id, input.mediaId)
		const media = await db.query.media.findFirst({ where })
		if (!media?.translation) throw new Error('Translation not found')
		const cues = parseVttCues(media.translation)
		if (input.index < 0 || input.index >= cues.length)
			throw new Error('Cue index out of range')
		cues.splice(input.index, 1)
    const updated = serializeVttCues(cues)
    await db.update(schema.media).set({ translation: updated }).where(where)
    return { success: true, translation: updated }
})

// Cloud rendering: start job explicitly
export const startCloudRender = os
    .input(
        z.object({
            mediaId: z.string(),
            subtitleConfig: subtitleRenderConfigSchema.optional(),
        }),
    )
    .handler(async ({ input }) => {
        const where = eq(schema.media.id, input.mediaId)
        const media = await db.query.media.findFirst({ where })
        if (!media) throw new Error('Media not found')
        if (!media.translation) throw new Error('Translation not found')

        const job = await startCloudJob({
            mediaId: media.id,
            engine: 'burner-ffmpeg',
            options: { subtitleConfig: input.subtitleConfig },
        })
        return { jobId: job.jobId }
    })

// Cloud rendering: get status
export const getRenderStatus = os
    .input(z.object({ jobId: z.string().min(1) }))
    .handler(async ({ input }) => {
        const status = await getJobStatus(input.jobId)
        return status
    })

// Optimize transcription using per-word timings + AI segmentation
export const optimizeTranscription = os
    .input(
        z.object({
            mediaId: z.string(),
            model: z.enum(AIModelIds),
            pauseThresholdMs: z.number().min(0).max(5000).default(480),
            maxSentenceMs: z.number().min(1000).max(30000).default(8000),
            maxChars: z.number().min(10).max(160).default(68),
            lightCleanup: z.boolean().optional().default(false),
            textCorrect: z.boolean().optional().default(false),
        }),
    )
    .handler(async ({ input }) => {
        const { mediaId, model, pauseThresholdMs, maxSentenceMs, maxChars, lightCleanup, textCorrect } = input
        const where = eq(schema.media.id, mediaId)
        const media = await db.query.media.findFirst({ where })

        if (!media) throw new Error('Media not found')
        if (!media.transcription) throw new Error('Transcription not found')
        const words = media.transcriptionWords
        if (!words || words.length === 0) {
            throw new Error('Optimization unavailable: no per‑word timings. Use Cloudflare transcription.')
        }

        // Build candidate breaks using heuristics
        const candidates = buildCandidateBreaks(words, {
            pauseThresholdMs,
            maxSentenceMs,
            maxChars,
        })

        // Ask AI to finalize segmentation based on words + candidates
        let segments = await buildSegmentsByAI({ words, candidates, model, maxChars, maxSentenceMs })

        // Orphan-guard pass: merge very short leading fragments when the gap is tiny
        segments = applyOrphanGuard(segments, words, { maxOrphanWords: 2, maxGapMs: 300 })
        segments = applyPhraseGuard(segments, words, { maxLeadingWords: 1, maxGapMs: 450 })

        // Compose VTT
        let optimizedVtt = segmentsToVtt(words, segments)

        // Optional text-only correction while preserving VTT structure exactly
        if (textCorrect) {
            const system = `You are an English proofreader. You will receive the content of a WebVTT file.
Your task: fix minor spelling/grammar errors ONLY.
Strict constraints:
- Preserve the VTT structure EXACTLY (timestamps, order, line breaks, number of lines per cue)
- Do NOT add or remove cues or timestamps
- Do NOT merge or split lines
- Do NOT change punctuation spacing except to fix actual typos
- Keep all non-English tokens unchanged.
Return the corrected VTT content as-is.`
            try {
                const { text } = await import('~/lib/ai/chat').then(m => m.generateText({
                    model,
                    system,
                    prompt: optimizedVtt,
                }))
                const v = text.trim()
                const check = validateVttContent(v)
                if (check.isValid) {
                    optimizedVtt = v
                }
            } catch (err) {
                logger.warn('transcription', `Text correction skipped: ${err instanceof Error ? err.message : String(err)}`)
            }
        }

        // Validate VTT before persisting
        const validation = validateVttContent(optimizedVtt)
        if (!validation.isValid) {
            throw new Error(`Optimized VTT validation failed: ${validation.errors.join(', ')}`)
        }

        await db.update(schema.media).set({ optimizedTranscription: optimizedVtt }).where(where)
        return { optimizedTranscription: optimizedVtt }
    })

// Restore transcription from original backup if available
export const clearOptimizedTranscription = os
    .input(z.object({ mediaId: z.string() }))
    .handler(async ({ input }) => {
        const where = eq(schema.media.id, input.mediaId)
        await db.update(schema.media).set({ optimizedTranscription: null }).where(where)
        return { success: true }
    })
