import fs from 'node:fs/promises'
import path from 'node:path'
import { execa } from 'execa'
import { fileExistsServer } from '~/lib/utils/file'

export class MediaProcessingService {
	/**
	 * 从视频文件中提取音频
	 */
	async extractAudio(videoPath: string, audioPath: string): Promise<void> {
		try {
			// 确保输出目录存在
			const outputDir = path.dirname(audioPath)
			await fs.mkdir(outputDir, { recursive: true })

			// 使用 ffmpeg 提取音频
			await execa('ffmpeg', [
				'-i', videoPath,
				'-vn', // 不要视频
				'-acodec', 'mp3',
				'-ab', '192k',
				'-ar', '44100',
				'-y', // 覆盖输出文件
				audioPath
			])

			console.log(`Audio extracted successfully: ${audioPath}`)
		} catch (error) {
			console.error('Failed to extract audio:', error)
			throw new Error(`Audio extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	}

	/**
	 * 获取视频文件信息
	 */
	async getVideoInfo(videoPath: string): Promise<{
		duration: number
		width: number
		height: number
		fileSize: number
		format: string
		codec: string
	} | null> {
		try {
			if (!await fileExistsServer(videoPath)) {
				return null
			}

			// 使用 ffprobe 获取视频信息
			const { stdout } = await execa('ffprobe', [
				'-v', 'quiet',
				'-print_format', 'json',
				'-show_format',
				'-show_streams',
				videoPath
			])

			const probeData = JSON.parse(stdout)

			// 查找视频流
			const videoStream = probeData.streams.find((stream: any) => stream.codec_type === 'video')
			const format = probeData.format

			if (!videoStream || !format) {
				return null
			}

			return {
				duration: parseFloat(format.duration) || 0,
				width: videoStream.width || 0,
				height: videoStream.height || 0,
				fileSize: parseInt(format.size) || 0,
				format: format.format_name || 'unknown',
				codec: videoStream.codec_name || 'unknown'
			}
		} catch (error) {
			console.error('Failed to get video info:', error)
			return null
		}
	}

	/**
	 * 获取音频文件信息
	 */
	async getAudioInfo(audioPath: string): Promise<{
		duration: number
		fileSize: number
		format: string
		codec: string
		bitrate: number
	} | null> {
		try {
			if (!await fileExistsServer(audioPath)) {
				return null
			}

			const { stdout } = await execa('ffprobe', [
				'-v', 'quiet',
				'-print_format', 'json',
				'-show_format',
				'-show_streams',
				audioPath
			])

			const probeData = JSON.parse(stdout)

			// 查找音频流
			const audioStream = probeData.streams.find((stream: any) => stream.codec_type === 'audio')
			const format = probeData.format

			if (!audioStream || !format) {
				return null
			}

			return {
				duration: parseFloat(format.duration) || 0,
				fileSize: parseInt(format.size) || 0,
				format: format.format_name || 'unknown',
				codec: audioStream.codec_name || 'unknown',
				bitrate: parseInt(format.bit_rate) || 0
			}
		} catch (error) {
			console.error('Failed to get audio info:', error)
			return null
		}
	}

	/**
	 * 转换视频格式
	 */
	async convertVideo(
		inputPath: string,
		outputPath: string,
		options: {
			format?: string
			quality?: 'low' | 'medium' | 'high'
			resolution?: string
		} = {}
	): Promise<void> {
		try {
			const { format = 'mp4', quality = 'medium', resolution } = options

			// 确保输出目录存在
			const outputDir = path.dirname(outputPath)
			await fs.mkdir(outputDir, { recursive: true })

			// 构建 ffmpeg 命令
			const args = ['-i', inputPath]

			// 设置分辨率
			if (resolution) {
				args.push('-s', resolution)
			}

			// 设置质量
			const qualitySettings = {
				low: ['-crf', '28'],
				medium: ['-crf', '23'],
				high: ['-crf', '18']
			}
			args.push(...qualitySettings[quality])

			// 设置编码器
			if (format === 'mp4') {
				args.push('-c:v', 'libx264', '-c:a', 'aac')
			}

			args.push('-y', outputPath)

			await execa('ffmpeg', args)

			console.log(`Video converted successfully: ${outputPath}`)
		} catch (error) {
			console.error('Failed to convert video:', error)
			throw new Error(`Video conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	}

	/**
	 * 压缩视频
	 */
	async compressVideo(
		inputPath: string,
		outputPath: string,
		targetFileSize: number // 目标文件大小（字节）
	): Promise<void> {
		try {
			// 获取原始视频信息
			const videoInfo = await this.getVideoInfo(inputPath)
			if (!videoInfo) {
				throw new Error('Cannot get video info')
			}

			const originalSize = videoInfo.fileSize
			const compressionRatio = targetFileSize / originalSize

			if (compressionRatio >= 1) {
				// 不需要压缩
				throw new Error('Video is already smaller than target size')
			}

			// 计算合适的 CRF 值
			let crf = 23
			if (compressionRatio < 0.5) {
				crf = 28
			} else if (compressionRatio < 0.7) {
				crf = 25
			}

			// 确保输出目录存在
			const outputDir = path.dirname(outputPath)
			await fs.mkdir(outputDir, { recursive: true })

			// 使用两遍编码以获得更好的质量
			await execa('ffmpeg', [
				'-i', inputPath,
				'-c:v', 'libx264',
				'-preset', 'medium',
				'-crf', crf.toString(),
				'-c:a', 'aac',
				'-b:a', '128k',
				'-y',
				outputPath
			])

			console.log(`Video compressed successfully: ${outputPath}`)
		} catch (error) {
			console.error('Failed to compress video:', error)
			throw new Error(`Video compression failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	}

	/**
	 * 生成视频缩略图
	 */
	async generateThumbnail(
		videoPath: string,
		thumbnailPath: string,
		options: {
			time?: string // 时间点，默认为 "00:00:01"
			width?: number
			height?: number
		} = {}
	): Promise<void> {
		try {
			const { time = '00:00:01', width = 320, height = 240 } = options

			// 确保输出目录存在
			const outputDir = path.dirname(thumbnailPath)
			await fs.mkdir(outputDir, { recursive: true })

			await execa('ffmpeg', [
				'-i', videoPath,
				'-ss', time,
				'-vframes', '1',
				'-vf', `scale=${width}:${height}`,
				'-y',
				thumbnailPath
			])

			console.log(`Thumbnail generated successfully: ${thumbnailPath}`)
		} catch (error) {
			console.error('Failed to generate thumbnail:', error)
			throw new Error(`Thumbnail generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	}

	/**
	 * 验证媒体文件完整性
	 */
	async validateMediaFile(filePath: string): Promise<{
		isValid: boolean
		error?: string
		info?: any
	}> {
		try {
			if (!await fileExistsServer(filePath)) {
				return { isValid: false, error: 'File does not exist' }
			}

			const stat = await fs.stat(filePath)
			if (stat.size === 0) {
				return { isValid: false, error: 'File is empty' }
			}

			// 使用 ffprobe 验证文件
			const { stdout } = await execa('ffprobe', [
				'-v', 'error',
				'-print_format', 'json',
				'-show_format',
				filePath
			])

			const probeData = JSON.parse(stdout)

			if (!probeData.format) {
				return { isValid: false, error: 'Invalid media file format' }
			}

			return {
				isValid: true,
				info: {
					duration: parseFloat(probeData.format.duration) || 0,
					size: stat.size,
					format: probeData.format.format_name
				}
			}
		} catch (error) {
			return {
				isValid: false,
				error: error instanceof Error ? error.message : 'Unknown validation error'
			}
		}
	}

	/**
	 * 批量处理媒体文件
	 */
	async batchProcess(
		items: Array<{
			inputPath: string
			outputPath: string
			operation: 'extractAudio' | 'convert' | 'compress' | 'thumbnail'
			options?: any
		}>,
		onProgress?: (current: number, total: number) => void
	): Promise<Array<{ success: boolean; error?: string }>> {
		const results = []

		for (let i = 0; i < items.length; i++) {
			const item = items[i]

			try {
				switch (item.operation) {
					case 'extractAudio':
						await this.extractAudio(item.inputPath, item.outputPath)
						break
					case 'convert':
						await this.convertVideo(item.inputPath, item.outputPath, item.options)
						break
					case 'compress':
						await this.compressVideo(item.inputPath, item.outputPath, item.options)
						break
					case 'thumbnail':
						await this.generateThumbnail(item.inputPath, item.outputPath, item.options)
						break
					default:
						throw new Error(`Unknown operation: ${item.operation}`)
				}
				results.push({ success: true })
			} catch (error) {
				results.push({
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error'
				})
			}

			// 报告进度
			if (onProgress) {
				onProgress(i + 1, items.length)
			}
		}

		return results
	}
}

// 单例实例
export const mediaProcessingService = new MediaProcessingService()