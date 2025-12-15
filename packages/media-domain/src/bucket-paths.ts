export interface MediaPathOptions {
	title?: string | null
}

/**
 * Normalize a human-facing title into a slug fragment that is safe for use
 * inside R2 object keys. This keeps non-ASCII characters (e.g. 中文) but
 * removes path-breaking characters and trims length.
 */
export function slugifyTitle(rawTitle: string | null | undefined, maxLength = 80): string {
	const fallback = 'untitled'
	if (!rawTitle) return fallback
	let title = rawTitle.trim()
	if (!title) return fallback
	// Replace whitespace with dashes and strip slashes to avoid breaking prefixes
	let slug = title.replace(/\s+/g, '-').replace(/[\\/]+/g, '-')
	// Collapse repeated dashes and trim boundary dashes
	slug = slug.replace(/-+/g, '-').replace(/^-+|-+$/g, '')
	if (!slug) slug = fallback
	if (slug.length > maxLength) {
		slug = slug.slice(0, maxLength).replace(/-+$/g, '')
		if (!slug) slug = fallback
	}
	return slug
}

function mediaRoot(mediaId: string, options?: MediaPathOptions): string {
	const slug = slugifyTitle(options?.title ?? null)
	return `media/${mediaId}-${slug}`
}

function channelRoot(channelId: string, options?: MediaPathOptions): string {
	const slug = slugifyTitle(options?.title ?? null)
	return `channels/${channelId}-${slug}`
}

/**
 * Centralized helpers for every well-known bucket key we write/read.
 * These keep path conventions in one place so Worker、Next 服务与容器不会各自硬编码。
 *
 * All media-related keys are now grouped under:
 *   media/{mediaId}-{slug}/...
 * where slug comes from the media title (best-effort). This makes it easier
 * to visually locate objects in the R2 console.
 */
export const bucketPaths = {
	manifests: {
		// Per-job manifest: immutable snapshot of inputs/outputs for a single async job.
		// This is used by orchestration/containers so they never have to talk to the DB.
		job: (jobId: string) => `manifests/jobs/${jobId}.json`,
	},
	inputs: {
		subtitledVideo: (mediaId: string, options?: MediaPathOptions) =>
			`${mediaRoot(mediaId, options)}/inputs/video/subtitles.mp4`,
		subtitles: (mediaId: string, options?: MediaPathOptions) =>
			`${mediaRoot(mediaId, options)}/inputs/subtitles/subtitles.vtt`,
		comments: (mediaId: string, options?: MediaPathOptions) =>
			`${mediaRoot(mediaId, options)}/inputs/comments/latest.json`,
		channelVideos: (channelId: string, jobId: string, options?: MediaPathOptions) =>
			`${channelRoot(channelId, options)}/jobs/${jobId}/videos.json`,
	},
	downloads: {
		prefix: (mediaId: string, options?: MediaPathOptions) =>
			`${mediaRoot(mediaId, options)}/downloads/`,
		video: (mediaId: string, jobId: string, options?: MediaPathOptions) =>
			`${mediaRoot(mediaId, options)}/downloads/${jobId}/video.mp4`,
		// Source audio extracted losslessly from the downloaded MP4 (-c:a copy).
		audioSource: (mediaId: string, jobId: string, options?: MediaPathOptions) =>
			`${mediaRoot(mediaId, options)}/downloads/${jobId}/audio.source.mka`,
		// Processed audio for downstream workflows (e.g. ASR): 16kHz mono WAV (PCM S16LE).
		audioProcessed: (mediaId: string, jobId: string, options?: MediaPathOptions) =>
			`${mediaRoot(mediaId, options)}/downloads/${jobId}/audio.processed.wav`,
		// Backward-compatible alias: treated as processed audio.
		audio: (mediaId: string, jobId: string, options?: MediaPathOptions) =>
			`${mediaRoot(mediaId, options)}/downloads/${jobId}/audio.processed.wav`,
		metadata: (mediaId: string, jobId: string, options?: MediaPathOptions) =>
			`${mediaRoot(mediaId, options)}/downloads/${jobId}/metadata.json`,
	},
	outputs: {
		video: (mediaId: string, jobId: string, options?: MediaPathOptions) =>
			`${mediaRoot(mediaId, options)}/outputs/${jobId}/video.mp4`,
		byMediaPrefix: (mediaId: string, options?: MediaPathOptions) =>
			`${mediaRoot(mediaId, options)}/outputs/`,
		fallbackVideo: (jobId: string) => `jobs/${jobId}/fallback/video.mp4`,
	},
	asr: {
		processedPrefix: (mediaId: string, options?: MediaPathOptions) =>
			`${mediaRoot(mediaId, options)}/asr/processed/`,
		processedAudio: (mediaId: string, jobId: string, options?: MediaPathOptions) =>
			`${mediaRoot(mediaId, options)}/asr/processed/${jobId}/audio.mp3`,
		results: {
			prefix: (mediaId: string, options?: MediaPathOptions) =>
				`${mediaRoot(mediaId, options)}/asr/results/`,
			transcript: (mediaId: string, jobId: string, options?: MediaPathOptions) =>
				`${mediaRoot(mediaId, options)}/asr/results/${jobId}/transcript.vtt`,
			words: (mediaId: string, jobId: string, options?: MediaPathOptions) =>
				`${mediaRoot(mediaId, options)}/asr/results/${jobId}/words.json`,
		},
	},
}

export type BucketPaths = typeof bucketPaths
