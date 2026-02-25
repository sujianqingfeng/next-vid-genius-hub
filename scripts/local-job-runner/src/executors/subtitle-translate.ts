import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { LocalJobExecutor } from '../contracts'
import { ensureDir, resolveOutputPath, writeJsonFile } from '../fs-utils'
import { readTextFromPathOrUrl } from './io'

type SubtitleTranslateInput = {
	subtitlePath?: string
	subtitleUrl?: string
	subtitleText?: string
	outputPath?: string
	outputDir?: string
	mode?: 'manual'
	manualTemplatePath?: string
	targetLanguage?: string
}

type ParsedCue = {
	start: string
	end: string
	lines: string[]
}

const DEFAULT_TARGET_LANGUAGE = 'zh-CN'
const TIMING_LINE_RE =
	/^(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})(?:\s+.*)?$/

function parseCues(vtt: string): ParsedCue[] {
	const lines = String(vtt || '')
		.replace(/^\uFEFF/, '')
		.split(/\r?\n/)
	const cues: ParsedCue[] = []

	for (let i = 0; i < lines.length; i++) {
		const current = String(lines[i] || '').trim()
		if (!current) continue
		if (current.toUpperCase() === 'WEBVTT') continue

		if (current.startsWith('NOTE')) {
			while (i + 1 < lines.length && String(lines[i + 1] || '').trim()) i += 1
			continue
		}

		let timingLine = current
		if (!TIMING_LINE_RE.test(timingLine)) {
			const next = String(lines[i + 1] || '').trim()
			if (!TIMING_LINE_RE.test(next)) continue
			i += 1
			timingLine = next
		}

		const match = timingLine.match(TIMING_LINE_RE)
		if (!match) continue

		const textLines: string[] = []
		let j = i + 1
		while (j < lines.length) {
			const line = String(lines[j] || '')
			if (!line.trim()) break
			if (TIMING_LINE_RE.test(line.trim())) break
			textLines.push(line.trim())
			j += 1
		}
		i = j - 1

		const normalizedLines = textLines.filter((line) => line.length > 0)
		if (!normalizedLines.length) continue
		cues.push({
			start: match[1]!,
			end: match[2]!,
			lines: normalizedLines,
		})
	}

	return cues
}

function serializeCues(cues: ParsedCue[]): string {
	const out = ['WEBVTT', '']
	for (let i = 0; i < cues.length; i++) {
		const cue = cues[i]!
		out.push(String(i + 1))
		out.push(`${cue.start} --> ${cue.end}`)
		out.push(...cue.lines)
		out.push('')
	}
	return `${out.join('\n')}\n`
}

function normalizeCueText(lines: string[]): string {
	return lines
		.map((line) => String(line || '').trim())
		.filter(Boolean)
		.join(' ')
		.replace(/\s+/g, ' ')
		.trim()
}

function unsupportedModeReason(value: unknown): string | undefined {
	const mode = String(value || '')
		.trim()
		.toLowerCase()
	if (!mode || mode === 'manual') return undefined
	return `Requested mode "${mode}" is no longer supported; generated manual template`
}

export const subtitleTranslateExecutor: LocalJobExecutor = async (ctx) => {
	const input = ctx.spec.input as SubtitleTranslateInput
	if (!input?.subtitlePath && !input?.subtitleUrl && !input?.subtitleText) {
		throw new Error(
			'subtitle-translate requires input.subtitlePath, input.subtitleUrl or input.subtitleText',
		)
	}

	const outputDir = resolveOutputPath(
		process.cwd(),
		input.outputDir ||
			path.join('.local-jobs', 'artifacts', ctx.jobId, 'subtitle-translate'),
	)
	await ensureDir(outputDir)
	const outputPath = input.outputPath
		? resolveOutputPath(outputDir, input.outputPath)
		: path.join(outputDir, 'subtitles.manual.vtt')
	const manualTemplatePath = input.manualTemplatePath
		? resolveOutputPath(outputDir, input.manualTemplatePath)
		: path.join(outputDir, 'subtitle-translation.template.json')

	const targetLanguage = String(input.targetLanguage || DEFAULT_TARGET_LANGUAGE).trim()
	const reason = unsupportedModeReason(input.mode)

	await ctx.emit({
		status: 'running',
		phase: 'preparing',
		progress: 0.06,
		message: 'Loading subtitle input for manual translation',
	})

	const subtitleText = input.subtitleText
		? String(input.subtitleText)
		: await readTextFromPathOrUrl({
				path: input.subtitlePath,
				url: input.subtitleUrl,
				timeoutMs: 45_000,
			})

	const cues = parseCues(subtitleText)
	if (!cues.length) {
		throw new Error('subtitle-translate found no valid cues in input VTT')
	}

	await ctx.emit({
		status: 'running',
		phase: 'running',
		progress: 0.2,
		message: 'Generating manual subtitle translation template',
	})

	const template = {
		version: 1,
		kind: 'subtitle-translation-template',
		generatedAt: new Date().toISOString(),
		targetLanguage,
		mode: 'manual',
		reason: reason || undefined,
		items: cues.map((cue, index) => ({
			index,
			start: cue.start,
			end: cue.end,
			sourceLines: cue.lines,
			sourceText: normalizeCueText(cue.lines),
			translatedText: '',
			status: 'pending' as const,
		})),
	}

	if (await ctx.isCanceled()) return
	await fs.writeFile(outputPath, serializeCues(cues), 'utf8')
	await writeJsonFile(manualTemplatePath, template)

	const outputs = {
		subtitle: {
			path: outputPath,
			contentType: 'text/vtt',
		},
		manualTemplate: {
			path: manualTemplatePath,
			contentType: 'application/json',
		},
	}

	await ctx.emit({
		status: 'completed',
		phase: 'completed',
		progress: 1,
		message: 'Subtitle translation prepared for manual editing',
		outputs,
		metadata: {
			mode: 'manual',
			targetLanguage,
			reason: reason || undefined,
			totalCues: cues.length,
			pendingCues: cues.length,
		},
	})
}
