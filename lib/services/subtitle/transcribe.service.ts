import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { eq } from 'drizzle-orm'
import { getDb, schema, type TranscriptionWord } from '~/lib/db'
import { logger } from '~/lib/logger'
import { transcribeWithWhisper } from '~/lib/asr/whisper'

import {
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_API_TOKEN,
  WHISPER_CPP_PATH,
} from '~/lib/config/app.config'
import { validateVttContent, normalizeVttContent } from '~/lib/subtitle/utils/vtt'
import { putObjectByKey, upsertMediaManifest, presignGetByKey, startCloudJob, getJobStatus } from '~/lib/cloudflare'
import { bucketPaths } from '~/lib/storage/bucket-paths'

export async function transcribe(input: {
  mediaId: string
  model: 'whisper-large' | 'whisper-medium' | 'whisper-tiny-en' | 'whisper-large-v3-turbo'
  provider: 'local' | 'cloudflare'
  downsampleBackend?: 'auto' | 'local' | 'cloud'
}): Promise<{ success: true; transcription: string; words?: TranscriptionWord[] }> {
  const { mediaId, model, provider } = input

  logger.info('transcription', `Starting transcription for media ${mediaId} with ${provider}/${model}`)

  const db = await getDb()
  const mediaRecord = await db.query.media.findFirst({ where: eq(schema.media.id, mediaId) })
  if (!mediaRecord) {
    logger.error('transcription', 'Media not found')
    throw new Error('Media not found.')
  }

  let vttContent: string
  let transcriptionWords: TranscriptionWord[] | undefined
  let tempAudioPath: string | undefined
  let remoteAudioBuffer: ArrayBuffer | undefined
  const downsampleBackend = input.downsampleBackend || 'auto'
  const useCloudDownsample =
    provider === 'cloudflare' &&
    (downsampleBackend === 'cloud' ||
      (downsampleBackend === 'auto' &&
        (Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) ||
          process.env.FORCE_CLOUD_DOWNSAMPLE === 'true')))

  // Resolve audio source: prefer local audioFilePath; otherwise try remoteAudioKey
  const hasLocalAudio = Boolean(mediaRecord.audioFilePath)
  if (!hasLocalAudio) {
    if (mediaRecord.remoteAudioKey) {
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
    const useAsrPipeline = Boolean(useCloudDownsample && mediaRecord.remoteAudioKey)
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
      const targetBytes = Number(process.env.CLOUDFLARE_ASR_MAX_UPLOAD_BYTES || 4 * 1024 * 1024)
      const sampleRate = Number(process.env.ASR_SAMPLE_RATE || 16000)
      const targetBitrates = (process.env.ASR_TARGET_BITRATES || '48,24')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
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
      logger.info('transcription', `Cloud ASR job started: ${job.jobId} (maxBytes=${targetBytes}, bitrates=[${targetBitrates.join(',')}], sr=${sampleRate})`)
      const startedAt = Date.now()
      let lastStatus = 'queued'
      let vttUrl: string | undefined
      let wordsUrl: string | undefined
      while (Date.now() - startedAt < 180_000) {
        const st = await getJobStatus(job.jobId)
        lastStatus = st.status
        logger.debug('transcription', `Cloud ASR status for ${job.jobId}: ${st.status} phase=${st.phase ?? '-'} progress=${st.progress ?? '-'}`)
        if (st.status === 'completed') {
          vttUrl = st.outputs?.vtt?.url
          wordsUrl = st.outputs?.words?.url
          break
        }
        if (st.status === 'failed' || st.status === 'canceled') {
          const msg = st.message || 'Cloud ASR pipeline failed'
          throw new Error(`job ${job.jobId}: ${msg}`)
        }
        await new Promise((r) => setTimeout(r, 1200))
      }
      if (!vttUrl) throw new Error(`Cloud ASR pipeline timeout for ${job.jobId}; last status=${lastStatus}`)
      const vttResp = await fetch(vttUrl)
      if (!vttResp.ok) throw new Error(`fetch vtt failed: ${vttResp.status}`)
      vttContent = await vttResp.text()
      if (wordsUrl) {
        try {
          const wr = await fetch(wordsUrl)
          if (wr.ok) transcriptionWords = await wr.json() as TranscriptionWord[]
        } catch {}
      }
    } else {
      const transcriptionResult = await transcribeWithWhisper({
        audioPath: hasLocalAudio ? (mediaRecord.audioFilePath as string) : undefined,
        audioBuffer: remoteAudioBuffer,
        model,
        provider: 'cloudflare',
        cloudflareConfig: { accountId: CLOUDFLARE_ACCOUNT_ID as string, apiToken: CLOUDFLARE_API_TOKEN as string },
      })
      vttContent = transcriptionResult.vtt
      transcriptionWords = transcriptionResult.words
    }
  } else {
    if (!WHISPER_CPP_PATH) {
      logger.error('transcription', 'Whisper.cpp path is not configured')
      throw new Error('WHISPER_CPP_PATH is not set in the environment variables.')
    }
    logger.info('transcription', `Using local Whisper provider with model ${model}`)
    const transcriptionResult = await transcribeWithWhisper({
      audioPath: hasLocalAudio ? (mediaRecord.audioFilePath as string) : (tempAudioPath as string),
      model,
      provider: 'local',
      whisperProjectPath: WHISPER_CPP_PATH as string,
    })
    vttContent = transcriptionResult.vtt
    transcriptionWords = transcriptionResult.words
  }

  // Validate/normalize VTT
  const validation = validateVttContent(vttContent)
  if (!validation.isValid) {
    logger.warn('transcription', `VTT format validation failed for ${provider}: ${validation.errors.join(', ')}`)
    vttContent = normalizeVttContent(vttContent)
    const revalidation = validateVttContent(vttContent)
    if (!revalidation.isValid) {
      logger.error('transcription', `Failed to normalize VTT format for ${provider}: ${revalidation.errors.join(', ')}`)
      throw new Error(`Invalid VTT format from ${provider} transcription: ${revalidation.errors.join(', ')}`)
    }
  }

  await db.update(schema.media).set({ transcription: vttContent, transcriptionWords }).where(eq(schema.media.id, mediaId))
  try {
    const vttKey = bucketPaths.inputs.subtitles(mediaId)
    await putObjectByKey(vttKey, 'text/vtt', vttContent)
    await upsertMediaManifest(mediaId, { vttKey })
    logger.info('transcription', `VTT materialized to bucket: ${vttKey}`)
  } catch (err) {
    logger.warn('transcription', `VTT materialization skipped: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    if (tempAudioPath) await fs.unlink(tempAudioPath).catch(() => {})
  } catch {}

  logger.info('transcription', `Transcription completed successfully for media ${mediaId}`)
  return { success: true, transcription: vttContent, words: transcriptionWords }
}
