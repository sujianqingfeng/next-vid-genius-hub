import { extractVideoId, type BasicComment } from './core/shared'

export { extractVideoId }

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
