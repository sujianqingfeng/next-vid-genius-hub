import { eq } from 'drizzle-orm'
import { db, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import { parseVttCues, serializeVttCues, validateVttContent } from '~/lib/subtitle/utils/vtt'
import { buildCandidateBreaks, buildSegmentsByAI, segmentsToVtt, applyOrphanGuard, applyPhraseGuard } from '~/lib/subtitle/utils/segment'
import { putObjectByKey, upsertMediaManifest } from '~/lib/cloudflare'

export async function updateTranslation(input: { mediaId: string; translation: string }): Promise<{ success: true }> {
  const where = eq(schema.media.id, input.mediaId)
  await db.update(schema.media).set({ translation: input.translation }).where(where)
  try {
    const vttKey = `inputs/subtitles/${input.mediaId}.vtt`
    await putObjectByKey(vttKey, 'text/vtt', input.translation)
    await upsertMediaManifest(input.mediaId, { vttKey })
    logger.info('translation', `Translated VTT materialized (manual update): ${vttKey}`)
  } catch (err) {
    logger.warn('translation', `Materialization (manual update) skipped: ${err instanceof Error ? err.message : String(err)}`)
  }
  return { success: true }
}

export async function deleteTranslationCue(input: { mediaId: string; index: number }): Promise<{ success: true; translation: string }> {
  const where = eq(schema.media.id, input.mediaId)
  const media = await db.query.media.findFirst({ where })
  if (!media?.translation) throw new Error('Translation not found')
  const cues = parseVttCues(media.translation)
  if (input.index < 0 || input.index >= cues.length) throw new Error('Cue index out of range')
  cues.splice(input.index, 1)
  const updated = serializeVttCues(cues)
  await db.update(schema.media).set({ translation: updated }).where(where)
  return { success: true, translation: updated }
}

export async function optimizeTranscription(input: {
  mediaId: string
  model: string
  pauseThresholdMs: number
  maxSentenceMs: number
  maxChars: number
  lightCleanup?: boolean
  textCorrect?: boolean
}): Promise<{ optimizedTranscription: string }> {
  const { mediaId, model, pauseThresholdMs, maxSentenceMs, maxChars, lightCleanup, textCorrect } = input
  const where = eq(schema.media.id, mediaId)
  const media = await db.query.media.findFirst({ where })
  if (!media) throw new Error('Media not found')
  if (!media.transcription) throw new Error('Transcription not found')
  const words = media.transcriptionWords
  if (!words || words.length === 0) {
    throw new Error('Optimization unavailable: no per‑word timings. Use Cloudflare transcription.')
  }

  const candidates = buildCandidateBreaks(words, { pauseThresholdMs, maxSentenceMs, maxChars })
  let segments = await buildSegmentsByAI({ words, candidates, model, maxChars, maxSentenceMs })
  segments = applyOrphanGuard(segments, words, { maxOrphanWords: 2, maxGapMs: 300 })
  segments = applyPhraseGuard(segments, words, { maxLeadingWords: 1, maxGapMs: 450 })

  let optimizedVtt = segmentsToVtt(words, segments)
  if (textCorrect || lightCleanup) {
    const ops: string[] = []
    if (textCorrect) ops.push('fix minor English spelling/grammar only')
    if (lightCleanup) ops.push('collapse multiple spaces', 'remove leading bullets/dashes (e.g., -, •) at line starts', 'remove trailing sentence-ending punctuation in both languages (.,!?，。！？…)')
    const system = `You receive the content of a WebVTT file. Perform the following operations conservatively: ${ops.join('; ')}.
Strict constraints:
- Preserve the VTT structure EXACTLY (timestamps, order, number of cues, number of lines per cue)
- Do NOT add, remove, merge, or split cues/lines
- Do NOT change timestamps or their formatting
- Keep non-English tokens unchanged
- Output the cleaned VTT content as-is, no extra commentary`
    try {
      const { text } = await import('~/lib/ai/chat').then((m) => m.generateText({ model, system, prompt: optimizedVtt }))
      const v = text.trim()
      const check = validateVttContent(v)
      if (check.isValid) optimizedVtt = v
    } catch (err) {
      logger.warn('transcription', `Post-process (lightCleanup/textCorrect) skipped: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const validation = validateVttContent(optimizedVtt)
  if (!validation.isValid) throw new Error(`Optimized VTT validation failed: ${validation.errors.join(', ')}`)

  await db.update(schema.media).set({ optimizedTranscription: optimizedVtt }).where(where)
  return { optimizedTranscription: optimizedVtt }
}

export async function clearOptimizedTranscription(input: { mediaId: string }): Promise<{ success: true }> {
  const where = eq(schema.media.id, input.mediaId)
  await db.update(schema.media).set({ optimizedTranscription: null }).where(where)
  return { success: true }
}

