import {
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

export async function inlineRemoteImage(url?: string | null, { timeoutMs = 15000 }: { timeoutMs?: number } = {}) {
  if (!url) return undefined
  const isRemote = /^https?:\/\//i.test(String(url))
  if (!isRemote) return url
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
    const timer = controller && timeoutMs > 0 ? setTimeout(() => { try { controller?.abort() } catch {} }, timeoutMs) : undefined
    const r: any = await fetch(url, controller ? { signal: controller.signal } : undefined)
    if (timer) clearTimeout(timer)
    if (!r.ok) throw new Error(String(r.status))
    const arrayBuffer = await r.arrayBuffer()
    let binary = ''
    const bytes = new Uint8Array(arrayBuffer)
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    // Note: btoa is a browser API
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const base64 = typeof btoa === 'function' ? btoa(binary) : ''
    const contentType = r.headers.get('content-type') || inferContentTypeFromUrl(url) || 'image/jpeg'
    return `data:${contentType};base64,${base64}`
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
