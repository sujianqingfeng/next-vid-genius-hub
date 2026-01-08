import { describe, expect, it } from 'vitest'

import {
	normalizeVttContent,
	parseVttCues,
	validateVttContent,
} from '~/lib/features/subtitle/utils/vtt'

describe('normalizeVttContent', () => {
	it('merges zero-length cues into the next cue when sharing the same start', () => {
		const input = `WEBVTT

00:00.000 --> 00:00.500
Hello

00:00.500 --> 00:00.500
the

00:00.500 --> 00:00.800
world
`

		expect(validateVttContent(input).isValid).toBe(false)

		const normalized = normalizeVttContent(input)
		expect(validateVttContent(normalized).isValid).toBe(true)

		const cues = parseVttCues(normalized)
		expect(cues).toHaveLength(2)
		expect(cues[1]!.lines[0]).toBe('the world')
	})

	it('extends end time to the next cue start when possible', () => {
		const input = `WEBVTT

00:00.500 --> 00:00.500
foo

00:00.700 --> 00:01.000
bar
`

		expect(validateVttContent(input).isValid).toBe(false)

		const normalized = normalizeVttContent(input)
		expect(validateVttContent(normalized).isValid).toBe(true)

		const cues = parseVttCues(normalized)
		expect(cues[0]!.end).toBe(cues[1]!.start)
	})
})

