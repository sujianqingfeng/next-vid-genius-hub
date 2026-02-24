import path from 'node:path'
import {
	downloadTikTokCommentsByUrl,
	downloadYoutubeComments,
} from '@app/media-providers'
import type { LocalJobExecutor } from '../contracts'
import { ensureDir, resolveOutputPath, writeJsonFile } from '../fs-utils'

type CommentsDownloadInput = {
	url: string
	source: 'youtube' | 'tiktok'
	pages?: number
	proxyUrl?: string
	outputPath?: string
	outputDir?: string
}

export const commentsDownloadExecutor: LocalJobExecutor = async (ctx) => {
	const input = ctx.spec.input as CommentsDownloadInput
	if (!input?.url) throw new Error('comments-download requires input.url')
	if (!input?.source) {
		throw new Error('comments-download requires input.source (youtube/tiktok)')
	}

	const outputDir = resolveOutputPath(
		process.cwd(),
		input.outputDir ||
			path.join('.local-jobs', 'artifacts', ctx.jobId, 'comments-download'),
	)
	await ensureDir(outputDir)
	const outputPath = input.outputPath
		? resolveOutputPath(outputDir, input.outputPath)
		: path.join(outputDir, 'comments.json')

	await ctx.emit({
		status: 'running',
		phase: 'fetching_metadata',
		progress: 0.08,
		message: 'Fetching comments',
	})

	const downloader =
		input.source === 'tiktok'
			? downloadTikTokCommentsByUrl
			: downloadYoutubeComments
	const comments = await downloader({
		url: input.url,
		pages: Number(input.pages || 3),
		proxy: input.proxyUrl,
		onProgress: async (progress) => {
			if (await ctx.isCanceled()) return
			const page = Number(progress.page || 0)
			const totalPages = Number(progress.pages || 1) || 1
			const ratio = Math.max(0, Math.min(1, page / totalPages))
			await ctx.emit({
				status: 'running',
				phase: 'running',
				progress: 0.1 + ratio * 0.8,
				message: `Fetched page ${page}/${totalPages}`,
				metadata: {
					count: progress.count,
				},
			})
		},
	})

	if (await ctx.isCanceled()) return
	await writeJsonFile(outputPath, comments)
	await ctx.emit({
		status: 'completed',
		phase: 'completed',
		progress: 1,
		message: 'Comments download completed',
		outputs: {
			comments: {
				path: outputPath,
				contentType: 'application/json',
			},
		},
		metadata: {
			source: input.source,
			count: comments.length,
		},
	})
}
