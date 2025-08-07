// Re-export all media processing functionality

export * from './emoji'
export * from './processing'
export { extractAudio, renderVideoWithSubtitles } from './processing'
export * from './rendering/components'
export * from './rendering/engine'
// Main functions for backward compatibility
export { renderVideoWithCanvas } from './rendering/engine'
export * from './rendering/ui'
export * from './types'
export * from './utils'
