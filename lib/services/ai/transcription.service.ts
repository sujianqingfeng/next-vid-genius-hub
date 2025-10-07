import fs from 'node:fs/promises'
import path from 'node:path'
import type { AIModelId } from '~/lib/ai/models'

export interface TranscriptionRequest {
	audioPath: string
	language?: string
	model?: string
	outputFormat?: 'json' | 'text' | 'srt' | 'vtt'
}

export interface TranscriptionSegment {
	start: number
	end: number
	text: string
	confidence?: number
}

export interface TranscriptionResult {
	text: string
	segments: TranscriptionSegment[]
	language: string
	duration: number
	wordCount: number
	model: string
}

export interface SubtitleEntry {
	index: number
	startTime: string
	endTime: string
	text: string
}

export class TranscriptionService {
	private readonly defaultModel = 'whisper-1'
	private readonly supportedFormats = ['json', 'text', 'srt', 'vtt'] as const

	/**
	 * 转录音频文件
	 */
	async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
		try {
			const {
				audioPath,
				language = 'auto',
				model = this.defaultModel,
				outputFormat = 'json'
			} = request

			// 验证输入
			await this.validateTranscriptionRequest(request)

			// 检查音频文件是否存在
			await fs.access(audioPath)

			// TODO: Implement transcription service integration
			throw new Error('Transcription service not yet implemented in refactored code')
		} catch (error) {
			console.error('Transcription failed:', error)
			throw new Error(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	}

	/**
	 * 批量转录音频文件
	 */
	async batchTranscribe(
		requests: TranscriptionRequest[],
		onProgress?: (current: number, total: number) => void
	): Promise<Array<{
		success: boolean
		result?: TranscriptionResult
		error?: string
	}>> {
		const results = []

		for (let i = 0; i < requests.length; i++) {
			const request = requests[i]

			try {
				const result = await this.transcribe(request)
				results.push({ success: true, result })
			} catch (error) {
				results.push({
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error'
				})
			}

			// 报告进度
			if (onProgress) {
				onProgress(i + 1, requests.length)
			}
		}

		return results
	}

	/**
	 * 将转录结果转换为字幕格式
	 */
	async generateSubtitles(
		transcriptionResult: TranscriptionResult,
		format: 'srt' | 'vtt' = 'vtt',
		options: {
			maxLineLength?: number
			maxDuration?: number // 每个字幕条目的最大时长（秒）
			mergeThreshold?: number // 合并相邻字幕的时间阈值（秒）
		} = {}
	): Promise<string> {
		const {
			maxLineLength = 42,
			maxDuration = 7,
			mergeThreshold = 0.5
		} = options

		try {
			let subtitles: SubtitleEntry[]

			// 优化分段
			const optimizedSegments = this.optimizeSegments(
				transcriptionResult.segments,
				{ maxLineLength, maxDuration, mergeThreshold }
			)

			// 转换为字幕条目
			subtitles = optimizedSegments.map((segment, index) => ({
				index: index + 1,
				startTime: this.formatTimestamp(segment.start),
				endTime: this.formatTimestamp(segment.end),
				text: segment.text.trim()
			}))

			// 生成指定格式的字幕
			switch (format) {
				case 'srt':
					return this.generateSRT(subtitles)
				case 'vtt':
					return this.generateVTT(subtitles)
				default:
					throw new Error(`Unsupported subtitle format: ${format}`)
			}
		} catch (error) {
			console.error('Subtitle generation failed:', error)
			throw new Error(`Subtitle generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	}

	/**
	 * 保存转录结果到文件
	 */
	async saveTranscription(
		result: TranscriptionResult,
		outputPath: string,
		format: 'json' | 'text' | 'srt' | 'vtt' = 'json'
	): Promise<void> {
		try {
			// 确保输出目录存在
			const outputDir = path.dirname(outputPath)
			await fs.mkdir(outputDir, { recursive: true })

			let content: string

			switch (format) {
				case 'json':
					content = JSON.stringify(result, null, 2)
					break
				case 'text':
					content = result.text
					break
				case 'srt':
				case 'vtt':
					content = await this.generateSubtitles(result, format)
					break
				default:
					throw new Error(`Unsupported format: ${format}`)
			}

			await fs.writeFile(outputPath, content, 'utf-8')
			console.log(`Transcription saved to: ${outputPath}`)
		} catch (error) {
			console.error('Failed to save transcription:', error)
			throw new Error(`Failed to save transcription: ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	}

	/**
	 * 检测音频语言
	 */
	async detectLanguage(audioPath: string): Promise<{
		language: string
		confidence: number
	}> {
		try {
			// 使用转录服务来检测语言
			const result = await this.transcribe({
				audioPath,
				language: 'auto',
				outputFormat: 'json'
			})

			return {
				language: result.language,
				confidence: 0.8 // Whisper 通常有较高的语言检测置信度
			}
		} catch (error) {
			console.error('Language detection failed:', error)
			return {
				language: 'unknown',
				confidence: 0
			}
		}
	}

	/**
	 * 获取支持的音频格式
	 */
	getSupportedAudioFormats(): string[] {
		return [
			'mp3', 'wav', 'm4a', 'flac', 'aac', 'ogg', 'wma',
			'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'
		]
	}

	/**
	 * 获取支持的语言
	 */
	getSupportedLanguages(): Array<{
		code: string
		name: string
		nativeName: string
	}> {
		return [
			{ code: 'auto', name: 'Auto-detect', nativeName: 'Auto-detect' },
			{ code: 'en', name: 'English', nativeName: 'English' },
			{ code: 'zh', name: 'Chinese', nativeName: '中文' },
			{ code: 'ja', name: 'Japanese', nativeName: '日本語' },
			{ code: 'ko', name: 'Korean', nativeName: '한국어' },
			{ code: 'es', name: 'Spanish', nativeName: 'Español' },
			{ code: 'fr', name: 'French', nativeName: 'Français' },
			{ code: 'de', name: 'German', nativeName: 'Deutsch' },
			{ code: 'it', name: 'Italian', nativeName: 'Italiano' },
			{ code: 'pt', name: 'Portuguese', nativeName: 'Português' },
			{ code: 'ru', name: 'Russian', nativeName: 'Русский' },
			{ code: 'ar', name: 'Arabic', nativeName: 'العربية' },
			{ code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
		]
	}

	private async validateTranscriptionRequest(request: TranscriptionRequest): Promise<void> {
		const { audioPath, outputFormat } = request

		// 检查音频文件路径
		if (!audioPath) {
			throw new Error('Audio path is required')
		}

		// 检查文件是否存在
		try {
			await fs.access(audioPath)
		} catch {
			throw new Error(`Audio file not found: ${audioPath}`)
		}

		// 检查输出格式
		if (outputFormat && !this.supportedFormats.includes(outputFormat as any)) {
			throw new Error(`Unsupported output format: ${outputFormat}`)
		}

		// 检查文件扩展名
		const ext = path.extname(audioPath).toLowerCase().slice(1)
		const supportedFormats = this.getSupportedAudioFormats()
		if (!supportedFormats.includes(ext)) {
			throw new Error(`Unsupported audio format: ${ext}`)
		}
	}

	private parseJsonTranscription(data: any, model: string): TranscriptionResult {
		// Whisper API 返回的数据格式可能因版本而异
		// 这里处理常见的格式

		if (data.segments && Array.isArray(data.segments)) {
			// 标准格式
			return {
				text: data.text || '',
				segments: data.segments.map((segment: any) => ({
					start: segment.start || 0,
					end: segment.end || 0,
					text: segment.text || '',
					confidence: segment.confidence
				})),
				language: data.language || 'unknown',
				duration: data.duration || 0,
				wordCount: this.countWords(data.text || ''),
				model
			}
		} else if (data.text) {
			// 简化格式，只有文本
			return {
				text: data.text,
				segments: [{
					start: 0,
					end: data.duration || 0,
					text: data.text
				}],
				language: data.language || 'unknown',
				duration: data.duration || 0,
				wordCount: this.countWords(data.text),
				model
			}
		} else {
			// 文本格式
			const text = typeof data === 'string' ? data : JSON.stringify(data)
			return {
				text,
				segments: [{
					start: 0,
					end: 0,
					text
				}],
				language: 'unknown',
				duration: 0,
				wordCount: this.countWords(text),
				model
			}
		}
	}

	private parseTextTranscription(text: string, model: string): TranscriptionResult {
		return {
			text,
			segments: [{
				start: 0,
				end: 0,
				text
			}],
			language: 'unknown',
			duration: 0,
			wordCount: this.countWords(text),
			model
		}
	}

	private optimizeSegments(
		segments: TranscriptionSegment[],
		options: {
			maxLineLength: number
			maxDuration: number
			mergeThreshold: number
		}
	): TranscriptionSegment[] {
		const { maxLineLength, maxDuration, mergeThreshold } = options
		const optimized: TranscriptionSegment[] = []

		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i]
			let currentSegment = { ...segment }

			// 检查是否需要与下一个分段合并
			while (
				i + 1 < segments.length &&
				(segments[i + 1].start - currentSegment.end) <= mergeThreshold &&
				currentSegment.text.length + segments[i + 1].text.length <= maxLineLength &&
				(segments[i + 1].end - currentSegment.start) <= maxDuration
			) {
				const nextSegment = segments[i + 1]
				currentSegment.text += ' ' + nextSegment.text
				currentSegment.end = nextSegment.end
				i++
			}

			// 如果文本太长，尝试分割
			if (currentSegment.text.length > maxLineLength) {
				const splitSegments = this.splitLongSegment(currentSegment, maxLineLength)
				optimized.push(...splitSegments)
			} else {
				optimized.push(currentSegment)
			}
		}

		return optimized
	}

	private splitLongSegment(segment: TranscriptionSegment, maxLength: number): TranscriptionSegment[] {
		const words = segment.text.split(' ')
		const segments: TranscriptionSegment[] = []
		const duration = segment.end - segment.start
		const timePerWord = duration / words.length

		let currentText = ''
		let currentStart = segment.start
		let wordCount = 0

		for (const word of words) {
			if (currentText.length + word.length + 1 > maxLength && currentText.length > 0) {
				segments.push({
					start: currentStart,
					end: currentStart + (wordCount * timePerWord),
					text: currentText.trim(),
					confidence: segment.confidence
				})
				currentText = word
				currentStart += wordCount * timePerWord
				wordCount = 1
			} else {
				currentText += (currentText ? ' ' : '') + word
				wordCount++
			}
		}

		// 添加最后一个分段
		if (currentText.length > 0) {
			segments.push({
				start: currentStart,
				end: segment.end,
				text: currentText.trim(),
				confidence: segment.confidence
			})
		}

		return segments
	}

	private formatTimestamp(seconds: number): string {
		const hours = Math.floor(seconds / 3600)
		const minutes = Math.floor((seconds % 3600) / 60)
		const secs = Math.floor(seconds % 60)
		const ms = Math.floor((seconds % 1) * 1000)

		return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
	}

	private generateSRT(subtitles: SubtitleEntry[]): string {
		return subtitles.map(subtitle => {
			return `${subtitle.index}\n${subtitle.startTime} --> ${subtitle.endTime}\n${subtitle.text}\n`
		}).join('\n')
	}

	private generateVTT(subtitles: SubtitleEntry[]): string {
		let vtt = 'WEBVTT\n\n'
		vtt += subtitles.map(subtitle => {
			return `${subtitle.startTime} --> ${subtitle.endTime}\n${subtitle.text}\n`
		}).join('\n')
		return vtt
	}

	private countWords(text: string): number {
		return text.trim().split(/\s+/).filter(word => word.length > 0).length
	}
}

// 单例实例
export const transcriptionService = new TranscriptionService()