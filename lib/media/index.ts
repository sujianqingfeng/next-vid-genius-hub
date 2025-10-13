// Re-export media processing utilities consumed by application code
// Use the shared extractAudio from the monorepo package to ensure parity with containers
export { extractAudio } from '@app/media-node'
// Subtitle rendering is now provided by a shared package to unify local and container code
export { renderVideoWithSubtitles } from '@app/media-subtitles'
export { renderVideoWithRemotion } from './remotion/renderer'
export type { RenderProgressEvent, RenderProgressStage } from './remotion/renderer'
export * from './types'
