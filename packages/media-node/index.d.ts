export type Quality = '1080p' | '720p'

export declare function downloadVideo(
  url: string,
  quality: Quality,
  outputPath: string,
  options?: { proxy?: string; captureJson?: boolean }
): Promise<{ rawMetadata?: unknown }>

export declare function extractAudio(videoPath: string, audioPath: string): Promise<void>

declare const _default: {
  downloadVideo: typeof downloadVideo
  extractAudio: typeof extractAudio
}
export default _default

