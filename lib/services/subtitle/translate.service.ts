import { eq } from 'drizzle-orm'
import { db, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import { parseVttCues, serializeVttCues, validateVttContent } from '~/lib/subtitle/utils/vtt'
import { generateObject } from '~/lib/ai/chat'
import { putObjectByKey, upsertMediaManifest } from '~/lib/cloudflare'
import { getTranslationPrompt, DEFAULT_TRANSLATION_PROMPT_ID } from '~/lib/subtitle/config/prompts'
import { z } from 'zod'

export async function translate(input: { mediaId: string; model: string; promptId?: string }): Promise<{ translation: string }> {
  const { mediaId, model, promptId } = input
  const where = eq(schema.media.id, mediaId)
  const media = await db.query.media.findFirst({ where })
  if (!media?.transcription && !media?.optimizedTranscription) throw new Error('Transcription not found')

  const promptConfig = getTranslationPrompt(promptId || DEFAULT_TRANSLATION_PROMPT_ID)
  if (!promptConfig) throw new Error(`Invalid translation prompt ID: ${promptId}`)
  logger.info('translation', `Using translation prompt: ${promptConfig.name} for media ${mediaId}`)

  const sourceVtt = media.optimizedTranscription || media.transcription!
  logger.info('translation', `Preparing to translate ${sourceVtt.length} characters for media ${mediaId} with model ${model}`)

  const originalCues = parseVttCues(sourceVtt)
  if (!originalCues || originalCues.length === 0) throw new Error('Source VTT has no cues to translate')
  const compact = originalCues.map((c) => ({ start: c.start, end: c.end, text: c.lines.join(' ').replace(/\s+/g, ' ').trim() }))

  const Schema = z.object({
    cues: z.array(z.object({ start: z.string(), end: z.string(), en: z.string().optional().default(''), zh: z.string() })).min(1),
  })

  const system = `You are a subtitle translator that outputs JSON only. Translate English to Chinese.
Strict rules:
- Keep timestamps (start, end) EXACTLY as provided
- Produce the SAME number of cues, same order
- For each cue: keep 'en' as concise English (optionally identical to input, without trailing punctuation), and 'zh' as natural Chinese
- Do NOT add bullets, dashes, or extra commentary
- Remove trailing sentence-ending punctuation in both languages
- Output strictly valid JSON matching the provided schema`

  const prompt = `Original WebVTT cues (timestamps + text):\n${JSON.stringify(compact)}\n\nReturn JSON with shape { cues: [{ start, end, en, zh }] } only.`

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
  try {
    const vttKey = `inputs/subtitles/${mediaId}.vtt`
    await putObjectByKey(vttKey, 'text/vtt', vtt)
    await upsertMediaManifest(mediaId, { vttKey })
    logger.info('translation', `Translated VTT materialized: ${vttKey}`)
  } catch (err) {
    logger.warn('translation', `Translate materialization skipped: ${err instanceof Error ? err.message : String(err)}`)
  }
  return { translation: vtt }
}

