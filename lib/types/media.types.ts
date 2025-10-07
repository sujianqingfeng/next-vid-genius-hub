export interface MediaItem {
	id: string
	url: string
	source: string
	title?: string
	author?: string
	thumbnail?: string
	duration?: number
	viewCount?: number
	likeCount?: number
	filePath?: string
	audioFilePath?: string
	thumbnailPath?: string
	quality?: string
	createdAt: Date
	updatedAt: Date
}

export interface MediaStats {
	totalCount: number
	totalSize: number
	sourceCounts: Record<string, number>
	recentCount: number
	averageDuration?: number
	totalDuration?: number
}