// Browser-safe entry for @app/media-providers
// Do NOT import Node-only modules (e.g., 'undici', 'node:*') here.

export function extractVideoId(url) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace(/^\//, '') || null
    }
    if (u.searchParams.get('v')) return u.searchParams.get('v')
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] === 'shorts' && parts[1]) return parts[1]
    return null
  } catch {
    return null
  }
}

export async function downloadYoutubeComments() {
  throw new Error(
    '@app/media-providers: downloadYoutubeComments is server-only. Call it from Next.js server routes/actions or containers.'
  )
}

export async function downloadTikTokCommentsByUrl() {
  throw new Error(
    '@app/media-providers: downloadTikTokCommentsByUrl is server-only. Call it from Next.js server routes/actions or containers.'
  )
}

export default {
  extractVideoId,
  downloadYoutubeComments,
  downloadTikTokCommentsByUrl,
}

