import {
	DEFAULT_LOCALE,
	createTranslator,
	getLocaleFromDocument,
	getMessages,
	type Locale,
} from '~/lib/i18n'

function getErrorTranslator(locale: Locale) {
	return createTranslator({
		locale,
		messages: getMessages(locale),
		namespace: 'Errors',
	})
}

const SERVER_MESSAGE_TO_CODE: Record<string, string> = {
	'Media not found': 'MEDIA_NOT_FOUND',
	'Thread not found': 'THREAD_NOT_FOUND',
	'Provider not found': 'PROVIDER_NOT_FOUND',
	'Channel not found': 'CHANNEL_NOT_FOUND',
	'Template library not found': 'THREAD_TEMPLATE_LIBRARY_NOT_FOUND',
	'LLM model is not enabled': 'LLM_MODEL_NOT_ENABLED',
	'Proxy not found': 'PROXY_NOT_FOUND',
	'SSR subscription not found': 'SSR_SUBSCRIPTION_NOT_FOUND',
	'Media or comments not found': 'MEDIA_OR_COMMENTS_NOT_FOUND',
	'Model not found': 'MODEL_NOT_FOUND',
	'Template version not found': 'THREAD_TEMPLATE_VERSION_NOT_FOUND',
	'Audio asset not found': 'AUDIO_ASSET_NOT_FOUND',
	CANNOT_DELETE_SELF: 'CANNOT_DELETE_SELF',
	CANNOT_DELETE_LAST_ADMIN: 'CANNOT_DELETE_LAST_ADMIN',
	'Provider mismatch for model pricing rule':
		'PROVIDER_MISMATCH_FOR_MODEL_PRICING_RULE',
	'LLM pricing rule unit must be token': 'LLM_PRICING_RULE_UNIT_MUST_BE_TOKEN',
	'LLM pricing rules require both inputPricePerUnit and outputPricePerUnit':
		'LLM_PRICING_RULES_REQUIRE_INPUT_AND_OUTPUT_PRICE',
	'Whisper API providers require baseUrl':
		'WHISPER_API_PROVIDERS_REQUIRE_BASE_URL',
	'metadata.maxUploadBytes must be a positive number':
		'METADATA_MAX_UPLOAD_BYTES_MUST_BE_POSITIVE',
	'Cannot delete provider: models still reference it':
		'CANNOT_DELETE_PROVIDER_MODELS_STILL_REFERENCE',
	'Whisper API baseUrl is not configured for this provider':
		'WHISPER_API_BASE_URL_NOT_CONFIGURED',
	'Whisper API token is not configured for this provider':
		'WHISPER_API_TOKEN_NOT_CONFIGURED',
	'No enabled LLM model found for this provider':
		'NO_ENABLED_LLM_MODEL_FOR_PROVIDER',
	'Model kind mismatch': 'MODEL_KIND_MISMATCH',
	'No source video available (need local file, rendered artifact, remote key, or a completed cloud download).':
		'NO_SOURCE_VIDEO_AVAILABLE',
	'No comments found for this media': 'NO_COMMENTS_FOUND_FOR_MEDIA',
	'Source video not found in cloud storage. Re-run cloud download for this media and retry.':
		'SOURCE_VIDEO_NOT_FOUND_IN_CLOUD_STORAGE',
	'Invalid templateConfig': 'INVALID_TEMPLATE_CONFIG',
	'Failed to prepare comments metadata for cloud render':
		'FAILED_TO_PREPARE_COMMENTS_METADATA',
	'Media URL missing': 'MEDIA_URL_MISSING',
	'Failed to create media record for download':
		'FAILED_TO_CREATE_MEDIA_RECORD_FOR_DOWNLOAD',
	'Media URL is missing; cannot refresh metadata':
		'MEDIA_URL_MISSING_CANNOT_REFRESH_METADATA',
	'Invalid commentsTemplateConfig': 'INVALID_COMMENTS_TEMPLATE_CONFIG',
	'templateConfig must include "version": 1 (v1 only)':
		'THREAD_TEMPLATE_CONFIG_VERSION_REQUIRED',
	'name is required': 'NAME_IS_REQUIRED',
	'A template with the same name already exists':
		'THREAD_TEMPLATE_NAME_ALREADY_EXISTS',
	'Invalid JSON': 'INVALID_JSON',
	'Post not found': 'POST_NOT_FOUND',
	'Unsupported audio content-type': 'UNSUPPORTED_AUDIO_CONTENT_TYPE',
	'Audio storageKey missing': 'AUDIO_STORAGE_KEY_MISSING',
	'Uploaded audio not found in storage yet':
		'UPLOADED_AUDIO_NOT_FOUND_IN_STORAGE_YET',
	'Audio asset is not ready yet': 'AUDIO_ASSET_NOT_READY_YET',
	'templateConfig must be an object with version: 1 (v1 only)':
		'THREAD_TEMPLATE_CONFIG_OBJECT_REQUIRED',
	'No template updates provided': 'NO_TEMPLATE_UPDATES_PROVIDED',
	'Render not found': 'RENDER_NOT_FOUND',
	'Render jobId missing': 'RENDER_JOB_ID_MISSING',
	'Render job not found': 'RENDER_JOB_NOT_FOUND',
}

function translateErrorCode(
	t: (key: string, params?: Record<string, unknown>) => string,
	code: string,
	params?: Record<string, unknown>,
): string | null {
	const key = `codes.${code}`
	const translated = t(key, params)
	return translated === `Errors.${key}` ? null : translated
}

export function getUserFriendlyErrorMessage(error: unknown): string {
	const e = error as { code?: string; message?: string } | null | undefined
	const locale = getLocaleFromDocument()
	const t = getErrorTranslator(locale ?? DEFAULT_LOCALE)

	const rawCode = typeof e?.code === 'string' ? e.code : undefined
	const rawMessage = typeof e?.message === 'string' ? e.message : undefined

	// Allow server-provided custom message for PROXY_NOT_SUCCESS overrides.
	if (rawCode === 'PROXY_NOT_SUCCESS') {
		return rawMessage && rawMessage !== 'PROXY_NOT_SUCCESS'
			? rawMessage
			: t('codes.PROXY_NOT_SUCCESS')
	}

	const candidates: string[] = []
	if (rawCode) candidates.push(rawCode)
	if (rawMessage && rawMessage in SERVER_MESSAGE_TO_CODE) {
		candidates.push(SERVER_MESSAGE_TO_CODE[rawMessage]!)
	}
	if (rawMessage) candidates.push(rawMessage)

	for (const candidate of candidates) {
		const translated = translateErrorCode(t, candidate)
		if (translated) return translated
	}

	// Fallback to server-provided message when available
	if (rawMessage) return rawMessage

	return t('unknown')
}
