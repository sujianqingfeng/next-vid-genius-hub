import path from 'node:path'
import { listChannelVideos } from '@app/media-providers'
import type { LocalJobExecutor } from '../contracts'
import { ensureDir, resolveOutputPath, writeJsonFile } from '../fs-utils'

type ChannelSyncInput = {
	channelUrlOrId: string
	limit?: number
	proxyUrl?: string
	outputPath?: string
	outputDir?: string
}

const stageProgressMap: Record<string, number> = {
	resolve: 0.15,
	uploads: 0.5,
	fallback: 0.75,
	done: 0.95,
}

export const channelSyncExecutor: LocalJobExecutor = async (ctx) => {
	const input = ctx.spec.input as ChannelSyncInput
	if (!input?.channelUrlOrId) {
		throw new Error('channel-sync requires input.channelUrlOrId')
	}

	const outputDir = resolveOutputPath(
		process.cwd(),
		input.outputDir || path.join('.local-jobs', 'artifacts', ctx.jobId, 'channel-sync'),
	)
	await ensureDir(outputDir)
	const outputPath = input.outputPath
		? resolveOutputPath(outputDir, input.outputPath)
		: path.join(outputDir, 'videos.json')

	await ctx.emit({
		status: 'running',
		phase: 'preparing',
		progress: 0.06,
		message: 'Starting channel sync',
	})

	const result = await listChannelVideos({
		channelUrlOrId: input.channelUrlOrId,
		limit: Number(input.limit || 20),
		proxyUrl: input.proxyUrl,
		onProgress: async (info) => {
			if (await ctx.isCanceled()) return
			await ctx.emit({
				status: 'running',
				phase: 'running',
				progress: stageProgressMap[info.stage] || 0.5,
				message: `Channel sync stage: ${info.stage}`,
				metadata: {
					count: info.count,
					limit: info.limit,
				},
			})
		},
	})

	if (await ctx.isCanceled()) return
	await writeJsonFile(outputPath, result)
	await ctx.emit({
		status: 'completed',
		phase: 'completed',
		progress: 1,
		message: 'Channel sync completed',
		outputs: {
			videos: {
				path: outputPath,
				contentType: 'application/json',
			},
		},
		metadata: {
			channelId: result.channelId,
			count: result.videos.length,
		},
	})
}
