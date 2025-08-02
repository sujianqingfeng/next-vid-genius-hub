import YTDlpWrap from 'yt-dlp-wrap'

export async function downloadVideo(
	url: string,
	quality: '1080p' | '720p',
	outputPath: string,
): Promise<void> {
	const ytdlp = new YTDlpWrap()
	await ytdlp.execPromise([
		url,
		'-f',
		quality === '1080p'
			? 'bestvideo[height<=1080]+bestaudio/best'
			: 'bestvideo[height<=720]+bestaudio/best',
		'--merge-output-format',
		'mp4',
		'-o',
		outputPath,
	])
}
