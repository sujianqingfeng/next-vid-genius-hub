import type { Comment, VideoInfo } from '../lib/media/types'

export interface CommentVideoInputProps extends Record<string, unknown> {
  videoInfo: VideoInfo
  comments: Comment[]
  /** Frames for the opening cover sequence */
  coverDurationInFrames: number
  /** Per-comment frame counts, aligned with `comments` */
  commentDurationsInFrames: number[]
  fps: number
}

export interface TimelineDurations {
  coverDurationInFrames: number
  commentDurationsInFrames: number[]
  totalDurationInFrames: number
  totalDurationSeconds: number
  coverDurationSeconds: number
}
