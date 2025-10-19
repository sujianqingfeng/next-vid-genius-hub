export interface TimeSegmentEffect {
  id: string
  startTime: number
  endTime: number
  muteAudio: boolean
  blackScreen: boolean
  description?: string
}

export type HintTextPosition = 'center' | 'top' | 'bottom'

export interface HintTextConfig {
  enabled: boolean
  text: string
  fontSize: number
  textColor: string
  backgroundColor: string
  backgroundOpacity: number
  outlineColor: string
  position: HintTextPosition
  animation?: 'fade-in' | 'slide-up' | 'none'
}

export interface SubtitleRenderConfig {
  fontSize: number
  textColor: string
  backgroundColor: string
  backgroundOpacity: number
  outlineColor: string
  timeSegmentEffects: TimeSegmentEffect[]
  hintTextConfig?: HintTextConfig
}

export declare const defaultSubtitleRenderConfig: SubtitleRenderConfig

export declare function getVideoResolution(videoPath: string): Promise<{ width: number; height: number }>

export declare function escapeForFFmpegFilterPath(filePath: string): string

export declare function convertWebVttToAss(vttContent: string, config: Pick<SubtitleRenderConfig, 'fontSize' | 'textColor' | 'backgroundColor' | 'backgroundOpacity' | 'outlineColor'>): Promise<string>

export declare function renderVideoWithSubtitles(
  videoPath: string,
  subtitleContent: string,
  outputPath: string,
  subtitleConfig?: SubtitleRenderConfig,
  options?: { onProgress?: (percent: number) => void }
): Promise<void>

declare const _default: {
  renderVideoWithSubtitles: typeof renderVideoWithSubtitles
  convertWebVttToAss: typeof convertWebVttToAss
  getVideoResolution: typeof getVideoResolution
  escapeForFFmpegFilterPath: typeof escapeForFFmpegFilterPath
  defaultSubtitleRenderConfig: typeof defaultSubtitleRenderConfig
}

export default _default
