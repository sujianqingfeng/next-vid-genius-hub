import type { Comment, VideoInfo } from '@app/media-domain'

export type CommentsTemplateConfig = {
	theme?: {
		background?: string
		surface?: string
		border?: string
		textPrimary?: string
		textSecondary?: string
		textMuted?: string
		accent?: string
		accentGlow?: string
	}
	typography?: {
		/**
		 * A small, safe set of font stacks that work reliably in Remotion/Chromium.
		 * "noto" stays close to the current defaults.
		 */
		fontPreset?: 'noto' | 'inter' | 'system'
		/** Scales all font sizes in the template. */
		fontScale?: number
	}
	layout?: {
		paddingX?: number
		paddingY?: number
		infoPanelWidth?: number
	}
	brand?: {
		showWatermark?: boolean
		watermarkText?: string
	}
	motion?: {
		enabled?: boolean
		intensity?: 'subtle' | 'normal' | 'strong'
	}
}

export interface CommentVideoInputProps extends Record<string, unknown> {
  videoInfo: VideoInfo
  comments: Comment[]
  /** Frames for the opening cover sequence */
  coverDurationInFrames: number
  /** Per-comment frame counts, aligned with `comments` */
  commentDurationsInFrames: number[]
  fps: number
	templateConfig?: CommentsTemplateConfig
}

export interface TimelineDurations {
  coverDurationInFrames: number
  commentDurationsInFrames: number[]
  totalDurationInFrames: number
  totalDurationSeconds: number
  coverDurationSeconds: number
}
