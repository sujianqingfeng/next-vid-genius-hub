'use server'

import YTDlpWrap from 'yt-dlp-wrap'

export async function downloadTikTokVideo(
	url: string,
	quality: '1080p' | '720p' = '720p',
	outputPath: string
): Promise<void> {
	const ytdlp = new YTDlpWrap()

	try {
		// TikTok videos typically have limited quality options
		// We'll use a format selector that works well for TikTok
		const formatSelector = quality === '1080p'
			? 'best[height<=1080]'
			: 'best[height<=720]'

		await ytdlp.execPromise([
			url,
			'-f', formatSelector,
			'--merge-output-format', 'mp4',
			'-o', outputPath,
			'--no-playlist',
			// TikTok specific options
			'--extract-flat', 'false',
			'--write-info-json', // Write video info to JSON file
			'--write-thumbnail', // Download thumbnail
		])

		console.log(`TikTok video downloaded successfully: ${outputPath}`)
	} catch (error) {
		console.error('Failed to download TikTok video:', error)
		throw new Error(`TikTok video download failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
	}
}

export async function downloadTikTokAudio(
	url: string,
	outputPath: string
): Promise<void> {
	const ytdlp = new YTDlpWrap()

	try {
		await ytdlp.execPromise([
			url,
			'-x', // Extract audio
			'--audio-format', 'mp3',
			'--audio-quality', '192k',
			'-o', outputPath,
			'--no-playlist',
		])

		console.log(`TikTok audio extracted successfully: ${outputPath}`)
	} catch (error) {
		console.error('Failed to extract TikTok audio:', error)
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
	const ytdlp = new YTDlpWrap()

	try {
		const stdout = await ytdlp.execPromise([
			'-J', '--list-formats', url, '--no-playlist'
		])

		const info = JSON.parse(stdout)
		return info.formats || []
	} catch (error) {
		console.error('Failed to get TikTok video formats:', error)
		return []
	}
}

export async function getTikTokVideoInfo(url: string): Promise<unknown> {
	const ytdlp = new YTDlpWrap()

	try {
		const stdout = await ytdlp.execPromise([
			'-J', url, '--no-playlist'
		])

		return JSON.parse(stdout)
	} catch (error) {
		console.error('Failed to get TikTok video info:', error)
		return null
	}
}