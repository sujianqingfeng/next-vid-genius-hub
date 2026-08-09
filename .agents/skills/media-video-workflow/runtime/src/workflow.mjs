#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	MODERATION_CONFIDENCE,
	MODERATION_DECISIONS,
	SCHEMA_VERSION,
	createTask,
	ensureDir,
	normalizeCommentsSnapshot,
	normalizeText,
	parseVtt,
	pathExists,
	readJson,
	readJsonl,
	relativeArtifact,
	resolveArtifact,
	resolvePath,
	runProcess,
	serializeVtt,
	sourceHash,
	writeJson,
	writeJsonl,
} from './lib.mjs'

const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
	const positional = []
	const flags = {}
	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index]
		if (!value.startsWith('--')) {
			positional.push(value)
			continue
		}
		const [rawKey, inlineValue] = value.slice(2).split(/=(.*)/s, 2)
		if (inlineValue !== undefined) {
			flags[rawKey] = inlineValue
			continue
		}
		const next = argv[index + 1]
		if (!next || next.startsWith('--')) {
			flags[rawKey] = true
			continue
		}
		flags[rawKey] = next
		index += 1
	}
	return { positional, flags }
}

function flagString(flags, name, fallback = '') {
	const value = flags[name]
	if (typeof value !== 'string') return fallback
	return value.trim() || fallback
}

function requiredFlag(flags, name) {
	const value = flagString(flags, name)
	if (!value) throw new Error(`--${name} is required`)
	return value
}

function print(value) {
	console.log(JSON.stringify(value, null, 2))
}

function usage() {
	console.log(`mediaflow - standalone translated media workflow

Usage:
  mediaflow doctor
  mediaflow download --url <url> --out <video.mp4> [--quality 1080] [--cookies <cookies.txt>] [--remote-components ejs:github|none] [--proxy <url>]
  mediaflow fetch-comments --url <url> --out <comments.json> [--max-comments 100] [--cookies <cookies.txt>] [--remote-components ejs:github|none] [--proxy <url>]
  mediaflow extract-audio --video <video.mp4> --out <audio.wav>
  mediaflow asr --audio <audio.wav> --out <transcript.vtt> [--api-url <url>] [--model <id>] [--language <code>]
  mediaflow prepare-subtitles --input <transcript.vtt> --out <run-dir> [--target-language zh-CN]
  mediaflow prepare-comments --input <comments.json> --out <run-dir> [--target-language zh-CN]
  mediaflow validate --kind <subtitles|comments> --tasks <results.jsonl> [--manifest <manifest.json>]
  mediaflow materialize-subtitles --tasks <results.jsonl> --out <bilingual.vtt> [--format bilingual|replace]
  mediaflow materialize-comments --tasks <results.jsonl> --out <output-dir>
  mediaflow render-subtitles --video <video.mp4> --subtitles <subtitles.vtt> --out <video.mp4>
  mediaflow render-comments --input <comments.safe.json> --out <video.mp4> [--template landscape|vertical] [--video <source.mp4>]
  mediaflow status --workdir <run-dir>
  mediaflow publish-bilibili --video <mp4> --title <t> [--tid 21] [--tag a,b] [--desc <t>] [--cover <img>] [--cookie-file .bili.env] [--python python3] [--dry-run]
`)
}

function now() {
	return new Date().toISOString()
}

async function writeManifest(manifestPath, manifest) {
	manifest.updatedAt = now()
	await writeJson(manifestPath, manifest)
}

function workDirForTasks(tasksPath, manifestFlag) {
	if (manifestFlag) return path.dirname(resolvePath(manifestFlag))
	const tasksDir = path.dirname(resolvePath(tasksPath))
	return path.dirname(tasksDir)
}

async function loadManifestForTasks(tasksPath, flags) {
	const manifestPath = flags.manifest
		? resolvePath(flags.manifest)
		: path.join(workDirForTasks(tasksPath), 'manifest.json')
	if (!(await pathExists(manifestPath))) {
		throw new Error(`Manifest not found: ${manifestPath}. Pass --manifest explicitly if needed.`)
	}
	const manifest = await readJson(manifestPath)
	if (manifest.schemaVersion !== SCHEMA_VERSION) {
		throw new Error(`Unsupported manifest schema version: ${String(manifest.schemaVersion)}`)
	}
	return { manifestPath, manifest, workDir: path.dirname(manifestPath) }
}

function expectedTaskMap(manifest) {
	if (!Array.isArray(manifest.expectedTasks) || !manifest.expectedTasks.length) {
		throw new Error('Manifest has no expected task records')
	}
	return new Map(manifest.expectedTasks.map((task) => [task.id, task]))
}

function validateRows(rows, manifest, workflow) {
	if (manifest.workflow !== workflow) {
		throw new Error(`Task manifest is for ${manifest.workflow}, not ${workflow}`)
	}
	if (!rows.length) throw new Error('Task result file is empty')

	const expected = expectedTaskMap(manifest)
	const accepted = new Map()
	for (const row of rows) {
		if (!row || typeof row !== 'object' || Array.isArray(row)) {
			throw new Error('Each JSONL row must be an object')
		}
		if (row.schemaVersion !== SCHEMA_VERSION) {
			throw new Error(`Unsupported task schema version for ${String(row.id || 'unknown')}`)
		}
		const id = normalizeText(row.id)
		const expectedTask = expected.get(id)
		if (!expectedTask) throw new Error(`Unexpected task id: ${id || '(empty)'}`)
		if (accepted.has(id)) throw new Error(`Duplicate task id: ${id}`)
		if (row.kind !== expectedTask.kind) throw new Error(`Task kind changed for ${id}`)
		if (row.sourceHash !== expectedTask.sourceHash || sourceHash(row) !== expectedTask.sourceHash) {
			throw new Error(`Source content changed or hash mismatch for ${id}`)
		}
		if (normalizeText(row.translation).length === 0) {
			throw new Error(`Missing translation for ${id}`)
		}
		if (normalizeText(row.status) !== 'completed') {
			throw new Error(`Task ${id} must have status="completed"`)
		}

		if (workflow === 'comments' && row.kind === 'comment') {
			const moderation = row.moderation
			if (!moderation || typeof moderation !== 'object' || Array.isArray(moderation)) {
				throw new Error(`Missing moderation record for ${id}`)
			}
			if (!MODERATION_DECISIONS.has(moderation.decision)) {
				throw new Error(`Invalid moderation decision for ${id}`)
			}
			if (!MODERATION_CONFIDENCE.has(moderation.confidence)) {
				throw new Error(`Invalid moderation confidence for ${id}`)
			}
			if (!Array.isArray(moderation.categories)) {
				throw new Error(`Moderation categories must be an array for ${id}`)
			}
			if (!normalizeText(moderation.reasonCode)) {
				throw new Error(`Moderation reasonCode is required for ${id}`)
			}
		}
		accepted.set(id, row)
	}

	const missing = [...expected.keys()].filter((id) => !accepted.has(id))
	if (missing.length) {
		throw new Error(`Missing ${missing.length} task result(s): ${missing.slice(0, 12).join(', ')}`)
	}

	return accepted
}

async function prepareSubtitles(flags) {
	const sourcePath = resolvePath(requiredFlag(flags, 'input'))
	const workDir = resolvePath(requiredFlag(flags, 'out'))
	const targetLanguage = flagString(flags, 'target-language', 'zh-CN')
	const sourceText = await fs.readFile(sourcePath, 'utf8')
	const cues = parseVtt(sourceText)
	if (!cues.length) throw new Error('No valid VTT cues found')

	const inputDir = path.join(workDir, 'input')
	const tasksDir = path.join(workDir, 'tasks')
	await ensureDir(inputDir)
	await ensureDir(tasksDir)
	const copiedSourcePath = path.join(inputDir, 'transcript.vtt')
	await fs.copyFile(sourcePath, copiedSourcePath)

	const tasks = cues.map((cue) =>
		createTask({
			kind: 'subtitle',
			id: `subtitle:${cue.index + 1}`,
			source: cue,
			targetLanguage,
		}),
	)
	const taskPath = path.join(tasksDir, 'subtitles.pending.jsonl')
	const manifestPath = path.join(workDir, 'manifest.json')
	const manifest = {
		schemaVersion: SCHEMA_VERSION,
		workflow: 'subtitles',
		state: 'awaiting_agent',
		createdAt: now(),
		updatedAt: now(),
		targetLanguage,
		expectedTasks: tasks.map((task) => ({
			id: task.id,
			kind: task.kind,
			sourceHash: task.sourceHash,
		})),
		artifacts: {
			source: relativeArtifact(workDir, copiedSourcePath),
			pendingTasks: relativeArtifact(workDir, taskPath),
		},
	}
	await writeJsonl(taskPath, tasks)
	await writeManifest(manifestPath, manifest)
	print({ workDir, manifestPath, taskPath, state: manifest.state, tasks: tasks.length })
}

async function prepareComments(flags) {
	const sourcePath = resolvePath(requiredFlag(flags, 'input'))
	const workDir = resolvePath(requiredFlag(flags, 'out'))
	const targetLanguage = flagString(flags, 'target-language', 'zh-CN')
	const snapshot = normalizeCommentsSnapshot(await readJson(sourcePath))

	const inputDir = path.join(workDir, 'input')
	const tasksDir = path.join(workDir, 'tasks')
	await ensureDir(inputDir)
	await ensureDir(tasksDir)
	const normalizedSourcePath = path.join(inputDir, 'comments.source.json')
	await writeJson(normalizedSourcePath, snapshot)

	const tasks = [
		createTask({
			kind: 'comment-title',
			id: 'comment-title:1',
			source: { title: snapshot.videoInfo.title },
			targetLanguage,
		}),
		...snapshot.comments.map((comment) =>
			createTask({
				kind: 'comment',
				id: `comment:${comment.id}`,
				source: comment,
				targetLanguage,
			}),
		),
	]
	const taskPath = path.join(tasksDir, 'comments.pending.jsonl')
	const manifestPath = path.join(workDir, 'manifest.json')
	const manifest = {
		schemaVersion: SCHEMA_VERSION,
		workflow: 'comments',
		state: 'awaiting_agent',
		createdAt: now(),
		updatedAt: now(),
		targetLanguage,
		expectedTasks: tasks.map((task) => ({
			id: task.id,
			kind: task.kind,
			sourceHash: task.sourceHash,
		})),
		artifacts: {
			source: relativeArtifact(workDir, normalizedSourcePath),
			pendingTasks: relativeArtifact(workDir, taskPath),
		},
	}
	await writeJsonl(taskPath, tasks)
	await writeManifest(manifestPath, manifest)
	print({ workDir, manifestPath, taskPath, state: manifest.state, tasks: tasks.length })
}

async function validate(flags) {
	const workflow = requiredFlag(flags, 'kind')
	if (workflow !== 'subtitles' && workflow !== 'comments') {
		throw new Error('--kind must be subtitles or comments')
	}
	const tasksPath = resolvePath(requiredFlag(flags, 'tasks'))
	const rows = await readJsonl(tasksPath)
	const { manifestPath, manifest, workDir } = await loadManifestForTasks(tasksPath, flags)
	const accepted = validateRows(rows, manifest, workflow)
	manifest.state = 'validated'
	manifest.artifacts.validatedTasks = relativeArtifact(workDir, tasksPath)
	await writeManifest(manifestPath, manifest)
	print({ manifestPath, tasksPath, workflow, state: manifest.state, validated: accepted.size })
}

async function materializeSubtitles(flags) {
	const tasksPath = resolvePath(requiredFlag(flags, 'tasks'))
	const outputPath = resolvePath(requiredFlag(flags, 'out'))
	const format = flagString(flags, 'format', 'bilingual')
	if (format !== 'bilingual' && format !== 'replace') {
		throw new Error('--format must be bilingual or replace')
	}
	const rows = await readJsonl(tasksPath)
	const { manifestPath, manifest, workDir } = await loadManifestForTasks(tasksPath, flags)
	const tasks = validateRows(rows, manifest, 'subtitles')
	const cues = manifest.expectedTasks.map((expected) => {
		const task = tasks.get(expected.id)
		const source = task.source
		const sourceLines = Array.isArray(source.sourceLines) ? source.sourceLines : [source.sourceText]
		return {
			start: source.start,
			end: source.end,
			lines:
				format === 'replace'
					? [normalizeText(task.translation)]
					: [...sourceLines, normalizeText(task.translation)],
		}
	})
	await ensureDir(path.dirname(outputPath))
	await fs.writeFile(outputPath, serializeVtt(cues), 'utf8')
	manifest.state = 'materialized'
	manifest.artifacts.subtitle = relativeArtifact(workDir, outputPath)
	await writeManifest(manifestPath, manifest)
	print({ manifestPath, outputPath, cues: cues.length, format })
}

async function materializeComments(flags) {
	const tasksPath = resolvePath(requiredFlag(flags, 'tasks'))
	const outputDir = resolvePath(requiredFlag(flags, 'out'))
	const rows = await readJsonl(tasksPath)
	const { manifestPath, manifest, workDir } = await loadManifestForTasks(tasksPath, flags)
	const tasks = validateRows(rows, manifest, 'comments')
	const sourcePath = resolveArtifact(workDir, manifest.artifacts.source)
	const snapshot = normalizeCommentsSnapshot(await readJson(sourcePath))
	const title = tasks.get('comment-title:1')
	const safe = []
	const quarantine = []

	for (const comment of snapshot.comments) {
		const task = tasks.get(`comment:${comment.id}`)
		const moderation = task.moderation
		const record = {
			...comment,
			translatedContent: normalizeText(task.translation),
			moderation: {
				decision: moderation.decision,
				categories: moderation.categories.map((category) => normalizeText(category)).filter(Boolean),
				confidence: moderation.confidence,
				reasonCode: normalizeText(moderation.reasonCode),
			},
		}
		if (moderation.decision === 'allow') {
			safe.push(record)
		} else {
			quarantine.push(record)
		}
	}

	await ensureDir(outputDir)
	const safePath = path.join(outputDir, 'comments.safe.json')
	const quarantinePath = path.join(outputDir, 'comments.quarantine.json')
	const reportPath = path.join(outputDir, 'moderation-report.json')
	await writeJson(safePath, {
		schemaVersion: SCHEMA_VERSION,
		kind: 'mediaflow-safe-comments',
		policy: 'default-fail-closed',
		videoInfo: { ...snapshot.videoInfo, translatedTitle: normalizeText(title.translation) },
		comments: safe,
	})
	await writeJson(quarantinePath, {
		schemaVersion: SCHEMA_VERSION,
		kind: 'mediaflow-quarantined-comments',
		policy: 'default-fail-closed',
		videoInfo: { ...snapshot.videoInfo, translatedTitle: normalizeText(title.translation) },
		comments: quarantine,
	})
	const byDecision = Object.fromEntries(
		[...MODERATION_DECISIONS].map((decision) => [
			decision,
			quarantine.filter((comment) => comment.moderation.decision === decision).length +
				safe.filter((comment) => comment.moderation.decision === decision).length,
		]),
	)
	await writeJson(reportPath, {
		schemaVersion: SCHEMA_VERSION,
		generatedAt: now(),
		policy: 'default-fail-closed',
		totalComments: snapshot.comments.length,
		allowedComments: safe.length,
		quarantinedComments: quarantine.length,
		byDecision,
	})
	manifest.state = 'materialized'
	manifest.artifacts.safeComments = relativeArtifact(workDir, safePath)
	manifest.artifacts.quarantinedComments = relativeArtifact(workDir, quarantinePath)
	manifest.artifacts.moderationReport = relativeArtifact(workDir, reportPath)
	await writeManifest(manifestPath, manifest)
	print({ manifestPath, safePath, quarantinePath, reportPath, allowed: safe.length, quarantined: quarantine.length })
}

function ffmpegSubtitleFilename(filePath) {
	return resolvePath(filePath)
		.replace(/\\/g, '/')
		.replace(/:/g, '\\:')
		.replace(/'/g, "\\'")
		.replace(/,/g, '\\,')
}

async function renderSubtitles(flags) {
	const videoPath = resolvePath(requiredFlag(flags, 'video'))
	const subtitlePath = resolvePath(requiredFlag(flags, 'subtitles'))
	const outputPath = resolvePath(requiredFlag(flags, 'out'))
	await ensureDir(path.dirname(outputPath))
	await runProcess('ffmpeg', [
		'-y',
		'-hide_banner',
		'-loglevel',
		'error',
		'-i',
		videoPath,
		'-vf',
		`subtitles=filename='${ffmpegSubtitleFilename(subtitlePath)}'`,
		'-c:a',
		'copy',
		outputPath,
	])
	print({ outputPath, renderer: 'ffmpeg-subtitles' })
}

async function renderComments(flags) {
	const inputPath = resolvePath(requiredFlag(flags, 'input'))
	const outputPath = resolvePath(requiredFlag(flags, 'out'))
	const templateRaw = flagString(flags, 'template', 'landscape')
	const template = templateRaw === 'vertical' || templateRaw === 'portrait' ? 'vertical' : 'landscape'
	const sourceVideoPath = flagString(flags, 'video')
	const { renderCommentsVideo } = await import('./render-comments.mjs')
	await renderCommentsVideo({
		inputPath,
		outputPath,
		template,
		sourceVideoPath: sourceVideoPath ? resolvePath(sourceVideoPath) : undefined,
	})
	print({ outputPath, renderer: `remotion-${template}`, composedWithSource: Boolean(sourceVideoPath) })
}

async function extractAudio(flags) {
	const videoPath = resolvePath(requiredFlag(flags, 'video'))
	const outputPath = resolvePath(requiredFlag(flags, 'out'))
	await ensureDir(path.dirname(outputPath))
	await runProcess('ffmpeg', [
		'-y',
		'-hide_banner',
		'-loglevel',
		'error',
		'-i',
		videoPath,
		'-vn',
		'-ac',
		'1',
		'-ar',
		'16000',
		'-c:a',
		'pcm_s16le',
		outputPath,
	])
	print({ outputPath, sampleRate: 16000, channels: 1 })
}

function asrTimestamp(seconds) {
	const safe = Math.max(0, Number(seconds))
	const hours = Math.floor(safe / 3600)
	const minutes = Math.floor((safe % 3600) / 60)
	const wholeSeconds = Math.floor(safe % 60)
	const milliseconds = Math.round((safe - Math.floor(safe)) * 1000)
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

function vttFromSegments(segments) {
	const cues = segments
		.filter(
			(segment) =>
				segment &&
				Number.isFinite(Number(segment.start)) &&
				Number.isFinite(Number(segment.end)) &&
					normalizeText(segment.text),
		)
		.map((segment) => ({
			start: asrTimestamp(segment.start),
			end: asrTimestamp(segment.end),
			lines: [normalizeText(segment.text)],
		}))
	if (!cues.length) throw new Error('ASR response did not contain timestamped segments')
	return serializeVtt(cues)
}

function audioContentType(filePath) {
	const ext = path.extname(filePath).toLowerCase()
	return (
		{
			'.wav': 'audio/wav',
			'.mp3': 'audio/mpeg',
			'.m4a': 'audio/mp4',
			'.aac': 'audio/aac',
			'.ogg': 'audio/ogg',
			'.oga': 'audio/ogg',
			'.flac': 'audio/flac',
			'.webm': 'audio/webm',
		}[ext] || 'audio/wav'
	)
}

// Cloudflare Workers AI Whisper has a per-request time budget: audio longer than
// ~60-90s returns 408 (code 3007). Long audio is transcribed in fixed-length
// chunks and the cues are offset back into the original timeline. CF's response is
// { result: { text, vtt, words, ... } }; its `vtt` may use seconds-only cues, so
// timestamps are parsed to seconds and re-serialized via asrTimestamp.
const CF_ASR_CHUNK_SECONDS = 30

async function audioDurationSeconds(filePath) {
	const result = spawnSync(
		'ffprobe',
		['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
		{ encoding: 'utf8' },
	)
	if (result.status !== 0) throw new Error(`ffprobe could not read duration for ${filePath}`)
	const seconds = Number((result.stdout || '').trim())
	if (!Number.isFinite(seconds)) throw new Error(`Could not parse audio duration for ${filePath}`)
	return seconds
}

function cfTimestampToSeconds(token) {
	const parts = String(token).replace(',', '.').trim().split(':')
	if (parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) return null
	let seconds = 0
	for (const part of parts) seconds = seconds * 60 + Number(part)
	return seconds
}

function parseCloudflareVttCues(vtt) {
	const cues = []
	const lines = String(vtt).replace(/\r/g, '').split('\n')
	for (let i = 0; i < lines.length; i += 1) {
		if (!lines[i].includes('-->')) continue
		const [leftRaw, rightRaw] = lines[i].split('-->')
		const startSec = cfTimestampToSeconds((leftRaw || '').trim().split(/\s+/)[0])
		const endSec = cfTimestampToSeconds((rightRaw || '').trim().split(/\s+/)[0])
		if (startSec == null || endSec == null) continue
		const textLines = []
		let j = i + 1
		while (j < lines.length && lines[j].trim() && !lines[j].includes('-->')) {
			textLines.push(lines[j].trim())
			j += 1
		}
		const text = textLines.join(' ').replace(/\s+/g, ' ').trim()
		if (text) cues.push({ startSec, endSec, text })
		i = j - 1
	}
	return cues
}

function cloudflareCuesFromResult(result) {
	if (typeof result.vtt === 'string' && result.vtt.trim()) return parseCloudflareVttCues(result.vtt)
	const segments = Array.isArray(result.segments) ? result.segments : []
	return segments
		.filter(
			(segment) =>
				Number.isFinite(Number(segment.start)) &&
				Number.isFinite(Number(segment.end)) &&
				normalizeText(segment.text),
		)
		.map((segment) => ({
			startSec: Number(segment.start),
			endSec: Number(segment.end),
			text: normalizeText(segment.text),
		}))
}

async function cloudflareRequest({ bytes, contentType, url, apiKey }) {
	const response = await fetch(url, {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': contentType },
		body: bytes,
	})
	if (!response.ok) {
		throw new Error(`Cloudflare ASR request failed: ${response.status} ${await response.text()}`)
	}
	const json = await response.json()
	return (json && json.result) || {}
}

async function cloudflareAsr({ audioPath, url, apiKey }) {
	const contentType = audioContentType(audioPath)
	const duration = await audioDurationSeconds(audioPath)
	const records =
		duration > CF_ASR_CHUNK_SECONDS
			? await cloudflareChunkedCues({ audioPath, duration, contentType, url, apiKey })
			: cloudflareCuesFromResult(
					await cloudflareRequest({ bytes: await fs.readFile(audioPath), contentType, url, apiKey }),
				)
	const cues = records.map((record) => ({
		start: asrTimestamp(record.startSec),
		end: asrTimestamp(record.endSec),
		lines: [record.text],
	}))
	if (!cues.length) throw new Error('Cloudflare ASR produced no cues')
	return serializeVtt(cues)
}

async function cloudflareChunkedCues({ audioPath, duration, contentType, url, apiKey }) {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mediaflow-cf-asr-'))
	const records = []
	try {
		for (let start = 0; start < duration; start += CF_ASR_CHUNK_SECONDS) {
			const chunkPath = path.join(tmpDir, `chunk-${start}.wav`)
			await runProcess('ffmpeg', [
				'-y',
				'-hide_banner',
				'-loglevel',
				'error',
				'-ss',
				String(start),
				'-t',
				String(CF_ASR_CHUNK_SECONDS),
				'-i',
				audioPath,
				'-ar',
				'16000',
				'-ac',
				'1',
				chunkPath,
			])
			const bytes = await fs.readFile(chunkPath)
			try {
				const result = await cloudflareRequest({ bytes, contentType, url, apiKey })
				for (const cue of cloudflareCuesFromResult(result)) {
					records.push({ startSec: cue.startSec + start, endSec: cue.endSec + start, text: cue.text })
				}
			} catch (error) {
				console.error(`[mediaflow] ASR chunk @${start}s skipped: ${error.message}`)
			}
		}
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true })
	}
	if (!records.length) throw new Error('Cloudflare ASR produced no cues across chunks')
	return records
}

async function asr(flags) {
	const audioPath = resolvePath(requiredFlag(flags, 'audio'))
	const outputPath = resolvePath(requiredFlag(flags, 'out'))
	const apiUrl = flagString(flags, 'api-url', process.env.MEDIAFLOW_ASR_API_URL || '')
	const apiKey = process.env.MEDIAFLOW_ASR_API_KEY || ''
	if (!apiUrl) throw new Error('Set MEDIAFLOW_ASR_API_URL or pass --api-url')
	if (!apiKey) throw new Error('Set MEDIAFLOW_ASR_API_KEY before running ASR')
	const parsedUrl = new URL(apiUrl)
	if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
		throw new Error('ASR API URL must use http or https')
	}
	// Cloudflare Workers AI is auto-detected by host (api.cloudflare.com); see
	// cloudflareAsr for the raw-binary body, chunking, and timestamp handling.
	// Anything else is treated as an OpenAI-compatible /v1/audio/transcriptions.
	const isCloudflare = parsedUrl.hostname === 'api.cloudflare.com'

	let vtt
	if (isCloudflare) {
		vtt = await cloudflareAsr({ audioPath, url: parsedUrl, apiKey })
	} else {
		const form = new FormData()
		const bytes = await fs.readFile(audioPath)
		form.append('file', new Blob([bytes]), path.basename(audioPath))
		form.append('model', flagString(flags, 'model', process.env.MEDIAFLOW_ASR_MODEL || 'whisper-1'))
		form.append('response_format', 'verbose_json')
		const language = flagString(flags, 'language')
		if (language) form.append('language', language)
		const response = await fetch(parsedUrl, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}` },
			body: form,
		})
		if (!response.ok) {
			throw new Error(`ASR request failed: ${response.status} ${await response.text()}`)
		}
		const contentType = response.headers.get('content-type') || ''
		vtt = contentType.includes('text/vtt')
			? await response.text()
			: vttFromSegments((await response.json()).segments || [])
	}
	await ensureDir(path.dirname(outputPath))
	await fs.writeFile(outputPath, vtt, 'utf8')
	print({ outputPath, provider: parsedUrl.origin, cloudflare: isCloudflare })
}

function isYoutubeUrl(value) {
	try {
		const hostname = new URL(value).hostname.toLowerCase()
		return hostname === 'youtu.be' || hostname === 'youtube.com' || hostname.endsWith('.youtube.com')
	} catch {
		return false
	}
}

function appendYtDlpAccessArgs(args, flags, url, commentLimit = null) {
	const cookies = flagString(flags, 'cookies')
	if (cookies) args.push('--cookies', resolvePath(cookies))
	if (isYoutubeUrl(url)) {
		args.push('--js-runtimes', 'node')
		// YouTube's nsig challenge needs a solver script distribution; without it
		// yt-dlp only finds storyboard images and "Requested format is not available".
		// `--remote-components ejs:github` is the yt-dlp-recommended default; pass
		// `--remote-components none` to opt out (e.g. fully offline runs).
		const remoteComponents = flagString(flags, 'remote-components', 'ejs:github')
		if (remoteComponents && remoteComponents.toLowerCase() !== 'none') {
			args.push('--remote-components', remoteComponents)
		}
		if (commentLimit && commentLimit !== 'all') {
			args.push('--extractor-args', `youtube:max_comments=${commentLimit}`)
		}
	}
	const proxy = flagString(flags, 'proxy')
	if (proxy) args.push('--proxy', proxy)
}

function maxComments(flags) {
	const value = flagString(flags, 'max-comments', '100')
	if (value === 'all') return value
	const count = Number(value)
	if (!Number.isSafeInteger(count) || count <= 0) {
		throw new Error('--max-comments must be a positive integer or "all"')
	}
	return String(count)
}

async function download(flags) {
	const url = requiredFlag(flags, 'url')
	const outputPath = resolvePath(requiredFlag(flags, 'out'))
	const quality = Number(flagString(flags, 'quality', '1080'))
	if (!Number.isFinite(quality) || quality <= 0) throw new Error('--quality must be a positive number')
	await ensureDir(path.dirname(outputPath))
	const args = [
		'--no-playlist',
		'--merge-output-format',
		'mp4',
		'--format',
		`bv*[height<=${Math.floor(quality)}]+ba/b[height<=${Math.floor(quality)}]/b`,
		'--output',
		outputPath,
	]
	appendYtDlpAccessArgs(args, flags, url)
	args.push(url)
	await runProcess('yt-dlp', args)
	print({ outputPath, source: url })
}

async function fetchComments(flags) {
	const url = requiredFlag(flags, 'url')
	const outputPath = resolvePath(requiredFlag(flags, 'out'))
	const commentLimit = maxComments(flags)
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mediaflow-comments-'))
	try {
		const outputTemplate = path.join(tempDir, 'source.%(ext)s')
		const args = [
			'--no-playlist',
			'--skip-download',
			'--write-comments',
			'--write-info-json',
			'--output',
			outputTemplate,
		]
		appendYtDlpAccessArgs(args, flags, url, commentLimit)
		args.push(url)
		await runProcess('yt-dlp', args)
		const infoFile = (await fs.readdir(tempDir)).find((name) => name.endsWith('.info.json'))
		if (!infoFile) throw new Error('yt-dlp did not create an info JSON file')
		const raw = await readJson(path.join(tempDir, infoFile))
		const comments = Array.isArray(raw.comments) ? raw.comments : []
		const snapshot = normalizeCommentsSnapshot({
			videoInfo: {
				title: raw.title,
				author: raw.uploader || raw.channel,
				viewCount: raw.view_count,
			},
			comments: comments.map((comment) => ({
				id: comment.id,
				author: comment.author,
				content: comment.text || comment.content,
				likes: comment.like_count,
				replyCount: comment.reply_count,
			})),
		})
		await ensureDir(path.dirname(outputPath))
		await writeJson(outputPath, snapshot)
		print({ outputPath, comments: snapshot.comments.length, source: url })
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true })
	}
}

function binaryAvailable(command) {
	try {
		const versionArg = command === 'ffmpeg' ? '-version' : '--version'
		return spawnSync(command, [versionArg], { stdio: 'ignore' }).status === 0
	} catch {
		return false
	}
}

async function doctor() {
	const nodeMajor = Number(process.versions.node.split('.')[0])
	const remotionRenderer = await pathExists(path.join(runtimeDir, 'node_modules', '@remotion', 'renderer'))
	const report = {
		node: process.version,
		nodeSupported: nodeMajor >= 20,
		ffmpeg: binaryAvailable('ffmpeg'),
		ytdlp: binaryAvailable('yt-dlp'),
		remotionRuntimeInstalled: remotionRenderer,
		asrConfigured: Boolean(process.env.MEDIAFLOW_ASR_API_URL && process.env.MEDIAFLOW_ASR_API_KEY),
		dockerAvailable: binaryAvailable('docker'),
	}
	print(report)
	if (!report.nodeSupported) process.exitCode = 1
}

async function status(flags) {
	const workDir = resolvePath(requiredFlag(flags, 'workdir'))
	const manifestPath = path.join(workDir, 'manifest.json')
	print(await readJson(manifestPath))
}

async function publishBilibili(flags) {
	// Optional capability: shells out to the bundled Python engine, which uses
	// bilibili-api (web cookies). Requires Python + `pip install bilibili-api-python`.
	// Cookies come from --cookie-file (default .bili.env); the engine auto-extracts
	// them from a logged-in Dia session via Kimi WebBridge if the file is incomplete.
	const publishScript = path.resolve(runtimeDir, '..', 'scripts', 'publish_bilibili.py')
	const python = flagString(flags, 'python', process.env.MEDIAFLOW_PYTHON || 'python3')
	const cookieFile = resolvePath(flagString(flags, 'cookie-file', '.bili.env'))
	const args = [publishScript, '--cookie-file', cookieFile]
	const deleteAid = flagString(flags, 'delete-aid')
	if (deleteAid) {
		args.push('--delete-aid', deleteAid)
	} else {
		args.push('--video', resolvePath(requiredFlag(flags, 'video')))
		args.push('--title', requiredFlag(flags, 'title'))
		args.push('--tid', flagString(flags, 'tid', '21'))
		const tag = flagString(flags, 'tag')
		if (tag) args.push('--tag', tag)
		const desc = flagString(flags, 'desc')
		if (desc) args.push('--desc', desc)
		const cover = flagString(flags, 'cover')
		if (cover) args.push('--cover', resolvePath(cover))
		if (flags['dry-run']) args.push('--dry-run')
	}
	await runProcess(python, args)
}

async function main() {
	const [command = 'help', ...argv] = process.argv.slice(2)
	const { flags } = parseArgs(argv)
	switch (command) {
		case 'help':
		case '--help':
		case '-h':
			usage()
			return
		case 'doctor':
			return doctor()
		case 'download':
			return download(flags)
		case 'fetch-comments':
			return fetchComments(flags)
		case 'extract-audio':
			return extractAudio(flags)
		case 'asr':
			return asr(flags)
		case 'prepare-subtitles':
			return prepareSubtitles(flags)
		case 'prepare-comments':
			return prepareComments(flags)
		case 'validate':
			return validate(flags)
		case 'materialize-subtitles':
			return materializeSubtitles(flags)
		case 'materialize-comments':
			return materializeComments(flags)
		case 'render-subtitles':
			return renderSubtitles(flags)
		case 'render-comments':
			return renderComments(flags)
		case 'status':
			return status(flags)
		case 'publish-bilibili':
			return publishBilibili(flags)
		default:
			throw new Error(`Unknown command: ${command}. Run mediaflow help.`)
	}
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error)
	console.error(`[mediaflow] ${message}`)
	process.exit(1)
})
