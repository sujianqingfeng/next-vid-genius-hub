import { presignGetByKey } from '~/lib/infra/cloudflare'
import { CF_ORCHESTRATOR_URL } from '~/lib/shared/config/env'
import { logger } from '~/lib/infra/logger'

export interface MinimalMediaLike {
	filePath: string | null
	downloadJobId: string | null
	remoteVideoKey: string | null
	title?: string | null
}

const PROXY_HEADER_KEYS = [
	'content-type',
	'accept-ranges',
	'content-length',
	'content-range',
	'cache-control',
	'etag',
	'last-modified',
] as const
const DEFAULT_DOWNLOAD_FALLBACK_NAME = 'download'

function encodeRFC5987Value(value: string): string {
	return encodeURIComponent(value)
		.replace(
			/['()]/g,
			(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
		)
		.replace(/\*/g, '%2A')
		.replace(/%(7C|60|5E)/g, '%25$1')
}

function buildAttachmentDisposition(filename: string): string {
	const asciiFallback =
		filename
			.normalize('NFKD')
			.replace(/[^\x20-\x7E]+/g, '_')
			.replace(/["\\]/g, '')
			.trim() || DEFAULT_DOWNLOAD_FALLBACK_NAME
	const encoded = encodeRFC5987Value(filename)
	return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`
}

export function buildDownloadFilename(
	title: string | null | undefined,
	fallbackBase: string,
	extension: string,
): string {
	const base = (
		title && title.trim().length > 0 ? title : fallbackBase
	).replace(/\s+/g, '_')
	const normalizedExt = extension.replace(/^\./, '')
	return `${base}.${normalizedExt}`
}

export function createProxyResponse(
	upstream: Response,
	options?: { defaultCacheSeconds?: number; forceDownloadName?: string | null },
): Response {
	const respHeaders = new Headers()
	for (const key of PROXY_HEADER_KEYS) {
		const v = upstream.headers.get(key)
		if (v) respHeaders.set(key, v)
	}
	if (!respHeaders.has('cache-control')) {
		respHeaders.set(
			'cache-control',
			`private, max-age=${options?.defaultCacheSeconds ?? 60}`,
		)
	}
	if (options?.forceDownloadName) {
		respHeaders.set(
			'Content-Disposition',
			buildAttachmentDisposition(options.forceDownloadName),
		)
	}
	const body = upstream.body ?? null
	return new Response(body, {
		status: upstream.status,
		headers: respHeaders,
	})
}

export async function proxyRemoteWithRange(
	remoteUrl: string,
	request: Request,
	options?: { defaultCacheSeconds?: number; forceDownloadName?: string | null },
): Promise<Response> {
	const range = request.headers.get('range')
	const passHeaders: Record<string, string> = {}
	if (range) passHeaders['range'] = range
	const r = await fetch(remoteUrl, { headers: passHeaders })
	logger.debug(
		'media',
		`[stream.proxy] url=${remoteUrl.split('?')[0]} status=${r.status} range=${range ?? 'none'}`,
	)
	return createProxyResponse(r, options)
}

export async function tryProxyRemoteWithRange(
	remoteUrl: string,
	request: Request,
	options?: {
		defaultCacheSeconds?: number
		forceDownloadName?: string | null
		fallthroughStatusCodes?: number[]
	},
): Promise<Response | null> {
	const range = request.headers.get('range')
	const passHeaders: Record<string, string> = {}
	if (range) passHeaders['range'] = range
	const r = await fetch(remoteUrl, { headers: passHeaders })
	logger.debug(
		'media',
		`[stream.proxy] url=${remoteUrl.split('?')[0]} status=${r.status} range=${range ?? 'none'}`,
	)
	const fallthrough = options?.fallthroughStatusCodes ?? [404]
	if (fallthrough.includes(r.status)) return null
	return createProxyResponse(r, {
		defaultCacheSeconds: options?.defaultCacheSeconds,
		forceDownloadName: options?.forceDownloadName ?? null,
	})
}

export async function resolveRemoteVideoUrl(
	media: MinimalMediaLike,
): Promise<string | null> {
	const base = (CF_ORCHESTRATOR_URL || '').replace(/\/$/, '')
	if (!media) return null
	if (media.downloadJobId) {
		logger.debug(
			'media',
			`[stream.resolve] via downloadJobId=${media.downloadJobId}`,
		)
		return `${base}/artifacts/${encodeURIComponent(media.downloadJobId)}`
	}
	if (media.remoteVideoKey) {
		try {
			logger.debug(
				'media',
				`[stream.resolve] via remoteVideoKey=${media.remoteVideoKey}`,
			)
			return await presignGetByKey(media.remoteVideoKey)
		} catch (e) {
			logger.error(
				'media',
				`[stream] presign by key failed: ${e instanceof Error ? e.message : String(e)}`,
			)
			return null
		}
	}
	return null
}

export function makeOrchestratorArtifactUrl(jobId: string): string | null {
	const base = (CF_ORCHESTRATOR_URL || '').replace(/\/$/, '')
	if (!base) return null
	return `${base}/artifacts/${encodeURIComponent(jobId)}`
}
