// Centralized media domain configuration
// Consolidates limits, formats and quality presets previously split across
// app.config.ts and lib/constants/media.constants.ts

export const MEDIA_CONFIG = {
  limits: {
    // Maximum input duration and size constraints
    maxVideoDuration: 2 * 60 * 60, // 2 hours in seconds
    maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB in bytes
    maxConcurrentDownloads: 3,
    maxConcurrentProcessing: 2,
    maxUploadSize: 500 * 1024 * 1024, // 500MB
    supportedFormats: {
      video: ['mp4', 'avi', 'mov', 'mkv', 'webm'],
      audio: ['mp3', 'wav', 'aac', 'flac', 'ogg'],
      image: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    },
  },

  // Video quality presets used by rendering/downloading flows
  qualities: {
    default: '1080p' as const,
    available: ['720p', '1080p'] as const,
    formats: {
      '720p': {
        height: 720,
        width: 1280,
        bitrate: '2000k',
        label: 'HD 720p',
      },
      '1080p': {
        height: 1080,
        width: 1920,
        bitrate: '4000k',
        label: 'Full HD 1080p',
      },
    },
  },

  // Optional audio quality presets and default encoders (kept here for completeness)
  audioQualities: {
    '64k': { bitrate: '64k', sampleRate: 22050 },
    '128k': { bitrate: '128k', sampleRate: 44100 },
    '192k': { bitrate: '192k', sampleRate: 44100 },
    '256k': { bitrate: '256k', sampleRate: 48000 },
    '320k': { bitrate: '320k', sampleRate: 48000 },
  },

  encoders: {
    video: 'libx264',
    audio: 'aac',
    image: 'libpng',
  },

  processing: {
    thumbnailTime: '00:00:01',
    thumbnailSize: '320x240',
  },
} as const

export type VideoQuality = keyof typeof MEDIA_CONFIG.qualities.formats
export type AudioQuality = keyof typeof MEDIA_CONFIG.audioQualities

