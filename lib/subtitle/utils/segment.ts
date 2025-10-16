import { z } from 'zod'
import type { TranscriptionWord } from '~/lib/db/schema'
import { formatVttTimestamp } from '~/lib/subtitle/utils/time'
import { createVttDocument } from '~/lib/subtitle/utils/vtt'
import { generateObject } from '~/lib/ai/chat'
import type { AIModelId } from '~/lib/ai/models'

export interface OptimizeParams {
    pauseThresholdMs: number
    maxSentenceMs: number
    maxChars: number
}

export interface Segment {
    startIndex: number
    endIndex: number
}

function isPunctuation(token: string): boolean {
    // Treat as punctuation only if the whole token is punctuation marks
    // Avoid gluing tokens like "software." to the previous word
    return /^[\.,!?;:，。！？、…]+$/.test(token)
}

export function wordsSliceToText(words: TranscriptionWord[], start: number, end: number): string {
    const parts: string[] = []
    for (let i = start; i <= end; i++) {
        const w = words[i]?.word ?? ''
        if (!w) continue

        // Normalize common hyphenation artifact: preceding space before hyphenated continuation
        // Example: ["pre", "-made"] => "pre-made"
        const prev = parts[parts.length - 1] || ''
        const isHyphenContinuation = /^-[A-Za-z]+[\.,!?;:，。！？、…]*$/.test(w)

        if (parts.length === 0) {
            parts.push(w)
            continue
        }

        if (isHyphenContinuation && prev) {
            parts[parts.length - 1] = `${prev}${w}` // join without extra space
            continue
        }

        if (isPunctuation(w)) {
            parts[parts.length - 1] = `${prev}${w}`
        } else {
            parts.push(w)
        }
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim()
}

// Build heuristic candidate breakpoints using gaps, punctuation and max constraints.
export function buildCandidateBreaks(
    words: TranscriptionWord[],
    params: OptimizeParams,
): number[] {
    const { pauseThresholdMs, maxSentenceMs, maxChars } = params
    const breaks: number[] = []
    if (!words.length) return breaks

    let sentenceStart = 0
    let sentenceCharCount = 0
    let sentenceStartTime = words[0].start

    for (let i = 0; i < words.length - 1; i++) {
        const cur = words[i]
        const nxt = words[i + 1]
        const gapMs = (nxt.start - cur.end) * 1000
        sentenceCharCount += String(cur.word).length + 1
        const durationMs = (cur.end - sentenceStartTime) * 1000

        const shouldBreakByGap = gapMs > pauseThresholdMs
        const shouldBreakByDuration = durationMs >= maxSentenceMs
        const shouldBreakByChars = sentenceCharCount >= maxChars
        const shouldBreakByPunct = isPunctuation(cur.word)

        if (shouldBreakByDuration || shouldBreakByChars || shouldBreakByGap || shouldBreakByPunct) {
            breaks.push(i)
            sentenceStart = i + 1
            sentenceCharCount = 0
            sentenceStartTime = words[sentenceStart]?.start ?? sentenceStartTime
        }
    }
    // Always end with last word
    breaks.push(words.length - 1)
    return breaks
}

const SegmentsSchema = z.object({
    segments: z
        .array(
            z.object({
                startIndex: z.number().int().nonnegative(),
                endIndex: z.number().int().nonnegative(),
                text: z.string().optional(),
            }),
        )
        .min(1),
})

export async function buildSegmentsByAI(args: {
    words: TranscriptionWord[]
    candidates: number[]
    model: AIModelId
    maxChars: number
    maxSentenceMs: number
}): Promise<Segment[]> {
    const { words, candidates, model, maxChars, maxSentenceMs } = args

    // Prepare compact tokens snapshot to keep prompt size reasonable
    const tokens = words.map((w, i) => ({ i, t: w.word }))
    const candidateEnds = candidates

    const system = `You segment a sequence of tokenized words into natural spoken sentences for subtitles.
Rules:
- Preserve original word order
- Segments must be contiguous, non-overlapping, and cover all tokens
- Prefer breaking at punctuation and natural pauses (candidates provided)
- Keep each sentence concise (<= ${maxChars} chars if possible) and not too long in time (~${Math.round(
        maxSentenceMs / 1000,
    )}s)
- Output strictly JSON with segments array: [{ startIndex, endIndex }]
`

    const prompt = `Tokens (index:i, token:t):\n${JSON.stringify(tokens)}\n\nCandidate sentence ends (indices):\n${JSON.stringify(candidateEnds)}\n\nReturn JSON only.`

    try {
        const { object } = await generateObject({
            model,
            system,
            prompt,
            schema: SegmentsSchema,
        })
        const segs = object.segments
            .map((s) => ({ startIndex: s.startIndex, endIndex: s.endIndex }))
            .filter((s) => s.startIndex <= s.endIndex)
        if (segs.length) return ensureCoverAllTokens(segs, words.length)
    } catch {
        // fall back below
    }

    // Fallback to heuristic candidates as contiguous segments
    const segs: Segment[] = []
    let start = 0
    for (const end of candidateEnds) {
        segs.push({ startIndex: start, endIndex: end })
        start = end + 1
    }
    return ensureCoverAllTokens(segs, words.length)
}

function ensureCoverAllTokens(segments: Segment[], wordCount: number): Segment[] {
    if (!segments.length) return []
    const fixed: Segment[] = []
    let cursor = 0
    for (const s of segments) {
        const start = Math.max(cursor, Math.min(s.startIndex, wordCount - 1))
        const end = Math.max(start, Math.min(s.endIndex, wordCount - 1))
        if (start > cursor) {
            fixed.push({ startIndex: cursor, endIndex: start - 1 })
        }
        fixed.push({ startIndex: start, endIndex: end })
        cursor = end + 1
        if (cursor >= wordCount) break
    }
    if (cursor < wordCount) fixed.push({ startIndex: cursor, endIndex: wordCount - 1 })
    return fixed
}

export function applyOrphanGuard(
    segments: Segment[],
    words: TranscriptionWord[],
    opts: { maxOrphanWords: number; maxGapMs: number },
): Segment[] {
    const out: Segment[] = []
    for (let i = 0; i < segments.length; i++) {
        const cur = out[out.length - 1]
        const seg = segments[i]
        if (!cur) {
            out.push(seg)
            continue
        }
        // Check the gap between cur end and seg start
        const prevEndTime = words[cur.endIndex]?.end ?? 0
        const nextStartTime = words[seg.startIndex]?.start ?? prevEndTime
        const gapMs = Math.max(0, (nextStartTime - prevEndTime) * 1000)
        const nextLen = seg.endIndex - seg.startIndex + 1
        if (gapMs <= opts.maxGapMs && nextLen <= opts.maxOrphanWords) {
            // Merge orphan into previous
            cur.endIndex = seg.endIndex
            continue
        }
        out.push(seg)
    }
    return out
}

export function applyPhraseGuard(
    segments: Segment[],
    words: TranscriptionWord[],
    opts: { maxLeadingWords?: number; maxGapMs?: number },
): Segment[] {
    const maxLeadingWords = opts.maxLeadingWords ?? 1
    const maxGapMs = opts.maxGapMs ?? 350
    const SENTENCE_END = /[.!?。！？]$/
    const nouns = new Set([
        'code', 'box', 'software', 'interface', 'text', 'tools', 'context', 'eyes', 'surface', 'example', 'approach', 'experiment'
    ])
    const out: Segment[] = []
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]
        if (out.length === 0) {
            out.push({ ...seg })
            continue
        }
        const prev = out[out.length - 1]
        const prevLast = (words[prev.endIndex]?.word || '').trim()
        const gapMs = Math.max(0, ((words[seg.startIndex]?.start ?? 0) - (words[prev.endIndex]?.end ?? 0)) * 1000)
        if (gapMs > maxGapMs) {
            out.push({ ...seg })
            continue
        }
        const startsWithPunct = (w: string) => /^[\.,!?;:，。！？、…]+$/.test(w)
        let moved = 0
        let newStart = seg.startIndex
        while (moved < maxLeadingWords && newStart <= seg.endIndex) {
            const w = (words[newStart]?.word || '').trim()
            if (!w || startsWithPunct(w)) break
            const base = w.replace(/[\.,!?;:，。！？、…]+$/, '').toLowerCase()
            const isShortNoun = base.length > 0 && base.length <= 6 && (nouns.has(base) || /^[a-z]{1,6}$/.test(base))
            const prevLooksOpen = !SENTENCE_END.test(prevLast) || prevLast.includes('-') || /pre-[a-z]+/i.test(prevLast)
            if (isShortNoun && prevLooksOpen) {
                // Move this leading token into previous segment
                prev.endIndex = newStart
                newStart += 1
                moved += 1
                continue
            }
            break
        }
        if (moved > 0) {
            if (newStart > seg.endIndex) {
                // Entire next seg consumed
                continue
            }
            out.push({ startIndex: newStart, endIndex: seg.endIndex })
        } else {
            out.push({ ...seg })
        }
    }
    return out
}

// Note: two-line balancing has been removed per product requirement.

export function segmentsToVtt(
    words: TranscriptionWord[],
    segments: Segment[],
): string {
    const cues = segments.map((seg) => {
        const startTime = words[seg.startIndex]?.start ?? 0
        const endTime = words[seg.endIndex]?.end ?? startTime + 0.5
        const start = formatVttTimestamp(startTime)
        const end = formatVttTimestamp(endTime)
        const text = wordsSliceToText(words, seg.startIndex, seg.endIndex)
        return { start, end, lines: [text] }
    })
    return createVttDocument(cues)
}
