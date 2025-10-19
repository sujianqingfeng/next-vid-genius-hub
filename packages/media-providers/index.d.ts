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
}

export declare function extractVideoId(url: string): string | null
export declare function downloadYoutubeComments(input: CommentsDownloadParams): Promise<BasicComment[]>
export declare function downloadTikTokCommentsByUrl(input: CommentsDownloadParams): Promise<BasicComment[]>

export type CommentsDownloader = (input: { url: string; source: string; pages?: number; proxy?: string }) => Promise<BasicComment[]>

declare const _default: {
  extractVideoId: typeof extractVideoId
  downloadYoutubeComments: typeof downloadYoutubeComments
  downloadTikTokCommentsByUrl: typeof downloadTikTokCommentsByUrl
}

export default _default
