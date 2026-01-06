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

export type ThreadTemplateConfigV1 = {
	version?: 1
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
	scenes?: {
		cover?: { root?: ThreadRenderTreeNode }
		post?: { root?: ThreadRenderTreeNode }
	}
}

export type ThreadRenderTreeNode =
	| {
			type: 'Background'
			/** Optional solid color fill (e.g. '#000' or 'rgba(...)' or 'var(--tf-bg)') */
			color?: string
			/** Optional background image asset (must be a thread asset id, not a URL). */
			assetId?: string
			opacity?: number
			blur?: number
	  }
	| {
			type: 'Stack'
			/** Flex weight when this node is a child of another Stack. */
			flex?: number
			opacity?: number
			direction?: 'row' | 'column'
			align?: 'start' | 'center' | 'end' | 'stretch'
			justify?: 'start' | 'center' | 'end' | 'between'
			gap?: number
			gapX?: number
			gapY?: number
			padding?: number
			paddingX?: number
			paddingY?: number
			border?: boolean
			borderWidth?: number
			borderColor?: 'border' | 'primary' | 'muted' | 'accent'
			background?: string
			radius?: number
			overflow?: 'hidden'
			width?: number
			height?: number
			maxWidth?: number
			maxHeight?: number
			children?: ThreadRenderTreeNode[]
	  }
	| {
			type: 'Grid'
			/** Flex weight when this node is a child of a Stack. */
			flex?: number
			opacity?: number
			columns?: number
			align?: 'start' | 'center' | 'end' | 'stretch'
			justify?: 'start' | 'center' | 'end' | 'stretch'
			gap?: number
			gapX?: number
			gapY?: number
			padding?: number
			paddingX?: number
			paddingY?: number
			border?: boolean
			borderWidth?: number
			borderColor?: 'border' | 'primary' | 'muted' | 'accent'
			background?: string
			radius?: number
			overflow?: 'hidden'
			width?: number
			height?: number
			maxWidth?: number
			maxHeight?: number
			children?: ThreadRenderTreeNode[]
	  }
	| {
			type: 'Absolute'
			x?: number
			y?: number
			width?: number
			height?: number
			zIndex?: number
			opacity?: number
			pointerEvents?: boolean
			rotate?: number
			scale?: number
			origin?:
				| 'center'
				| 'top-left'
				| 'top-right'
				| 'bottom-left'
				| 'bottom-right'
			children?: ThreadRenderTreeNode[]
	  }
	| {
			type: 'Box'
			/** Flex weight when this node is a child of a Stack. */
			flex?: number
			opacity?: number
			padding?: number
			paddingX?: number
			paddingY?: number
			border?: boolean
			borderWidth?: number
			borderColor?: 'border' | 'primary' | 'muted' | 'accent'
			background?: string
			radius?: number
			overflow?: 'hidden'
			width?: number
			height?: number
			maxWidth?: number
			maxHeight?: number
			children?: ThreadRenderTreeNode[]
	  }
	| {
			type: 'Avatar'
			bind?: 'root.author.avatarAssetId' | 'post.author.avatarAssetId'
			opacity?: number
			size?: number
			radius?: number
			border?: boolean
			background?: string
	  }
	| {
			type: 'ContentBlocks'
			bind?: 'root.contentBlocks' | 'post.contentBlocks'
			opacity?: number
			gap?: number
			maxHeight?: number
	  }
	| {
			type: 'Image'
			assetId: string
			fit?: 'cover' | 'contain'
			position?: string
			opacity?: number
			blur?: number
			width?: number
			height?: number
			radius?: number
			border?: boolean
			background?: string
	  }
	| {
			type: 'Video'
			assetId: string
			fit?: 'cover' | 'contain'
			position?: string
			opacity?: number
			blur?: number
			width?: number
			height?: number
			radius?: number
			border?: boolean
			background?: string
	  }
	| {
			type: 'Spacer'
			axis?: 'x' | 'y'
			size?: number
			width?: number
			height?: number
	  }
	| {
			type: 'Divider'
			axis?: 'x' | 'y'
			thickness?: number
			length?: number
			color?: string
			opacity?: number
			margin?: number
	  }
	| {
			type: 'Text'
			text?: string
			bind?:
				| 'thread.title'
				| 'thread.source'
				| 'thread.sourceUrl'
				| 'timeline.replyIndicator'
				| 'timeline.replyIndex'
				| 'timeline.replyCount'
				| 'root.author.name'
				| 'root.author.handle'
				| 'root.plainText'
				| 'root.translations.zh-CN.plainText'
				| 'post.author.name'
				| 'post.author.handle'
				| 'post.plainText'
				| 'post.translations.zh-CN.plainText'
			/**
			 * When true (and `bind` points at a post plainText/translation field),
			 * renders both zh-CN and original text when available.
			 */
			bilingual?: boolean
			bilingualPrimary?: 'zh' | 'original'
			secondaryPlacement?: 'above' | 'below'
			color?: 'primary' | 'muted' | 'accent'
			align?: 'left' | 'center' | 'right'
			opacity?: number
			size?: number
			weight?: number
			lineHeight?: number
			letterSpacing?: number
			uppercase?: boolean
			maxLines?: number
	  }
	| {
			type: 'Watermark'
			/**
			 * When omitted, uses `templateConfig.brand.watermarkText`.
			 * Rendering is controlled by `templateConfig.brand.showWatermark`.
			 */
			text?: string
			position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
			color?: 'primary' | 'muted' | 'accent'
			size?: number
			weight?: number
			opacity?: number
			padding?: number
	  }
	| {
			type: 'Metrics'
			/** Defaults to post likes (ctx.post). */
			bind?: 'root.metrics.likes' | 'post.metrics.likes'
			color?: 'primary' | 'muted' | 'accent'
			opacity?: number
			size?: number
			showIcon?: boolean
	  }
		| {
				type: 'Repeat'
				/**
				 * Iterates over `ctx.replies` and renders `itemRoot` with `ctx.post = reply`.
				 * Optional scroll/highlight is time-driven by `replyDurationsInFrames`.
				 */
				source?: 'replies'
				/** Limits rendered items for safety/perf (clamped at render time). */
				maxItems?: number
				gap?: number
				wrapItemRoot?: boolean
				scroll?: boolean
				highlight?: {
					enabled?: boolean
					color?: 'primary' | 'muted' | 'accent'
					thickness?: number
					radius?: number
					opacity?: number
				}
				itemRoot: ThreadRenderTreeNode
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

export type ThreadContentBlock =
	| { id: string; type: 'text'; data: { text: string } }
	| { id: string; type: 'image'; data: { assetId: string; caption?: string } }
	| { id: string; type: 'video'; data: { assetId: string; title?: string } }
	| {
			id: string
			type: 'link'
			data: {
				url: string
				title?: string
				description?: string
				previewAssetId?: string
			}
	  }
	| { id: string; type: 'quote'; data: { text: string; author?: string } }
	| { id: string; type: 'divider'; data: Record<string, never> }

export type ThreadPostRender = {
	id: string
	author: {
		name: string
		handle?: string | null
		avatarAssetId?: string | null
	}
	contentBlocks: ThreadContentBlock[]
	plainText: string
	translations?: ThreadPostTranslations | null
	createdAt?: string | null
	metrics?: { likes?: number | null } | null
}

export type ThreadPostTranslationLocale = 'zh-CN'

export type ThreadPostTranslationRecord = {
	locale: ThreadPostTranslationLocale
	plainText: string
	createdAt?: string | null
	modelId?: string | null
	usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
}

export type ThreadPostTranslations = Partial<
	Record<ThreadPostTranslationLocale, ThreadPostTranslationRecord>
>

export type ThreadAssetRef = {
	id: string
	kind: 'image' | 'video' | 'avatar' | 'linkPreview' | 'audio'
	url: string
}

export interface ThreadVideoInputProps extends Record<string, unknown> {
	thread: {
		title: string
		source?: string | null
		sourceUrl?: string | null
	}
	audio?: { url: string; durationMs: number; volume?: number }
	root: ThreadPostRender
	replies: ThreadPostRender[]
	assets?: Record<string, ThreadAssetRef>
	coverDurationInFrames: number
	replyDurationsInFrames: number[]
	fps: number
	templateConfig?: ThreadTemplateConfigV1
}

export interface TimelineDurations {
	coverDurationInFrames: number
	commentDurationsInFrames: number[]
	totalDurationInFrames: number
	totalDurationSeconds: number
	coverDurationSeconds: number
}
