import path from 'node:path'
import {
	downloadVideo,
	extractAudio,
	extractAudioSource,
} from '@app/media-node'
import type { LocalJobExecutor } from '../contracts'
import { ensureDir, writeJsonFile, resolveOutputPath } from '../fs-utils'

type DownloadInput = {
	url: string
	quality?: '720p' | '1080p'
	proxyUrl?: string
	outputDir?: string
	videoPath?: string
	audioProcessedPath?: string
	audioSourcePath?: string
	metadataPath?: string
}

export const downloadExecutor: LocalJobExecutor = async (ctx) => {
	const input = ctx.spec.input as DownloadInput
	if (!input?.url || typeof input.url !== 'string') {
		throw new Error('download requires input.url')
	}
	const quality = input.quality === '720p' ? '720p' : '1080p'
	const outputDir = resolveOutputPath(
		process.cwd(),
		input.outputDir || path.join('.local-jobs', 'artifacts', ctx.jobId, 'download'),
	)

	await ensureDir(outputDir)
	const videoPath = input.videoPath
		? resolveOutputPath(outputDir, input.videoPath)
		: path.join(outputDir, 'video.mp4')
	const audioSourcePath = input.audioSourcePath
		? resolveOutputPath(outputDir, input.audioSourcePath)
		: path.join(outputDir, 'audio.source.mka')
	const audioProcessedPath = input.audioProcessedPath
		? resolveOutputPath(outputDir, input.audioProcessedPath)
		: path.join(outputDir, 'audio.processed.wav')
	const metadataPath = input.metadataPath
		? resolveOutputPath(outputDir, input.metadataPath)
		: path.join(outputDir, 'metadata.json')

	await ctx.emit({
		status: 'running',
		phase: 'fetching_metadata',
		progress: 0.08,
		message: 'Starting media download',
	})

	const downloadResult = await downloadVideo(input.url, quality, videoPath, {
		proxy: input.proxyUrl,
		captureJson: true,
		onProgress: async (event) => {
			if (await ctx.isCanceled()) return
			if (typeof event.percent === 'number') {
				await ctx.emit({
					status: 'running',
					phase: 'running',
					progress: 0.1 + event.percent * 0.55,
					message: 'Downloading video',
				})
			}
		},
	})

	if (downloadResult?.rawMetadata !== undefined) {
		await writeJsonFile(metadataPath, downloadResult.rawMetadata)
	}

	if (await ctx.isCanceled()) return
	await ctx.emit({
		status: 'running',
		phase: 'running',
		progress: 0.72,
		message: 'Extracting source audio',
	})
	await extractAudioSource(videoPath, audioSourcePath)

	if (await ctx.isCanceled()) return
	await ctx.emit({
		status: 'running',
		phase: 'running',
		progress: 0.85,
		message: 'Extracting processed audio',
	})
	await extractAudio(videoPath, audioProcessedPath)

	if (await ctx.isCanceled()) return

	const outputs = {
		video: { path: videoPath, contentType: 'video/mp4' },
		audioSource: { path: audioSourcePath, contentType: 'audio/x-matroska' },
		audioProcessed: { path: audioProcessedPath, contentType: 'audio/wav' },
		metadata: { path: metadataPath, contentType: 'application/json' },
	}

	if (ctx.ports.objectStore) {
		await ctx.emit({
			status: 'running',
			phase: 'uploading',
			progress: 0.95,
			message: 'Uploading artifacts to object store',
		})
		const prefix = `${ctx.jobId}/download`
		const [videoKey, audioSourceKey, audioProcessedKey, metadataKey] =
			await Promise.all([
				ctx.ports.objectStore.putFile(`${prefix}/video.mp4`, videoPath, 'video/mp4'),
				ctx.ports.objectStore.putFile(
					`${prefix}/audio.source.mka`,
					audioSourcePath,
					'audio/x-matroska',
				),
				ctx.ports.objectStore.putFile(
					`${prefix}/audio.processed.wav`,
					audioProcessedPath,
					'audio/wav',
				),
				ctx.ports.objectStore.putFile(
					`${prefix}/metadata.json`,
					metadataPath,
					'application/json',
				),
			])
		outputs.video.key = videoKey
		outputs.audioSource.key = audioSourceKey
		outputs.audioProcessed.key = audioProcessedKey
		outputs.metadata.key = metadataKey
	}

	await ctx.emit({
		status: 'completed',
		phase: 'completed',
		progress: 1,
		message: 'Download completed',
		outputs,
		metadata: {
			url: input.url,
			quality,
		},
	})
}
