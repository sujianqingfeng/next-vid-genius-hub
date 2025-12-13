import { describe, expect, test } from 'vitest'
import { deriveCloudflareAsrCapabilities } from '../asr/cloudflare'

describe('deriveCloudflareAsrCapabilities', () => {
	test('derives capabilities for known modelIds', () => {
		expect(deriveCloudflareAsrCapabilities('@cf/openai/whisper-tiny-en')).toEqual({
			inputFormat: 'binary',
			supportsLanguageHint: false,
		})
		expect(deriveCloudflareAsrCapabilities('@cf/openai/whisper')).toEqual({
			inputFormat: 'binary',
			supportsLanguageHint: false,
		})
		expect(
			deriveCloudflareAsrCapabilities('@cf/openai/whisper-large-v3-turbo'),
		).toEqual({
			inputFormat: 'base64',
			supportsLanguageHint: true,
		})
	})

	test('throws for unknown modelIds', () => {
		expect(() => deriveCloudflareAsrCapabilities('@cf/openai/unknown')).toThrow(
			/Unknown Cloudflare ASR modelId/,
		)
	})
})

