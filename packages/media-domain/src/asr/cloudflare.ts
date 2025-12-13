export type CloudflareAsrInputFormat = 'binary' | 'array' | 'base64'

export type CloudflareAsrCapabilities = {
	inputFormat: CloudflareAsrInputFormat
	supportsLanguageHint: boolean
}

const CLOUDFLARE_ASR_MODEL_CAPS: Record<string, CloudflareAsrCapabilities> = {
	'@cf/openai/whisper-tiny-en': {
		inputFormat: 'binary',
		supportsLanguageHint: false,
	},
	'@cf/openai/whisper': {
		inputFormat: 'binary',
		supportsLanguageHint: false,
	},
	'@cf/openai/whisper-large-v3-turbo': {
		inputFormat: 'base64',
		supportsLanguageHint: true,
	},
}

export function deriveCloudflareAsrCapabilities(
	modelId: string,
): CloudflareAsrCapabilities {
	const caps = CLOUDFLARE_ASR_MODEL_CAPS[modelId]
	if (!caps) {
		throw new Error(`Unknown Cloudflare ASR modelId: ${modelId}`)
	}
	return caps
}

