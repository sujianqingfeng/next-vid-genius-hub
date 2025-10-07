// YouTube provider barrel export
export * from './provider'
export { isValidYouTubeUrl as isYouTubeUrl, buildYouTubeUrl as getYouTubeVideoUrl, extractVideoId } from './utils'

// Server-only exports (not available in client-side code)
export { getYouTubeClient } from './client'
export { downloadVideo, downloadYoutubeComments } from './downloader'
export { fetchYouTubeMetadata } from './metadata'