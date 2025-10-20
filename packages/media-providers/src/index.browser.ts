export interface BasicComment {
  id: string
  author: string
  authorThumbnail?: string
  content: string
  likes: number
  replyCount: number
  translatedContent: string
}

export function extractVideoId(url: string): string | null {
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

export async function downloadYoutubeComments(): Promise<BasicComment[]> {
  throw new Error(
    '@app/media-providers: downloadYoutubeComments is server-only. Call it from Next.js server routes/actions or containers.',
  )
}

export async function downloadTikTokCommentsByUrl(): Promise<BasicComment[]> {
  throw new Error(
    '@app/media-providers: downloadTikTokCommentsByUrl is server-only. Call it from Next.js server routes/actions or containers.',
  )
}

export default {
  extractVideoId,
  downloadYoutubeComments,
  downloadTikTokCommentsByUrl,
}

