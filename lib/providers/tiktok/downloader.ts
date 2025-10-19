'use server'

import { spawn } from 'node:child_process'
import { logger } from '~/lib/logger'

export async function downloadTikTokVideo(
	url: string,
	quality: '1080p' | '720p' = '720p',
	outputPath: string
): Promise<void> {
	try {
		// TikTok videos typically have limited quality options
		// We'll use a format selector that works well for TikTok
		const formatSelector = quality === '1080p'
			? 'best[height<=1080]'
			: 'best[height<=720]'

		await new Promise<void>((resolve, reject) => {
			const args = [
				url,
				'-f', formatSelector,
				'--merge-output-format', 'mp4',
				'-o', outputPath,
				'--no-playlist',
				'--extract-flat', 'false',
				'--write-info-json',
				'--write-thumbnail',
			]
			const p = spawn('yt-dlp', args)
			let err = ''
			p.stderr.on('data', (d) => (err += d.toString()))
			p.on('close', (code) => {
				if (code === 0) resolve()
				else reject(new Error(err || `yt-dlp exit ${code}`))
			})
			p.on('error', reject)
		})

		
    } catch (error) {
        logger.error('media', `Failed to download TikTok video: ${error instanceof Error ? error.message : String(error)}`)
        throw new Error(`TikTok video download failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
}

export async function downloadTikTokAudio(
	url: string,
	outputPath: string
): Promise<void> {
	try {
		await new Promise<void>((resolve, reject) => {
			const args = [
				url,
				'-x',
				'--audio-format', 'mp3',
				'--audio-quality', '192k',
				'-o', outputPath,
				'--no-playlist',
			]
			const p = spawn('yt-dlp', args)
			let err = ''
			p.stderr.on('data', (d) => (err += d.toString()))
			p.on('close', (code) => {
				if (code === 0) resolve()
				else reject(new Error(err || `yt-dlp exit ${code}`))
			})
			p.on('error', reject)
		})

		
    } catch (error) {
        logger.error('media', `Failed to extract TikTok audio: ${error instanceof Error ? error.message : String(error)}`)
        throw new Error(`TikTok audio extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
}

export async function getTikTokVideoFormats(url: string): Promise<Array<{
	format_id: string
	ext: string
	resolution: string
	fps: number
	filesize?: number
	quality: string
}>> {
	try {
		const stdout = await new Promise<string>((resolve, reject) => {
			const args = ['-J', '--list-formats', url, '--no-playlist']
			const p = spawn('yt-dlp', args)
			let out = ''
			let err = ''
			p.stdout.on('data', (d) => (out += d.toString()))
			p.stderr.on('data', (d) => (err += d.toString()))
			p.on('close', (code) => {
				if (code === 0) resolve(out)
				else reject(new Error(err || `yt-dlp exit ${code}`))
			})
			p.on('error', reject)
		})

		const info = JSON.parse(stdout)
		return info.formats || []
    } catch (error) {
        logger.error('media', `Failed to get TikTok video formats: ${error instanceof Error ? error.message : String(error)}`)
        return []
    }
}

export async function getTikTokVideoInfo(url: string): Promise<unknown> {
	try {
		const stdout = await new Promise<string>((resolve, reject) => {
			const args = ['-J', url, '--no-playlist']
			const p = spawn('yt-dlp', args)
			let out = ''
			let err = ''
			p.stdout.on('data', (d) => (out += d.toString()))
			p.stderr.on('data', (d) => (err += d.toString()))
			p.on('close', (code) => {
				if (code === 0) resolve(out)
				else reject(new Error(err || `yt-dlp exit ${code}`))
			})
			p.on('error', reject)
		})

		return JSON.parse(stdout)
    } catch (error) {
        logger.error('media', `Failed to get TikTok video info: ${error instanceof Error ? error.message : String(error)}`)
        return null
    }
}
