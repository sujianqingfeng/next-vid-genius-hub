import { describe, expect, it } from 'vitest'
import {
	chunkByCharLimit,
	extractAssistantTextFromError,
	tryParseJsonObjectFromText,
} from '../translate-structured-utils'

describe('translate-structured-utils', () => {
	describe('extractAssistantTextFromError', () => {
		it('returns direct err.text when present', () => {
			expect(extractAssistantTextFromError({ text: ' {"ok":true} ' })).toBe(
				' {"ok":true} ',
			)
		})

		it('extracts DeepSeek native message content', () => {
			const err = {
				response: {
					body: {
						choices: [
							{ message: { content: '{"cues":[{"i":0,"zh":"测试"}]}' } },
						],
					},
				},
			}
			expect(extractAssistantTextFromError(err)).toBe(
				'{"cues":[{"i":0,"zh":"测试"}]}',
			)
		})
	})

	describe('tryParseJsonObjectFromText', () => {
		it('parses plain JSON objects', () => {
			expect(tryParseJsonObjectFromText('{"a":1}')).toEqual({ a: 1 })
		})

		it('parses JSON inside code fences', () => {
			const text = '```json\n{"a":1}\n```'
			expect(tryParseJsonObjectFromText(text)).toEqual({ a: 1 })
		})

		it('repairs simple trailing commas', () => {
			const text = '{"a":1, "b":[1,2,],}'
			expect(tryParseJsonObjectFromText(text)).toEqual({ a: 1, b: [1, 2] })
		})
	})

	describe('chunkByCharLimit', () => {
		it('splits by maxCues', () => {
			const cues = [
				{ i: 0, start: '0', end: '1', text: 'a' },
				{ i: 1, start: '1', end: '2', text: 'b' },
				{ i: 2, start: '2', end: '3', text: 'c' },
			]
			const batches = chunkByCharLimit(cues, { maxCues: 2, maxChars: 10_000 })
			expect(batches).toHaveLength(2)
			expect(batches[0]?.map((c) => c.i)).toEqual([0, 1])
			expect(batches[1]?.map((c) => c.i)).toEqual([2])
		})

		it('splits by maxChars', () => {
			const cues = [
				{ i: 0, start: '0', end: '1', text: 'x'.repeat(500) },
				{ i: 1, start: '1', end: '2', text: 'y'.repeat(500) },
				{ i: 2, start: '2', end: '3', text: 'z'.repeat(10) },
			]
			const batches = chunkByCharLimit(cues, { maxCues: 99, maxChars: 600 })
			expect(batches.length).toBeGreaterThan(1)
			expect(batches.flat().map((c) => c.i)).toEqual([0, 1, 2])
		})
	})
})
