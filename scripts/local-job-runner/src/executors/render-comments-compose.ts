import path from 'node:path'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import {
	buildComposeArgs,
	type SlotLayout,
	REMOTION_FPS,
} from '@app/media-comments'
import type { LocalJobExecutor } from '../contracts'
import { ensureDir, resolveOutputPath } from '../fs-utils'
import { materializeInputFile } from './io'

type RenderCommentsComposeInput = {
	overlayVideoPath?: string
	overlayVideoUrl?: string
	sourceVideoPath?: string
	sourceVideoUrl?: string
	composeLayout?: {
		x: number
		y: number
		width: number
		height: number
	}
	coverDurationSeconds?: number
	totalDurationSeconds?: number
	fps?: number
	preset?: string
	videoCodec?: string
	audioCodec?: string
	audioBitrate?: string
	pixFmt?: string
	movFlags?: string
	vsync?: string
	outputPath?: string
	outputDir?: string
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
				if (!line.startsWith('out_time_us=')) continue
				const us = Number.parseInt(line.split('=')[1] || '0', 10)
				if (!Number.isFinite(us)) continue
				const ratio = Math.max(0, Math.min(1, us / totalUs))
				const marker = Math.round(ratio * 1000)
				if (marker > lastProgress) {
					lastProgress = marker
					queueProgress(ratio)
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

async function probeDurationSeconds(filePath: string): Promise<number> {
	return new Promise<number>((resolve, reject) => {
		const proc = spawn(
			'ffprobe',
			[
				'-v',
				'error',
				'-show_entries',
				'format=duration',
				'-of',
				'default=nk=1:nw=1',
				filePath,
			],
			{ stdio: ['ignore', 'pipe', 'pipe'] },
		)

		let stdout = ''
		let stderr = ''
		proc.stdout.on('data', (chunk: Buffer) => {
			stdout += chunk.toString()
		})
		proc.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString()
		})
		proc.on('error', (error) => reject(error))
		proc.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`ffprobe exited with code ${code}: ${stderr}`))
				return
			}
			const duration = Number.parseFloat(stdout.trim())
			if (!Number.isFinite(duration) || duration <= 0) {
				reject(new Error(`Invalid media duration from ffprobe: ${stdout}`))
				return
			}
			resolve(duration)
		})
	})
}

export const renderCommentsComposeExecutor: LocalJobExecutor = async (ctx) => {
	const input = ctx.spec.input as RenderCommentsComposeInput
	if (!input?.overlayVideoPath && !input?.overlayVideoUrl) {
		throw new Error(
			'render-comments-compose requires input.overlayVideoPath or input.overlayVideoUrl',
		)
	}
	if (!input?.sourceVideoPath && !input?.sourceVideoUrl) {
		throw new Error(
			'render-comments-compose requires input.sourceVideoPath or input.sourceVideoUrl',
		)
	}

	const outputDir = resolveOutputPath(
		process.cwd(),
		input.outputDir ||
			path.join('.local-jobs', 'artifacts', ctx.jobId, 'render-comments-compose'),
	)
	await ensureDir(outputDir)
	const outputPath = input.outputPath
		? resolveOutputPath(outputDir, input.outputPath)
		: path.join(outputDir, 'video.mp4')

	await ctx.emit({
		status: 'running',
		phase: 'preparing',
		progress: 0.08,
		message: 'Preparing compose inputs',
	})

	const overlayTempPath = path.join(outputDir, '_overlay.video.mp4')
	const sourceTempPath = path.join(outputDir, '_source.video.mp4')
	const overlayVideoPath = await materializeInputFile({
		path: input.overlayVideoPath,
		url: input.overlayVideoUrl,
		fallbackPath: overlayTempPath,
		timeoutMs: 90_000,
	})
	const sourceVideoPath = await materializeInputFile({
		path: input.sourceVideoPath,
		url: input.sourceVideoUrl,
		fallbackPath: sourceTempPath,
		timeoutMs: 90_000,
	})

	const fpsRaw = Number(input.fps || REMOTION_FPS)
	const fps = Number.isFinite(fpsRaw) && fpsRaw > 0 ? fpsRaw : REMOTION_FPS
	const coverDurationRaw = Number(input.coverDurationSeconds || 3)
	const coverDurationSeconds =
		Number.isFinite(coverDurationRaw) && coverDurationRaw >= 0
			? coverDurationRaw
			: 3
	const totalDurationRaw = Number(input.totalDurationSeconds || 0)
	const totalDurationSeconds =
		Number.isFinite(totalDurationRaw) && totalDurationRaw > 0
			? totalDurationRaw
			: await probeDurationSeconds(overlayVideoPath)
	const layout = normalizeLayout(input.composeLayout)

	const ffmpegArgs = buildComposeArgs({
		overlayPath: overlayVideoPath,
		sourceVideoPath,
		outputPath,
		fps,
		coverDurationSeconds,
		totalDurationSeconds,
		layout,
		videoCodec: input.videoCodec,
		audioCodec: input.audioCodec,
		audioBitrate: input.audioBitrate,
		preset: input.preset || 'veryfast',
		pixFmt: input.pixFmt,
		movFlags: input.movFlags,
		vsync: input.vsync,
	})

	await ctx.emit({
		status: 'running',
		phase: 'running',
		progress: 0.15,
		message: 'Composing overlay onto source video',
	})

	await execFfmpegWithProgress(ffmpegArgs, totalDurationSeconds, async (progress) => {
		if (await ctx.isCanceled()) return
		const ratio = Math.max(0, Math.min(1, progress))
		await ctx.emit({
			status: 'running',
			phase: 'running',
			progress: 0.15 + ratio * 0.8,
			message: 'Composing overlay onto source video',
		})
	})

	if (input.overlayVideoUrl && overlayVideoPath.includes('_overlay.video.mp4')) {
		void fs.unlink(overlayVideoPath).catch(() => {})
	}
	if (input.sourceVideoUrl && sourceVideoPath.includes('_source.video.mp4')) {
		void fs.unlink(sourceVideoPath).catch(() => {})
	}

	const outputs = {
		video: {
			path: outputPath,
			contentType: 'video/mp4',
		},
	}

	const objectStore = ctx.ports.objectStore
	if (objectStore) {
		await ctx.emit({
			status: 'running',
			phase: 'uploading',
			progress: 0.98,
			message: 'Uploading artifacts to object store',
		})
		const key = await objectStore.putFile(
			`${ctx.jobId}/render-comments-compose/video.mp4`,
			outputPath,
			'video/mp4',
		)
		outputs.video.key = key
		if (objectStore.getUrl) {
			const url = await objectStore.getUrl(key)
			if (url) outputs.video.url = url
		}
	}

	await ctx.emit({
		status: 'completed',
		phase: 'completed',
		progress: 1,
		message: 'Comments compose completed',
		outputs,
		metadata: {
			fps,
			coverDurationSeconds,
			totalDurationSeconds,
			composedWithSource: true,
			layout: layout || null,
		},
	})
}
