import { getVideoResolution as pkgGetVideoResolution } from '@app/media-subtitles'

// Centralized FFmpeg-related helpers for app-side usage.
// Re-export from workspace package to avoid duplicate implementations.
export const getVideoResolution = pkgGetVideoResolution

