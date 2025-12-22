'use server'

import { spawn } from 'node:child_process'
import type { TikTokInfo } from './types'

/**
 * Fetches metadata for a TikTok/Douyin video using yt-dlp.
 * Works for domains like tiktok.com, douyin.com, iesdouyin.com, v.douyin.com.
 */
export async function fetchTikTokMetadata(
	url: string,
): Promise<TikTokInfo | null> {
	const args = ['-J', url, '--no-playlist', '--no-warnings']
	try {
		const stdout = await new Promise<string>((resolve, reject) => {
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
		const parsed = JSON.parse(stdout) as TikTokInfo
		return parsed
	} catch {
		return null
	}
}
