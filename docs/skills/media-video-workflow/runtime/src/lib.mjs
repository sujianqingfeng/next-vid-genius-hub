import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const SCHEMA_VERSION = 1
export const MODERATION_DECISIONS = new Set(['allow', 'exclude', 'review'])
export const MODERATION_CONFIDENCE = new Set(['high', 'medium', 'low'])

export function canonicalize(value) {
	if (Array.isArray(value)) return value.map(canonicalize)
	if (value && typeof value === 'object') {
		const record = {}
		for (const key of Object.keys(value).sort()) {
			if (typeof value[key] !== 'undefined') record[key] = canonicalize(value[key])
		}
		return record
	}
	return value
}

export function canonicalJson(value) {
	return JSON.stringify(canonicalize(value))
}

export function sha256(value) {
	return createHash('sha256').update(String(value), 'utf8').digest('hex')
}

export function sourceHash(task) {
	return sha256(
		canonicalJson({
			kind: task.kind,
			id: task.id,
			source: task.source,
		}),
	)
}

export function normalizeText(value) {
	return String(value ?? '')
		.replace(/\u0000/g, '')
		.replace(/\r\n/g, '\n')
		.trim()
}

export function resolvePath(value) {
	return path.resolve(String(value || ''))
}

export async function ensureDir(dirPath) {
	await fs.mkdir(dirPath, { recursive: true })
}

export async function pathExists(filePath) {
	try {
		await fs.access(filePath)
		return true
	} catch {
		return false
	}
}

async function writeAtomic(filePath, contents) {
	await ensureDir(path.dirname(filePath))
	const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`
	await fs.writeFile(temporary, contents, 'utf8')
	await fs.rename(temporary, filePath)
}

export async function writeJson(filePath, value) {
	await writeAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export async function readJson(filePath) {
	return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

export async function writeJsonl(filePath, rows) {
	await writeAtomic(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`)
}

export async function readJsonl(filePath) {
	const text = await fs.readFile(filePath, 'utf8')
	const rows = []
	for (const [index, line] of text.split(/\r?\n/).entries()) {
		if (!line.trim()) continue
		try {
			rows.push(JSON.parse(line))
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			throw new Error(`Invalid JSONL at ${filePath}:${index + 1}: ${message}`)
		}
	}
	return rows
}

export function relativeArtifact(workDir, artifactPath) {
	return path.relative(workDir, artifactPath)
}

export function resolveArtifact(workDir, artifactPath) {
	return path.resolve(workDir, artifactPath)
}

export function createTask({ kind, id, source, targetLanguage }) {
	const task = {
		schemaVersion: SCHEMA_VERSION,
		kind,
		id,
		source,
		targetLanguage,
		translation: '',
		status: 'pending',
	}
	task.sourceHash = sourceHash(task)
	return task
}

const TIMING_RE =
	/^(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})(?:\s+.*)?$/

export function parseVtt(text) {
	const lines = String(text || '')
		.replace(/^\uFEFF/, '')
		.split(/\r?\n/)
	const cues = []

	for (let cursor = 0; cursor < lines.length; cursor += 1) {
		const current = String(lines[cursor] || '').trim()
		if (!current || current.toUpperCase() === 'WEBVTT') continue
		if (current.startsWith('NOTE')) {
			while (cursor + 1 < lines.length && String(lines[cursor + 1] || '').trim()) {
				cursor += 1
			}
			continue
		}

		let timing = current
		if (!TIMING_RE.test(timing)) {
			const next = String(lines[cursor + 1] || '').trim()
			if (!TIMING_RE.test(next)) continue
			cursor += 1
			timing = next
		}

		const match = timing.match(TIMING_RE)
		if (!match) continue
		const sourceLines = []
		let nextCursor = cursor + 1
		while (nextCursor < lines.length) {
			const line = String(lines[nextCursor] || '')
			if (!line.trim()) break
			if (TIMING_RE.test(line.trim())) break
			sourceLines.push(line.trim())
			nextCursor += 1
		}
		cursor = nextCursor - 1
		if (!sourceLines.length) continue
		cues.push({
			index: cues.length,
			start: match[1],
			end: match[2],
			sourceLines,
			sourceText: sourceLines.join(' ').replace(/\s+/g, ' ').trim(),
		})
	}

	return cues
}

export function serializeVtt(cues) {
	const lines = ['WEBVTT', '']
	for (const [index, cue] of cues.entries()) {
		lines.push(String(index + 1))
		lines.push(`${cue.start} --> ${cue.end}`)
		lines.push(...cue.lines.filter((line) => normalizeText(line)))
		lines.push('')
	}
	return `${lines.join('\n')}\n`
}

export function normalizeCommentsSnapshot(raw) {
	const snapshot = Array.isArray(raw) ? { comments: raw } : raw
	if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
		throw new Error('Comments input must be a JSON object or an array of comments')
	}

	const rawVideoInfo =
		snapshot.videoInfo && typeof snapshot.videoInfo === 'object' && !Array.isArray(snapshot.videoInfo)
			? snapshot.videoInfo
			: {}
	const rawComments = Array.isArray(snapshot.comments) ? snapshot.comments : []
	const seenIds = new Set()
	const comments = rawComments
		.filter((value) => value && typeof value === 'object' && !Array.isArray(value))
		.map((value, index) => {
			const rawId = normalizeText(value.id) || `comment-${index + 1}`
			const id = seenIds.has(rawId) ? `${rawId}-${index + 1}` : rawId
			seenIds.add(id)
			return {
				id,
				author: normalizeText(value.author) || 'Unknown',
				content: normalizeText(value.content),
				translatedContent: normalizeText(value.translatedContent),
				likes: Number.isFinite(Number(value.likes)) ? Number(value.likes) : 0,
				replyCount: Number.isFinite(Number(value.replyCount))
					? Number(value.replyCount)
					: 0,
			}
		})
		.filter((comment) => comment.content.length > 0)

	if (!comments.length) throw new Error('Comments input has no non-empty comments')

	return {
		videoInfo: {
			title: normalizeText(rawVideoInfo.title) || 'Untitled',
			author: normalizeText(rawVideoInfo.author),
			viewCount: Number.isFinite(Number(rawVideoInfo.viewCount))
				? Number(rawVideoInfo.viewCount)
				: 0,
		},
		comments,
	}
}

export async function runProcess(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env ?? process.env,
			stdio: options.stdio ?? 'inherit',
		})
		child.once('error', (error) => reject(error))
		child.once('close', (code) => {
			if (code === 0) {
				resolve()
				return
			}
			reject(new Error(`${command} exited with code ${code ?? 'unknown'}`))
		})
	})
}
