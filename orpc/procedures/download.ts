import fs from 'node:fs/promises'
import path from 'node:path'
import { os } from '@orpc/server'
import ffmpeg from 'fluent-ffmpeg'
import { Innertube, UniversalCache } from 'youtubei.js'
import YTDlpWrap from 'yt-dlp-wrap'
import { z } from 'zod'
import { OPERATIONS_DIR } from '~/lib/constants'

export const download = os
	.input(
		z.object({
			url: z.string().url(),
			quality: z.enum(['1080p', '720p']).optional().default('1080p'),
		}),
	)
	.handler(async ({ input }) => {
		const { url, quality } = input

		// Ensure operations directory exists
		await fs.mkdir(OPERATIONS_DIR, { recursive: true })

		// Fetch video info using YouTube.js
		const yt = await Innertube.create({ cache: new UniversalCache(false) })
		const info = await yt.getBasicInfo(url)
		const title = info.basic_info?.title ?? 'video'
		const sanitizedTitle = title.replace(/[^a-z0-9_-]/gi, '_').slice(0, 60)

		const videoPath = path.join(OPERATIONS_DIR, `${sanitizedTitle}.mp4`)
		const audioPath = path.join(OPERATIONS_DIR, `${sanitizedTitle}.mp3`)

		// Download video with yt-dlp
		const ytdlp = new YTDlpWrap()
		await ytdlp.execPromise([
			url,
			'-f',
			quality === '1080p'
				? 'bestvideo[height<=1080]+bestaudio/best'
				: 'bestvideo[height<=720]+bestaudio/best',
			'-o',
			videoPath,
		])

		// Extract audio using ffmpeg
		await new Promise<void>((resolve, reject) => {
			ffmpeg(videoPath)
				.noVideo()
				.audioCodec('libmp3lame')
				.save(audioPath)
				.on('end', () => resolve())
				.on('error', reject)
		})

		return {
			videoPath,
			audioPath,
			title,
		}
	})
