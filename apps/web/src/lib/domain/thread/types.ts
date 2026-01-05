export type ThreadSource = 'x' | 'custom'

export type ThreadContentBlock =
	| {
			id: string
			type: 'text'
			data: { text: string }
	  }
	| {
			id: string
			type: 'image'
			data: { assetId: string; caption?: string }
	  }
	| {
			id: string
			type: 'video'
			data: { assetId: string; title?: string; posterUrl?: string }
	  }
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
	| {
			id: string
			type: 'quote'
			data: { text: string; author?: string }
	  }
	| {
			id: string
			type: 'divider'
			data: Record<string, never>
	  }

export type ThreadAuthor = {
	name: string
	handle?: string
	profileUrl?: string
	avatarAssetId?: string
}

export type ThreadPostRole = 'root' | 'reply'

export type ThreadPostMetrics = {
	likes?: number
	replies?: number
	reposts?: number
	views?: number
	bookmarks?: number
}

export type ThreadPost = {
	id: string
	threadId: string
	sourcePostId?: string | null
	role: ThreadPostRole
	author: ThreadAuthor
	createdAt?: Date | null
	editedAt?: Date | null
	contentBlocks: ThreadContentBlock[]
	plainText: string
	metrics?: ThreadPostMetrics | null
	depth: number
	parentSourcePostId?: string | null
	raw?: unknown
}

export type Thread = {
	id: string
	userId: string
	source: ThreadSource
	sourceUrl?: string | null
	sourceId?: string | null
	title: string
	lang?: string | null
	templateId?: string | null
	templateConfig?: unknown | null
	createdAt: Date
	updatedAt: Date
}
