export type CompactCue = {
	i: number
	start: string
	end: string
	text: string
}

export function extractAssistantTextFromError(e: unknown): string | null {
	if (!e || typeof e !== 'object') return null
	const err = e as Record<string, unknown>

	const directText = err.text
	if (typeof directText === 'string' && directText.trim()) return directText

	const cause =
		err.cause && typeof err.cause === 'object'
			? (err.cause as Record<string, unknown>)
			: null
	const causeText = cause?.text
	if (typeof causeText === 'string' && causeText.trim()) return causeText

	const responseBody = err.responseBody
	if (typeof responseBody === 'string' && responseBody.trim()) {
		const trimmed = responseBody.trim()
		try {
			const parsed = JSON.parse(trimmed) as unknown
			if (parsed && typeof parsed === 'object') {
				const choices = (parsed as Record<string, unknown>).choices
				if (Array.isArray(choices) && choices.length) {
					const choice0 = choices[0]
					if (choice0 && typeof choice0 === 'object') {
						const message = (choice0 as Record<string, unknown>).message
						if (message && typeof message === 'object') {
							const content = (message as Record<string, unknown>).content
							if (typeof content === 'string' && content.trim()) return content
						}
					}
				}
			}
		} catch {
			return trimmed
		}
	}

	const rawResponse =
		err.response ??
		(err.cause && typeof err.cause === 'object'
			? (err.cause as Record<string, unknown>).response
			: undefined)

	if (!rawResponse || typeof rawResponse !== 'object') return null
	const rawBody = (rawResponse as Record<string, unknown>).body
	if (!rawBody) return null

	let body: unknown = rawBody
	if (typeof rawBody === 'string') {
		const trimmed = rawBody.trim()
		if (!trimmed) return null
		try {
			body = JSON.parse(trimmed)
		} catch {
			return trimmed
		}
	}
	if (!body || typeof body !== 'object') return null

	// DeepSeek native: body.choices[0].message.content
	const choices = (body as Record<string, unknown>).choices
	if (!Array.isArray(choices) || !choices.length) return null
	const choice0 = choices[0]
	if (!choice0 || typeof choice0 !== 'object') return null
	const message = (choice0 as Record<string, unknown>).message
	if (!message || typeof message !== 'object') return null
	const content = (message as Record<string, unknown>).content
	return typeof content === 'string' && content.trim() ? content : null
}

export function tryParseJsonObjectFromText(text: string): unknown | null {
	let s = text.trim()
	if (!s) return null

	// Strip code fences if present
	const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
	if (fence?.[1]) s = fence[1].trim()

	const start = s.indexOf('{')
	const end = s.lastIndexOf('}')
	if (start === -1 || end === -1 || end <= start) return null

	const candidate = s.slice(start, end + 1).trim()
	try {
		return JSON.parse(candidate)
	} catch {
		// Quick-and-safe trailing comma cleanup (common model mistake)
		const repaired = candidate.replace(/,\s*([}\]])/g, '$1')
		try {
			return JSON.parse(repaired)
		} catch {
			return null
		}
	}
}

export function chunkByCharLimit(
	items: CompactCue[],
	opts: { maxCues: number; maxChars: number },
): CompactCue[][] {
	const { maxCues, maxChars } = opts
	const batches: CompactCue[][] = []
	let current: CompactCue[] = []
	let currentChars = 0

	for (const cue of items) {
		const cueChars = cue.text.length + 80
		const wouldExceed =
			current.length >= maxCues ||
			(current.length > 0 && currentChars + cueChars > maxChars)
		if (wouldExceed) {
			batches.push(current)
			current = []
			currentChars = 0
		}
		current.push(cue)
		currentChars += cueChars
	}

	if (current.length) batches.push(current)
	return batches
}
