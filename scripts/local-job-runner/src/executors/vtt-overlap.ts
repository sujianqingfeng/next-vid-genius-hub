type ParsedCue = {
	start: number
	end: number
	lines: string[]
}

const TIMING_LINE_RE =
	/^(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})/

function parseTimestampSeconds(raw: string): number | null {
	const normalized = raw.trim().replace(',', '.')
	const parts = normalized.split(':')
	if (parts.length !== 2 && parts.length !== 3) return null
	const hh = parts.length === 3 ? Number(parts[0]) : 0
	const mm = Number(parts.length === 3 ? parts[1] : parts[0])
	const secPart = parts.length === 3 ? parts[2] : parts[1]
	const [ssRaw, msRaw = '0'] = String(secPart).split('.')
	const ss = Number(ssRaw)
	const ms = Number(msRaw.padEnd(3, '0').slice(0, 3))
	if (
		!Number.isFinite(hh) ||
		!Number.isFinite(mm) ||
		!Number.isFinite(ss) ||
		!Number.isFinite(ms)
	) {
		return null
	}
	return hh * 3600 + mm * 60 + ss + ms / 1000
}

function formatTimestamp(seconds: number): string {
	const safe = Math.max(0, Number(seconds) || 0)
	const totalMillis = Math.round(safe * 1000)
	const hours = Math.floor(totalMillis / 3600000)
	const minutes = Math.floor((totalMillis % 3600000) / 60000)
	const secs = Math.floor((totalMillis % 60000) / 1000)
	const millis = totalMillis % 1000
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
		2,
		'0',
	)}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

function parseCues(vtt: string): ParsedCue[] {
	const lines = String(vtt || '')
		.replace(/^\uFEFF/, '')
		.split(/\r?\n/)
	const cues: ParsedCue[] = []

	for (let i = 0; i < lines.length; i++) {
		const current = String(lines[i] || '').trim()
		if (!current) continue

		let timingLine = current
		if (!TIMING_LINE_RE.test(timingLine)) {
			const next = String(lines[i + 1] || '').trim()
			if (!TIMING_LINE_RE.test(next)) continue
			i += 1
			timingLine = next
		}

		const match = timingLine.match(TIMING_LINE_RE)
		if (!match) continue
		const start = parseTimestampSeconds(match[1] || '')
		const end = parseTimestampSeconds(match[2] || '')
		if (start == null || end == null) continue

		const textLines: string[] = []
		let j = i + 1
		while (j < lines.length) {
			const line = String(lines[j] || '')
			if (line.trim().length === 0) break
			if (TIMING_LINE_RE.test(line.trim())) break
			textLines.push(line.trimEnd())
			j += 1
		}
			i = j - 1

		const normalizedLines = textLines.filter((line) => line.trim().length > 0)
		if (normalizedLines.length === 0) continue
		cues.push({ start, end, lines: normalizedLines })
	}

	return cues
}

function serializeCues(cues: ParsedCue[]): string {
	const out = ['WEBVTT', '']
	for (let i = 0; i < cues.length; i++) {
		const cue = cues[i]!
		out.push(String(i + 1))
		out.push(`${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}`)
		out.push(...cue.lines)
		out.push('')
	}
	return `${out.join('\n')}\n`
}

function countOverlaps(cues: ParsedCue[]): number {
	let overlaps = 0
	for (let i = 1; i < cues.length; i++) {
		const prev = cues[i - 1]!
		const curr = cues[i]!
		if (curr.start < prev.end - 0.0005) overlaps += 1
	}
	return overlaps
}

export function inspectVttOverlap(vtt: string): {
	cues: number
	overlaps: number
	avgLinesPerCue: number
} {
	const cues = parseCues(vtt)
	const totalLines = cues.reduce((sum, cue) => sum + cue.lines.length, 0)
	return {
		cues: cues.length,
		overlaps: countOverlaps(cues),
		avgLinesPerCue: cues.length > 0 ? totalLines / cues.length : 0,
	}
}

export function clipVttOverlaps(
	vtt: string,
	input?: { gapSec?: number; minDurationSec?: number },
): {
	vtt: string
	totalCues: number
	clippedOverlaps: number
	remainingOverlaps: number
	changed: boolean
} {
	const cues = parseCues(vtt)
	if (cues.length < 2) {
		return {
			vtt,
			totalCues: cues.length,
			clippedOverlaps: 0,
			remainingOverlaps: 0,
			changed: false,
		}
	}

	const gapSec = Math.max(0, Number(input?.gapSec ?? 0.01))
	const minDurationSec = Math.max(0.05, Number(input?.minDurationSec ?? 0.1))
	let clippedOverlaps = 0

	for (let i = 0; i < cues.length - 1; i++) {
		const current = cues[i]!
		const next = cues[i + 1]!
		if (current.end <= next.start) continue

		let targetEnd = next.start - gapSec
		if (targetEnd <= current.start) {
			targetEnd = Math.max(current.start + 0.05, next.start)
		}
		if (targetEnd < current.end - 0.0005) {
			current.end = targetEnd
			clippedOverlaps += 1
		}
	}

	for (const cue of cues) {
		if (cue.end <= cue.start) cue.end = cue.start + minDurationSec
	}

	const remainingOverlaps = countOverlaps(cues)
	const serialized = serializeCues(cues)

	return {
		vtt: serialized,
		totalCues: cues.length,
		clippedOverlaps,
		remainingOverlaps,
		changed: clippedOverlaps > 0,
	}
}
