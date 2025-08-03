import ffmpeg from 'fluent-ffmpeg'

export async function extractAudio(
	videoPath: string,
	audioPath: string,
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		ffmpeg(videoPath)
			.noVideo()
			.audioCodec('libmp3lame')
			.audioBitrate('128k')
			.audioFrequency(16000)
			.save(audioPath)
			.on('end', () => resolve())
			.on('error', reject)
	})
}

export async function renderVideoWithSubtitles(
	videoPath: string,
	subtitlePath: string,
	outputPath: string,
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		ffmpeg(videoPath)
			.outputOptions('-vf', `subtitles=${subtitlePath}`)
			.save(outputPath)
			.on('end', resolve)
			.on('error', (err) => {
				console.error('Error rendering video with subtitles:', err.message)
				reject(err)
			})
	})
}
