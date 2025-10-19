// Cloudflare Containers class definitions for media engines.
// These classes are referenced by wrangler.toml via [[containers]] and must be exported.

import { Container } from '@cloudflare/containers'

export class MediaDownloaderContainer extends Container {
  defaultPort = 8080
  // Stop after idle to save cost
  sleepAfter = '10m'
}

export class AudioTranscoderContainer extends Container {
  defaultPort = 8080
  sleepAfter = '10m'
}

export class BurnerFfmpegContainer extends Container {
  defaultPort = 8080
  sleepAfter = '10m'
}

export class RendererRemotionContainer extends Container {
  defaultPort = 8090
  sleepAfter = '10m'
}

