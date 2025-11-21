export type InputVideoVariant = 'raw' | 'subtitles'

/**
 * Centralized helpers for every well-known bucket key we write/read.
 * These keep path conventions in one place so Worker、Next 服务与容器不会各自硬编码。
 */
export const bucketPaths = {
	manifests: {
		media: (mediaId: string) => `manifests/media/${mediaId}.json`,
	},
	inputs: {
		video: (mediaId: string) => `inputs/videos/${mediaId}.mp4`,
		videoVariant: (mediaId: string, variant?: InputVideoVariant) =>
			variant ? `inputs/videos/${variant}/${mediaId}.mp4` : `inputs/videos/${mediaId}.mp4`,
		subtitledVideo: (mediaId: string) => `inputs/videos/subtitles/${mediaId}.mp4`,
		rawVideo: (mediaId: string) => `inputs/videos/raw/${mediaId}.mp4`,
		subtitles: (mediaId: string) => `inputs/subtitles/${mediaId}.vtt`,
		comments: (mediaId: string) => `inputs/comments/${mediaId}.json`,
		channelVideos: (channelId: string, jobId: string) => `inputs/channel-videos/${channelId}/${jobId}.json`,
	},
	downloads: {
		prefix: (mediaId: string) => `downloads/${mediaId}/`,
		video: (mediaId: string, jobId: string) => `downloads/${mediaId}/${jobId}/video.mp4`,
		audio: (mediaId: string, jobId: string) => `downloads/${mediaId}/${jobId}/audio.mp3`,
		metadata: (mediaId: string, jobId: string) => `downloads/${mediaId}/${jobId}/metadata.json`,
	},
	outputs: {
		video: (mediaId: string, jobId: string) => `outputs/by-media/${mediaId}/${jobId}/video.mp4`,
		byMediaPrefix: (mediaId: string) => `outputs/by-media/${mediaId}/`,
		fallbackVideo: (jobId: string) => `outputs/${jobId}/video.mp4`,
	},
	asr: {
		processedPrefix: (mediaId: string) => `asr/processed/${mediaId}/`,
		processedAudio: (mediaId: string, jobId: string) => `asr/processed/${mediaId}/${jobId}/audio.mp3`,
		results: {
			prefix: (mediaId: string) => `asr/results/by-media/${mediaId}/`,
			transcript: (mediaId: string, jobId: string) => `asr/results/by-media/${mediaId}/${jobId}/transcript.vtt`,
			words: (mediaId: string, jobId: string) => `asr/results/by-media/${mediaId}/${jobId}/words.json`,
		},
	},
}

export type BucketPaths = typeof bucketPaths
