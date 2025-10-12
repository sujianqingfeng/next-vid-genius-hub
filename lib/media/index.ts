// Re-export media processing utilities consumed by application code
// Use the shared extractAudio from the monorepo package to ensure parity with containers
export { extractAudio } from '@app/media-core'
export { renderVideoWithSubtitles } from './processing'
export { renderVideoWithRemotion } from './remotion/renderer'
export type { RenderProgressEvent, RenderProgressStage } from './remotion/renderer'
export * from './types'
