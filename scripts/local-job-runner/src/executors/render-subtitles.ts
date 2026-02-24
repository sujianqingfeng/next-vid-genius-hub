import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
	type SubtitleRenderConfig,
	renderVideoWithSubtitles,
} from '@app/media-subtitles'
import type { LocalJobExecutor } from '../contracts'
import { ensureDir, resolveOutputPath } from '../fs-utils'
import { materializeInputFile, readTextFromPathOrUrl } from './io'

type RenderSubtitlesInput = {
	videoPath?: string
	videoUrl?: string
	subtitlePath?: string
	subtitleUrl?: string
	subtitleText?: string
	outputPath?: string
	outputDir?: string
	subtitleConfig?: SubtitleRenderConfig
}

export const renderSubtitlesExecutor: LocalJobExecutor = async (ctx) => {
	const input = ctx.spec.input as RenderSubtitlesInput
	if (!input.videoPath && !input.videoUrl) {
		throw new Error('render-subtitles requires input.videoPath or input.videoUrl')
	}
	if (!input.subtitleText && !input.subtitlePath && !input.subtitleUrl) {
		throw new Error(
			'render-subtitles requires input.subtitleText, input.subtitlePath or input.subtitleUrl',
		)
	}

	const outputDir = resolveOutputPath(
		process.cwd(),
		input.outputDir ||
			path.join('.local-jobs', 'artifacts', ctx.jobId, 'render-subtitles'),
	)
	await ensureDir(outputDir)
	const outputPath = input.outputPath
		? resolveOutputPath(outputDir, input.outputPath)
		: path.join(outputDir, 'video.mp4')

	await ctx.emit({
		status: 'running',
		phase: 'preparing',
		progress: 0.1,
		message: 'Preparing subtitle render inputs',
	})

	const preparedVideoPath = await materializeInputFile({
		path: input.videoPath,
		url: input.videoUrl,
		fallbackPath: path.join(outputDir, '_source.mp4'),
		timeoutMs: 60_000,
	})

	const subtitleText = input.subtitleText
		? String(input.subtitleText)
		: await readTextFromPathOrUrl({
				path: input.subtitlePath,
				url: input.subtitleUrl,
				timeoutMs: 30_000,
			})

	if (await ctx.isCanceled()) return
	await ctx.emit({
		status: 'running',
		phase: 'running',
		progress: 0.2,
		message: 'Rendering subtitles with ffmpeg',
	})

	await renderVideoWithSubtitles(
		preparedVideoPath,
		subtitleText,
		outputPath,
		input.subtitleConfig,
		{
			onProgress: async (percent) => {
				if (await ctx.isCanceled()) return
				const clamped = Math.max(0, Math.min(1, percent))
				await ctx.emit({
					status: 'running',
					phase: 'running',
					progress: 0.2 + clamped * 0.75,
					message: 'Rendering subtitles',
				})
			},
		},
	)

	if (await ctx.isCanceled()) return

	await ctx.emit({
		status: 'completed',
		phase: 'completed',
		progress: 1,
		message: 'Subtitle render completed',
		outputs: {
			video: {
				path: outputPath,
				contentType: 'video/mp4',
			},
		},
	})

	if (input.videoUrl && preparedVideoPath.includes('_source.mp4')) {
		void fs.unlink(preparedVideoPath).catch(() => {})
	}
}
