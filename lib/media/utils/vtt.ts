export interface VttCue {
	start: string
	end: string
	lines: string[]
}

/**
 * Parse a WebVTT-like body (may or may not contain the WEBVTT header)
 * into an array of cues. Each cue includes start/end and text lines.
 */
export function parseVttCues(vttBody: string): VttCue[] {
	const lines = vttBody.split(/\r?\n/)
	const cues: VttCue[] = []

	let i = 0
	while (i < lines.length) {
		const line = lines[i]
		const timeMatch = line.match(
			/^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/,
		)

		if (timeMatch) {
			const [, start, end] = timeMatch
			const cueLines: string[] = []
			i++
			for (; i < lines.length; i++) {
				const textLine = lines[i]
				if (!textLine.trim()) break
				cueLines.push(textLine)
			}
			cues.push({ start, end, lines: cueLines })
		}

		// advance to next non-empty or end
		i++
	}

	return cues
}

/**
 * Serialize cues back to a WebVTT body (without forcing a header).
 */
export function serializeVttCues(cues: VttCue[]): string {
	return cues
		.map((c) =>
			[
				`${c.start} --> ${c.end}`,
				...c.lines.map((l) => l.replace(/\s+$/g, '')),
				'',
			].join('\n'),
		)
		.join('\n')
		.trim()
}
