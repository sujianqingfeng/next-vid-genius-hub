import path from 'node:path'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import type { Comment, VideoInfo } from '@app/media-domain'
import {
	buildCommentTimeline,
	buildComposeArgs,
	type SlotLayout,
	REMOTION_FPS,
} from '@app/media-comments'
import { bundle } from '@remotion/bundler'
import { getCompositions, renderMedia } from '@remotion/renderer'
import type { LocalJobExecutor } from '../contracts'
import { ensureDir, resolveOutputPath } from '../fs-utils'
import { materializeInputFile, readTextFromPathOrUrl } from './io'

type RenderCommentsInput = {
	dataPath?: string
	dataUrl?: string
	sourceVideoPath?: string
	sourceVideoUrl?: string
	composeMode?: 'auto' | 'overlay-only' | 'compose-on-video'
	composeLayout?: {
		x: number
		y: number
		width: number
		height: number
	}
	outputPath?: string
	outputDir?: string
	templateId?: 'comments-default' | 'comments-vertical' | 'thread-forum'
	templateConfig?: Record<string, unknown>
	remotionEntry?: string
	chromeMode?: 'headless-shell' | 'chrome-for-testing'
	browserExecutable?: string
}

function normalizeLayout(value: unknown): SlotLayout | undefined {
	if (!value || typeof value !== 'object') return undefined
	const v = value as Record<string, unknown>
	const x = Number(v.x)
	const y = Number(v.y)
	const width = Number(v.width)
	const height = Number(v.height)
	if (![x, y, width, height].every((item) => Number.isFinite(item))) {
		return undefined
	}
	if (width <= 0 || height <= 0) return undefined
	return {
		x: Math.round(x),
		y: Math.round(y),
		width: Math.round(width),
		height: Math.round(height),
	}
}

function defaultLayoutByTemplate(
	templateId: RenderCommentsInput['templateId'],
): SlotLayout | undefined {
	if (templateId === 'comments-vertical') {
		return { x: 58, y: 36, width: 540, height: 960 }
	}
	return undefined
}

async function execFfmpegWithProgress(
	args: string[],
	totalDurationSeconds: number,
	onProgress: (progress: number) => Promise<void> | void,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
		let stderr = ''
		let buffer = ''
		const totalUs = Math.max(1, Math.floor(totalDurationSeconds * 1_000_000))
		let lastProgress = -1
		let progressQueue: Promise<void> = Promise.resolve()

		const queueProgress = (ratio: number) => {
			progressQueue = progressQueue
				.then(async () => {
					await onProgress(ratio)
				})
				.catch(() => {})
		}

		proc.stderr.on('data', (chunk: Buffer) => {
			const text = chunk.toString()
			stderr += text
			buffer += text
			let idx = -1
			while ((idx = buffer.indexOf('\n')) !== -1) {
				const line = buffer.slice(0, idx).trim()
				buffer = buffer.slice(idx + 1)
				if (!line) continue
				if (line.startsWith('out_time_us=')) {
					const us = Number.parseInt(line.split('=')[1] || '0', 10)
					if (Number.isFinite(us)) {
						const ratio = Math.max(0, Math.min(1, us / totalUs))
						const marker = Math.round(ratio * 1000)
						if (marker > lastProgress) {
							lastProgress = marker
							queueProgress(ratio)
						}
					}
				}
			}
		})

		proc.on('error', (error) => reject(error))
		proc.on('close', (code) => {
			if (code === 0) {
				queueProgress(1)
				void progressQueue.then(() => resolve())
				return
			}
			void progressQueue.then(() =>
				reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`)),
			)
		})
	})
}

function ensureCommentsArray(value: unknown): Comment[] {
	if (!Array.isArray(value)) return []
	return value
		.filter((item) => item && typeof item === 'object')
		.map((item, index) => {
			const c = item as Record<string, unknown>
			return {
				id: String(c.id || `c_${index}`),
				author: String(c.author || 'unknown'),
				content: String(c.content || ''),
				translatedContent:
					typeof c.translatedContent === 'string'
						? c.translatedContent
						: undefined,
				authorThumbnail:
					typeof c.authorThumbnail === 'string'
						? c.authorThumbnail
						: undefined,
				likes: Number(c.likes || 0) || 0,
				replyCount: Number(c.replyCount || 0) || 0,
			}
		})
}

function ensureVideoInfo(value: unknown): VideoInfo {
	const v = (value || {}) as Record<string, unknown>
	return {
		title: String(v.title || 'Untitled'),
		translatedTitle:
			typeof v.translatedTitle === 'string' ? v.translatedTitle : undefined,
		viewCount: Number(v.viewCount || 0) || 0,
		author: typeof v.author === 'string' ? v.author : undefined,
		thumbnail: typeof v.thumbnail === 'string' ? v.thumbnail : undefined,
		series: typeof v.series === 'string' ? v.series : undefined,
		seriesEpisode:
			typeof v.seriesEpisode === 'number' ? v.seriesEpisode : undefined,
	}
}

function toThreadTimingReplies(replies: unknown[]): Comment[] {
	return replies.map((reply, index) => {
		const r = (reply || {}) as Record<string, any>
		const author = (r.author || {}) as Record<string, unknown>
		const metrics = (r.metrics || {}) as Record<string, unknown>
		return {
			id: String(r.id || `reply_${index}`),
			author: String(author.name || 'unknown'),
			content: String(r.plainText || ''),
			likes: Number(metrics.likes || 0) || 0,
			replyCount: 0,
		}
	})
}

export const renderCommentsExecutor: LocalJobExecutor = async (ctx) => {
	const input = ctx.spec.input as RenderCommentsInput
	if (!input?.dataPath && !input?.dataUrl) {
		throw new Error('render-comments requires input.dataPath or input.dataUrl')
	}

	const outputDir = resolveOutputPath(
		process.cwd(),
		input.outputDir ||
			path.join('.local-jobs', 'artifacts', ctx.jobId, 'render-comments'),
	)
	await ensureDir(outputDir)
	const outputPath = input.outputPath
		? resolveOutputPath(outputDir, input.outputPath)
		: path.join(outputDir, 'video.mp4')

	const remotionEntry = path.resolve(
		input.remotionEntry || 'packages/remotion-project/remotion/index.ts',
	)
	const bundleOutDir = path.join(outputDir, '_bundle')

	await ctx.emit({
		status: 'running',
		phase: 'preparing',
		progress: 0.05,
		message: 'Loading comments snapshot',
	})

	const dataText = await readTextFromPathOrUrl({
		path: input.dataPath,
		url: input.dataUrl,
		timeoutMs: 45_000,
	})
	const raw = JSON.parse(dataText) as Record<string, any>

	let compositionId =
		input.templateId === 'comments-vertical'
			? 'CommentsVideoVertical'
			: 'CommentsVideo'
	let coverDurationInFrames = REMOTION_FPS * 3
	let durationInFrames = REMOTION_FPS * 5
	let inputProps: Record<string, unknown>

	const looksLikeThread =
		input.templateId === 'thread-forum' || raw.kind === 'thread-render-snapshot'
	if (looksLikeThread) {
		const threadProps = (raw.inputProps || raw) as Record<string, unknown>
		const replies = Array.isArray(threadProps.replies) ? threadProps.replies : []
		const timeline = buildCommentTimeline(toThreadTimingReplies(replies), REMOTION_FPS)
		coverDurationInFrames =
			typeof threadProps.coverDurationInFrames === 'number'
				? threadProps.coverDurationInFrames
				: timeline.coverDurationInFrames
		const replyDurationsInFrames =
			Array.isArray(threadProps.replyDurationsInFrames) &&
			threadProps.replyDurationsInFrames.length === replies.length
				? (threadProps.replyDurationsInFrames as number[])
				: timeline.commentDurationsInFrames
		durationInFrames =
			coverDurationInFrames +
			replyDurationsInFrames.reduce((sum, frame) => sum + Number(frame || 0), 0)
		compositionId = 'ThreadForumVideo'
		inputProps = {
			...threadProps,
			coverDurationInFrames,
			replyDurationsInFrames,
			fps: REMOTION_FPS,
			templateConfig: input.templateConfig ?? threadProps.templateConfig,
		}
	} else {
		const comments = ensureCommentsArray(raw.comments)
		const videoInfo = ensureVideoInfo(raw.videoInfo)
		const timeline = buildCommentTimeline(comments, REMOTION_FPS)
		coverDurationInFrames = timeline.coverDurationInFrames
		durationInFrames = timeline.totalDurationInFrames
		inputProps = {
			videoInfo,
			comments,
			coverDurationInFrames,
			commentDurationsInFrames: timeline.commentDurationsInFrames,
			fps: REMOTION_FPS,
			templateConfig: input.templateConfig,
		}
	}

	const composeMode = input.composeMode || 'auto'
	const hasSourceVideo = Boolean(input.sourceVideoPath || input.sourceVideoUrl)
	const shouldComposeWithSource =
		composeMode === 'compose-on-video' ||
		(composeMode === 'auto' && hasSourceVideo)
	if (shouldComposeWithSource && !hasSourceVideo) {
		throw new Error(
			'render-comments compose mode requires sourceVideoPath or sourceVideoUrl',
		)
	}
	if (shouldComposeWithSource && looksLikeThread) {
		throw new Error(
			'render-comments compose-on-video currently supports comments templates only',
		)
	}
	const overlayPath = shouldComposeWithSource
		? path.join(outputDir, '_overlay.mp4')
		: outputPath
	const sourceVideoTempPath = path.join(outputDir, '_source.video.mp4')
	const totalDurationSeconds = durationInFrames / REMOTION_FPS

	if (await ctx.isCanceled()) return
	await ctx.emit({
		status: 'running',
		phase: 'preparing',
		progress: 0.15,
		message: 'Bundling Remotion project',
	})

	const serveUrl = await bundle({
		entryPoint: remotionEntry,
		outDir: bundleOutDir,
		publicDir: path.resolve('public'),
		enableCaching: true,
	})

	if (await ctx.isCanceled()) return
	await ctx.emit({
		status: 'running',
		phase: 'running',
		progress: 0.25,
		message: `Rendering composition: ${compositionId}`,
	})

	const compositions = await getCompositions(serveUrl, {
		inputProps,
		chromeMode: input.chromeMode,
		browserExecutable: input.browserExecutable,
	})
	const composition = compositions.find((c) => c.id === compositionId)
	if (!composition) {
		throw new Error(`Composition not found: ${compositionId}`)
	}

	await renderMedia({
		composition: {
			...composition,
			durationInFrames,
			fps: REMOTION_FPS,
		},
		serveUrl,
		codec: 'h264',
		audioCodec: 'aac',
		outputLocation: overlayPath,
		inputProps,
		chromeMode: input.chromeMode,
		browserExecutable: input.browserExecutable,
		chromiumOptions: {
			ignoreCertificateErrors: true,
		},
		onProgress: async ({ progress }) => {
			if (await ctx.isCanceled()) return
			const ratio = Math.max(0, Math.min(1, Number(progress || 0)))
			await ctx.emit({
				status: 'running',
				phase: 'running',
				progress: shouldComposeWithSource ? 0.25 + ratio * 0.5 : 0.25 + ratio * 0.7,
				message: 'Rendering comments video',
			})
		},
	})

	if (await ctx.isCanceled()) return

	if (shouldComposeWithSource) {
		await ctx.emit({
			status: 'running',
			phase: 'running',
			progress: 0.78,
			message: 'Preparing source video composition',
		})

		const sourceVideoPath = await materializeInputFile({
			path: input.sourceVideoPath,
			url: input.sourceVideoUrl,
			fallbackPath: sourceVideoTempPath,
			timeoutMs: 90_000,
		})
		const layout =
			normalizeLayout(input.composeLayout) ||
			defaultLayoutByTemplate(input.templateId)
		const ffmpegArgs = buildComposeArgs({
			overlayPath,
			sourceVideoPath,
			outputPath,
			fps: REMOTION_FPS,
			coverDurationSeconds: coverDurationInFrames / REMOTION_FPS,
			totalDurationSeconds,
			layout,
			preset: 'veryfast',
		})
		await execFfmpegWithProgress(ffmpegArgs, totalDurationSeconds, async (progress) => {
			await ctx.emit({
				status: 'running',
				phase: 'running',
				progress: 0.78 + Math.max(0, Math.min(1, progress)) * 0.2,
				message: 'Composing overlay onto source video',
			})
		})
		if (input.sourceVideoUrl) {
			void fs.unlink(sourceVideoPath).catch(() => {})
		}
		void fs.unlink(overlayPath).catch(() => {})
	}

	await ctx.emit({
		status: 'completed',
		phase: 'completed',
		progress: 1,
		message: 'Comments render completed',
		outputs: {
			video: {
				path: outputPath,
				contentType: 'video/mp4',
			},
		},
		metadata: {
			compositionId,
			durationInFrames,
			fps: REMOTION_FPS,
			composedWithSource: shouldComposeWithSource,
		},
	})

	void fs.rm(bundleOutDir, { recursive: true, force: true }).catch(() => {})
}
