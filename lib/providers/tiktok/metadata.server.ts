'use server'

import type { TikTokInfo } from './types'
import YTDlpWrap from 'yt-dlp-wrap'

/**
 * Fetches metadata for a TikTok/Douyin video using yt-dlp.
 * Works for domains like tiktok.com, douyin.com, iesdouyin.com, v.douyin.com.
 */
export async function fetchTikTokMetadata(url: string): Promise<TikTokInfo | null> {
	const ytdlp = new YTDlpWrap()
	try {
		const stdout = await ytdlp.execPromise([
			'-J',
			url,
			'--no-playlist',
			'--no-warnings',
		])
		const parsed = JSON.parse(stdout) as TikTokInfo
		return parsed
	} catch {
		// Return null if info cannot be fetched; caller can fallback
		return null
	}
}