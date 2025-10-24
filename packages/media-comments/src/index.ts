// Re-export env-agnostic helpers from core
export {
	type Comment,
	type TimelineDurations,
	type SlotLayout,
	REMOTION_FPS,
	COVER_DURATION_SECONDS,
	MIN_COMMENT_DURATION_SECONDS,
	MAX_COMMENT_DURATION_SECONDS,
	estimateCommentDurationSeconds,
	buildCommentTimeline,
	layoutConstants,
	VIDEO_WIDTH,
	VIDEO_HEIGHT,
	getOverlayFilter,
	buildComposeArgs,
} from './core/shared'

// Import runtime bindings for default export object
import {
  REMOTION_FPS,
  COVER_DURATION_SECONDS,
  MIN_COMMENT_DURATION_SECONDS,
  MAX_COMMENT_DURATION_SECONDS,
  estimateCommentDurationSeconds,
  buildCommentTimeline,
  layoutConstants,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  getOverlayFilter,
  buildComposeArgs,
} from './core/shared'

// Note: Do NOT import Node-only libs at module top-level.
// This package is consumed by both Node (Next server/containers) and browser (Remotion composition bundling).
// We dynamically load `undici` inside functions when running in Node and only if needed (e.g., proxy).

// ---------------- Remote image inlining (Node-friendly) ----------------
function inferContentTypeFromUrl(url: string) {
	try {
		const ext = new URL(url).pathname.split('.').pop()?.toLowerCase()
		switch (ext) {
			case 'png': return 'image/png'
			case 'webp': return 'image/webp'
			case 'gif': return 'image/gif'
			case 'bmp': return 'image/bmp'
			case 'svg': return 'image/svg+xml'
			case 'jpeg':
			case 'jpg': return 'image/jpeg'
			default: return undefined
		}
	} catch {
		return undefined
	}
}

function hasNode() {
	return typeof process !== 'undefined' && !!(process.versions && process.versions.node)
}

function abToBase64(ab: ArrayBuffer) {
	if (typeof Buffer !== 'undefined') return Buffer.from(ab).toString('base64')
	let binary = ''
	const bytes = new Uint8Array(ab)
	const len = bytes.byteLength
	for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i])
	// Note: btoa is only available in browser environments
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	return typeof btoa === 'function' ? btoa(binary) : ''
}

async function loadUndiciSafely(): Promise<any | undefined> {
	if (!hasNode()) return undefined
	try {
		// eslint-disable-next-line no-new-func
		const dynImport = Function('m', 'return import(m)') as (m: string) => Promise<any>
		return await dynImport('undici')
	} catch {
		return undefined
	}
}

export async function inlineRemoteImage(url?: string | null, { proxyUrl, timeoutMs = 15000 }: { proxyUrl?: string; timeoutMs?: number } = {}) {
	if (!url) return undefined
	const isRemote = /^https?:\/\//i.test(String(url))
	if (!isRemote) return url
	try {
		let fetchImpl: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined
		let requestInit: any = {}

		if (proxyUrl && hasNode()) {
			const undici = await loadUndiciSafely()
			if (undici && undici.ProxyAgent && undici.fetch) {
				fetchImpl = undici.fetch
				requestInit = { ...requestInit, dispatcher: new undici.ProxyAgent(proxyUrl) }
			}
		}

		if (!fetchImpl && hasNode()) {
			const undici = await loadUndiciSafely()
			if (undici && undici.fetch) fetchImpl = undici.fetch
		}

		if (!fetchImpl) return undefined

		let controller: AbortController | undefined
		let timer: NodeJS.Timeout | undefined
		if (typeof AbortController !== 'undefined') {
			controller = new AbortController()
			;(requestInit as any).signal = controller.signal
			if (timeoutMs > 0) timer = setTimeout(() => { try { controller?.abort() } catch {} }, timeoutMs)
		}

		const r: any = await fetchImpl(url, requestInit)
		if (timer) clearTimeout(timer)
		if (!r || !r.ok) throw new Error(String(r && r.status))
		const arrayBuffer = await r.arrayBuffer()
		const contentType = (r.headers && r.headers.get && r.headers.get('content-type')) || inferContentTypeFromUrl(url) || 'image/jpeg'
		return `data:${contentType};base64,${abToBase64(arrayBuffer)}`
	} catch {
		return undefined
	}
}

export default {
	REMOTION_FPS,
	COVER_DURATION_SECONDS,
	MIN_COMMENT_DURATION_SECONDS,
	MAX_COMMENT_DURATION_SECONDS,
	estimateCommentDurationSeconds,
	buildCommentTimeline,
	layoutConstants,
	getOverlayFilter,
	buildComposeArgs,
	inlineRemoteImage,
	VIDEO_WIDTH,
	VIDEO_HEIGHT,
}
