export interface BasicComment {
  id: string
  author: string
  authorThumbnail?: string
  content: string
  likes: number
  replyCount: number
  translatedContent: string
}

export interface CommentsDownloadParams {
  url: string
  pages?: number
  proxy?: string
  onProgress?: (info: { page: number; pages: number; count: number }) => void
}

export function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace(/^\//, '') || null
    }
    const v = u.searchParams.get('v')
    if (v) return v
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] === 'shorts' && parts[1]) return parts[1]
    return null
  } catch {
    return null
  }
}
