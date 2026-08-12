#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	MODERATION_CATEGORIES,
	MODERATION_CONFIDENCE,
	MODERATION_DECISIONS,
	SCHEMA_VERSION,
	asrTimestamp,
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
import { fetchAvatarAsset } from './avatar-assets.mjs'
import { buildCommentTimeline, REMOTION_FPS } from './comments-timeline.mjs'
import {
	resolveRegistryPath,
	loadRegistry,
	saveRegistry,
	findRecord,
	deriveRecordId,
	upsertRecord,
	mapReviewState,
	readBiliCookies,
	fetchArchiveState,
} from './registry.mjs'
import {
	resolveChannelsPath,
	loadChannels,
	saveChannels,
	findChannel,
	deriveChannel,
	normalizeChannelUrl,
} from './channels.mjs'

const runtimeDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
)

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
  mediaflow doctor [--for local|prepare|download|subtitles|comments|asr|publish]
  mediaflow download --url <url> --out <video.mp4> [--quality 1080] [--cookies <cookies.txt>] [--remote-components ejs:github|none] [--proxy <url>]
  mediaflow fetch-comments --url <url> --out <comments.json> [--max-comments 100] [--cookies <cookies.txt>] [--remote-components ejs:github|none] [--proxy <url>]
  mediaflow extract-audio --video <video.mp4> --out <audio.wav>
  mediaflow asr --audio <audio.wav> --out <transcript.vtt> [--api-url <url>] [--model <id>] [--language <code>]
  mediaflow prepare-subtitles --input <transcript.vtt> --out <run-dir> [--target-language zh-CN]
  mediaflow prepare-comments --input <comments.json> --out <run-dir> [--target-language zh-CN]
  mediaflow validate --kind <subtitles|comments> --tasks <results.jsonl> [--manifest <manifest.json>]
  mediaflow materialize-subtitles --tasks <results.jsonl> --out <bilingual.vtt> [--format bilingual|replace]
  mediaflow materialize-comments --tasks <results.jsonl> --out <output-dir> [--fetch-avatars]
  mediaflow render-subtitles --video <video.mp4> --subtitles <subtitles.vtt> --out <video.mp4>
  mediaflow render-comments --input <comments.safe.json> --out <video.mp4> [--template landscape|vertical] [--video <source.mp4>] [--assets <assets-dir>] [--allow-remote-images] [--plan]
  mediaflow status --workdir <run-dir>
  mediaflow publish-bilibili --video <mp4> --title <t> [--tid 21] [--tag a,b] [--desc <t>] [--cover <img>] [--cookie-file .bili.env] [--python python3] [--source-url <url>] [--no-registry] [--dry-run]
  mediaflow registry add --url <yt> [--id <slug>] [--job-dir <dir>] [--video <mp4>] [--title <t>] [--bvid <BV>] [--aid <id>] [--registry <file>]
  mediaflow registry list [--status processing|passed|rejected|rendered|draft] [--json] [--registry <file>]
  mediaflow registry show <id> [--registry <file>]
  mediaflow registry refresh [--id <id>] [--cookie-file <.bili.env>] [--registry <file>]
  mediaflow registry rerun <id> [--step comments|render|publish] [--template landscape|vertical] [--video <src|out>] [--out <mp4>] [--registry <file>]
  mediaflow registry open <id> [--registry <file>]
  mediaflow channels add --url <yt-channel> [--name <n>] [--max <N>] [--channels <file>]
  mediaflow channels list [--channels <file>]
  mediaflow channels show <id> [--channels <file>]
  mediaflow channels remove <id> [--channels <file>]
  mediaflow channels check [--id <id>] [--max <N>] [--cookies <cookies.txt>] [--channels <file>]
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
		throw new Error(
			`Manifest not found: ${manifestPath}. Pass --manifest explicitly if needed.`,
		)
	}
	const manifest = await readJson(manifestPath)
	if (manifest.schemaVersion !== SCHEMA_VERSION) {
		throw new Error(
			`Unsupported manifest schema version: ${String(manifest.schemaVersion)}`,
		)
	}
	return { manifestPath, manifest, workDir: path.dirname(manifestPath) }
}

function expectedTaskMap(manifest) {
	if (
		!Array.isArray(manifest.expectedTasks) ||
		!manifest.expectedTasks.length
	) {
		throw new Error('Manifest has no expected task records')
	}
	return new Map(manifest.expectedTasks.map((task) => [task.id, task]))
}

function assertManifestState(manifest, expectedState, command) {
	if (manifest.state !== expectedState) {
		throw new Error(
			`${command} requires manifest state="${expectedState}"; current state is "${String(manifest.state)}"`,
		)
	}
}

async function ensureNewRunDir(workDir) {
	if (!(await pathExists(workDir))) return
	const entries = await fs.readdir(workDir)
	if (entries.length) {
		throw new Error(
			`Run directory is not empty: ${workDir}. Choose a new --out directory.`,
		)
	}
}

function validateRows(rows, manifest, workflow) {
	if (manifest.workflow !== workflow) {
		throw new Error(
			`Task manifest is for ${manifest.workflow}, not ${workflow}`,
		)
	}
	if (!rows.length) throw new Error('Task result file is empty')

	const expected = expectedTaskMap(manifest)
	const accepted = new Map()
	for (const row of rows) {
		if (!row || typeof row !== 'object' || Array.isArray(row)) {
			throw new Error('Each JSONL row must be an object')
		}
		if (row.schemaVersion !== SCHEMA_VERSION) {
			throw new Error(
				`Unsupported task schema version for ${String(row.id || 'unknown')}`,
			)
		}
		const id = normalizeText(row.id)
		const expectedTask = expected.get(id)
		if (!expectedTask) throw new Error(`Unexpected task id: ${id || '(empty)'}`)
		if (accepted.has(id)) throw new Error(`Duplicate task id: ${id}`)
		if (row.kind !== expectedTask.kind)
			throw new Error(`Task kind changed for ${id}`)
		if (row.targetLanguage !== manifest.targetLanguage) {
			throw new Error(`Target language changed for ${id}`)
		}
		if (
			row.sourceHash !== expectedTask.sourceHash ||
			sourceHash(row) !== expectedTask.sourceHash
		) {
			throw new Error(`Source content changed or hash mismatch for ${id}`)
		}
		if (normalizeText(row.status) !== 'completed') {
			throw new Error(`Task ${id} must have status="completed"`)
		}
		// A translation is required for rows that will be rendered: subtitle
		// cues and the comment title (cover card). Allowed comments are gated
		// below (after moderation is validated). Excluded/reviewed comments are
		// quarantined and never rendered, so their translation is optional.
		if (
			(row.kind === 'subtitle' || row.kind === 'comment-title') &&
			normalizeText(row.translation).length === 0
		) {
			throw new Error(`Missing translation for ${id}`)
		}

		if (workflow === 'comments' && row.kind === 'comment') {
			const moderation = row.moderation
			if (
				!moderation ||
				typeof moderation !== 'object' ||
				Array.isArray(moderation)
			) {
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
			const categories = moderation.categories.map((category) =>
				normalizeText(category),
			)
			if (categories.some((category) => !MODERATION_CATEGORIES.has(category))) {
				throw new Error(`Invalid moderation category for ${id}`)
			}
			if (new Set(categories).size !== categories.length) {
				throw new Error(`Duplicate moderation category for ${id}`)
			}
			const reasonCode = normalizeText(moderation.reasonCode)
			if (!/^[a-z0-9_]{1,64}$/.test(reasonCode)) {
				throw new Error(`Invalid moderation reasonCode for ${id}`)
			}
			if (
				moderation.decision === 'allow' &&
				(categories.length || reasonCode !== 'safe_relevant')
			) {
				throw new Error(
					`Allowed comment ${id} must use no categories and reasonCode="safe_relevant"`,
				)
			}
			if (moderation.decision === 'exclude' && !categories.length) {
				throw new Error(
					`Excluded comment ${id} must include a moderation category`,
				)
			}
			if (
				moderation.decision === 'allow' &&
				normalizeText(row.translation).length === 0
			) {
				throw new Error(`Allowed comment ${id} requires a translation`)
			}
		}
		accepted.set(id, row)
	}

	const missing = [...expected.keys()].filter((id) => !accepted.has(id))
	if (missing.length) {
		throw new Error(
			`Missing ${missing.length} task result(s): ${missing.slice(0, 12).join(', ')}`,
		)
	}

	return accepted
}

async function prepareSubtitles(flags) {
	const sourcePath = resolvePath(requiredFlag(flags, 'input'))
	const workDir = resolvePath(requiredFlag(flags, 'out'))
	await ensureNewRunDir(workDir)
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
	print({
		workDir,
		manifestPath,
		taskPath,
		state: manifest.state,
		tasks: tasks.length,
	})
}

async function prepareComments(flags) {
	const sourcePath = resolvePath(requiredFlag(flags, 'input'))
	const workDir = resolvePath(requiredFlag(flags, 'out'))
	await ensureNewRunDir(workDir)
	const targetLanguage = flagString(flags, 'target-language', 'zh-CN')
	const snapshot = normalizeCommentsSnapshot(await readJson(sourcePath), {
		allowRemoteImages: true,
	})

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
	print({
		workDir,
		manifestPath,
		taskPath,
		state: manifest.state,
		tasks: tasks.length,
	})
}

async function validate(flags) {
	const workflow = requiredFlag(flags, 'kind')
	if (workflow !== 'subtitles' && workflow !== 'comments') {
		throw new Error('--kind must be subtitles or comments')
	}
	const tasksPath = resolvePath(requiredFlag(flags, 'tasks'))
	const rows = await readJsonl(tasksPath)
	const { manifestPath, manifest, workDir } = await loadManifestForTasks(
		tasksPath,
		flags,
	)
	assertManifestState(manifest, 'awaiting_agent', 'validate')
	const accepted = validateRows(rows, manifest, workflow)
	manifest.state = 'validated'
	manifest.artifacts.validatedTasks = relativeArtifact(workDir, tasksPath)
	await writeManifest(manifestPath, manifest)
	print({
		manifestPath,
		tasksPath,
		workflow,
		state: manifest.state,
		validated: accepted.size,
	})
}

async function materializeSubtitles(flags) {
	const tasksPath = resolvePath(requiredFlag(flags, 'tasks'))
	const outputPath = resolvePath(requiredFlag(flags, 'out'))
	const format = flagString(flags, 'format', 'bilingual')
	if (format !== 'bilingual' && format !== 'replace') {
		throw new Error('--format must be bilingual or replace')
	}
	const rows = await readJsonl(tasksPath)
	const { manifestPath, manifest, workDir } = await loadManifestForTasks(
		tasksPath,
		flags,
	)
	assertManifestState(manifest, 'validated', 'materialize-subtitles')
	if (
		resolveArtifact(workDir, manifest.artifacts.validatedTasks) !== tasksPath
	) {
		throw new Error(
			'materialize-subtitles must use the task file recorded by validate',
		)
	}
	const tasks = validateRows(rows, manifest, 'subtitles')
	const cues = manifest.expectedTasks.map((expected) => {
		const task = tasks.get(expected.id)
		const source = task.source
		const sourceLines = Array.isArray(source.sourceLines)
			? source.sourceLines
			: [source.sourceText]
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
	const { manifestPath, manifest, workDir } = await loadManifestForTasks(
		tasksPath,
		flags,
	)
	assertManifestState(manifest, 'validated', 'materialize-comments')
	if (
		resolveArtifact(workDir, manifest.artifacts.validatedTasks) !== tasksPath
	) {
		throw new Error(
			'materialize-comments must use the task file recorded by validate',
		)
	}
	const tasks = validateRows(rows, manifest, 'comments')
	const sourcePath = resolveArtifact(workDir, manifest.artifacts.source)
	const snapshot = normalizeCommentsSnapshot(await readJson(sourcePath), {
		allowRemoteImages: true,
	})
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
				categories: moderation.categories
					.map((category) => normalizeText(category))
					.filter(Boolean),
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
	const fetchAvatars = Boolean(flags['fetch-avatars'])
	const avatarStats = {
		requested: 0,
		unique: 0,
		fetched: 0,
		cached: 0,
		failed: 0,
		errors: [],
	}
	if (fetchAvatars) {
		const avatarDir = path.join(outputDir, 'assets', 'avatars')
		await ensureDir(avatarDir)
		const avatarGroups = new Map()
		for (const record of safe) {
			const remoteUrl = record.authorThumbnail
			delete record.authorThumbnail
			if (!remoteUrl || record.authorThumbnailAsset) continue
			avatarStats.requested += 1
			const group = avatarGroups.get(remoteUrl) || []
			group.push(record)
			avatarGroups.set(remoteUrl, group)
		}
		avatarStats.unique = avatarGroups.size
		const entries = [...avatarGroups.entries()]
		let nextEntry = 0
		const fetchWorker = async () => {
			while (nextEntry < entries.length) {
				const entryIndex = nextEntry
				nextEntry += 1
				const [remoteUrl, records] = entries[entryIndex]
				try {
					const result = await fetchAvatarAsset(remoteUrl, avatarDir)
					for (const record of records)
						record.authorThumbnailAsset = result.assetPath
					if (result.cached) avatarStats.cached += records.length
					else avatarStats.fetched += records.length
				} catch (error) {
					avatarStats.failed += records.length
					for (const record of records) {
						avatarStats.errors.push({
							id: record.id,
							error: error instanceof Error ? error.message : String(error),
						})
					}
				}
			}
		}
		await Promise.all(
			Array.from({ length: Math.min(4, entries.length) }, () => fetchWorker()),
		)
	}
	const safePath = path.join(outputDir, 'comments.safe.json')
	const quarantinePath = path.join(outputDir, 'comments.quarantine.json')
	const reportPath = path.join(outputDir, 'moderation-report.json')
	await writeJson(safePath, {
		schemaVersion: SCHEMA_VERSION,
		kind: 'mediaflow-safe-comments',
		policy: 'default-fail-closed',
		videoInfo: {
			...snapshot.videoInfo,
			translatedTitle: normalizeText(title.translation),
		},
		assets: {
			avatarDirectory: 'assets/avatars',
			fetchAvatars,
			requested: avatarStats.requested,
			unique: avatarStats.unique,
			fetched: avatarStats.fetched,
			cached: avatarStats.cached,
			failed: avatarStats.failed,
		},
		comments: safe,
	})
	await writeJson(quarantinePath, {
		schemaVersion: SCHEMA_VERSION,
		kind: 'mediaflow-quarantined-comments',
		policy: 'default-fail-closed',
		videoInfo: {
			...snapshot.videoInfo,
			translatedTitle: normalizeText(title.translation),
		},
		comments: quarantine,
	})
	const byDecision = Object.fromEntries(
		[...MODERATION_DECISIONS].map((decision) => [
			decision,
			quarantine.filter((comment) => comment.moderation.decision === decision)
				.length +
				safe.filter((comment) => comment.moderation.decision === decision)
					.length,
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
		avatars: avatarStats,
	})
	manifest.state = 'materialized'
	manifest.artifacts.safeComments = relativeArtifact(workDir, safePath)
	manifest.artifacts.quarantinedComments = relativeArtifact(
		workDir,
		quarantinePath,
	)
	manifest.artifacts.moderationReport = relativeArtifact(workDir, reportPath)
	if (fetchAvatars) {
		manifest.artifacts.avatarAssets = relativeArtifact(
			workDir,
			path.join(outputDir, 'assets', 'avatars'),
		)
	}
	await writeManifest(manifestPath, manifest)
	print({
		manifestPath,
		safePath,
		quarantinePath,
		reportPath,
		allowed: safe.length,
		quarantined: quarantine.length,
		avatars: {
			requested: avatarStats.requested,
			fetched: avatarStats.fetched,
			cached: avatarStats.cached,
			failed: avatarStats.failed,
		},
	})
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

function round1(value) {
	return Math.round((value + Number.EPSILON) * 10) / 10
}

function fmtDuration(totalSeconds) {
	const s = Math.max(0, Math.round(totalSeconds))
	const m = Math.floor(s / 60)
	const r = s % 60
	return `${m}:${String(r).padStart(2, '0')}`
}

function probeMediaDuration(filePath) {
	const result = spawnSync(
		'ffprobe',
		[
			'-v',
			'error',
			'-show_entries',
			'format=duration',
			'-of',
			'default=noprint_wrappers=1:nokey=1',
			filePath,
		],
		{ encoding: 'utf8' },
	)
	if (result.status !== 0 || !result.stdout) {
		throw new Error(`ffprobe could not read duration for ${filePath}`)
	}
	const parsed = parseFloat(result.stdout.trim())
	if (!Number.isFinite(parsed)) {
		throw new Error(`ffprobe returned no duration for ${filePath}`)
	}
	return parsed
}

async function renderComments(flags) {
	const inputPath = resolvePath(requiredFlag(flags, 'input'))
	const templateRaw = flagString(flags, 'template', 'landscape')
	if (!['landscape', 'vertical', 'portrait'].includes(templateRaw)) {
		throw new Error('--template must be landscape or vertical')
	}
	const template =
		templateRaw === 'vertical' || templateRaw === 'portrait'
			? 'vertical'
			: 'landscape'
	const sourceVideoPath = flagString(flags, 'video')

	// --plan: print the comment timeline (per-comment on-screen seconds, total
	// duration, and source loop count when --video is given) without rendering.
	// Lets the agent size the allow-set before spending render time.
	if (Boolean(flags['plan'])) {
		const snapshot = normalizeCommentsSnapshot(await readJson(inputPath), {
			allowRemoteImages: true,
		})
		const comments = Array.isArray(snapshot.comments) ? snapshot.comments : []
		const timeline = buildCommentTimeline(comments, REMOTION_FPS)
		let cursor = timeline.coverDurationSeconds
		const schedule = comments.map((comment, index) => {
			const duration = timeline.commentDurationsInFrames[index] / REMOTION_FPS
			const entry = {
				index: index + 1,
				author: comment.author || '',
				start: round1(cursor),
				end: round1(cursor + duration),
				duration: round1(duration),
			}
			cursor += duration
			return entry
		})
		const summary = {
			plan: true,
			template,
			coverSeconds: round1(timeline.coverDurationSeconds),
			commentCount: comments.length,
			totalSeconds: round1(timeline.totalDurationSeconds),
			totalDuration: fmtDuration(timeline.totalDurationSeconds),
		}
		if (sourceVideoPath) {
			const resolvedSource = resolvePath(sourceVideoPath)
			const sourceDuration = probeMediaDuration(resolvedSource)
			summary.composeOnVideo = true
			summary.sourceVideo = resolvedSource
			summary.sourceSeconds = round1(sourceDuration)
			summary.sourceDuration = fmtDuration(sourceDuration)
			summary.sourceLoopCount = round1(
				timeline.totalDurationSeconds / sourceDuration,
			)
		}
		print({ ...summary, schedule })
		return
	}

	const outputPath = resolvePath(requiredFlag(flags, 'out'))
	const assetsDir = flagString(flags, 'assets')
	const { renderCommentsVideo } = await import('./render-comments.mjs')
	await renderCommentsVideo({
		inputPath,
		outputPath,
		template,
		sourceVideoPath: sourceVideoPath ? resolvePath(sourceVideoPath) : undefined,
		allowRemoteImages: Boolean(flags['allow-remote-images']),
		assetsDir: assetsDir ? resolvePath(assetsDir) : undefined,
	})
	print({
		outputPath,
		renderer: `remotion-${template}`,
		composedWithSource: Boolean(sourceVideoPath),
	})
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
	if (!cues.length)
		throw new Error('ASR response did not contain timestamped segments')
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
		[
			'-v',
			'error',
			'-show_entries',
			'format=duration',
			'-of',
			'default=noprint_wrappers=1:nokey=1',
			filePath,
		],
		{ encoding: 'utf8' },
	)
	if (result.status !== 0)
		throw new Error(`ffprobe could not read duration for ${filePath}`)
	const seconds = Number((result.stdout || '').trim())
	if (!Number.isFinite(seconds))
		throw new Error(`Could not parse audio duration for ${filePath}`)
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
		const startSec = cfTimestampToSeconds(
			(leftRaw || '').trim().split(/\s+/)[0],
		)
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
	if (typeof result.vtt === 'string' && result.vtt.trim())
		return parseCloudflareVttCues(result.vtt)
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
		throw new Error(
			`Cloudflare ASR request failed: ${response.status} ${await response.text()}`,
		)
	}
	const json = await response.json()
	return (json && json.result) || {}
}

async function cloudflareAsr({ audioPath, url, apiKey }) {
	const contentType = audioContentType(audioPath)
	const duration = await audioDurationSeconds(audioPath)
	const records =
		duration > CF_ASR_CHUNK_SECONDS
			? await cloudflareChunkedCues({ audioPath, duration, url, apiKey })
			: cloudflareCuesFromResult(
					await cloudflareRequest({
						bytes: await fs.readFile(audioPath),
						contentType,
						url,
						apiKey,
					}),
				)
	const cues = records.map((record) => ({
		start: asrTimestamp(record.startSec),
		end: asrTimestamp(record.endSec),
		lines: [record.text],
	}))
	if (!cues.length) throw new Error('Cloudflare ASR produced no cues')
	return serializeVtt(cues)
}

async function cloudflareChunkedCues({ audioPath, duration, url, apiKey }) {
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
			const result = await cloudflareRequest({
				bytes,
				contentType: audioContentType(chunkPath),
				url,
				apiKey,
			})
			const chunkCues = cloudflareCuesFromResult(result)
			if (!chunkCues.length) {
				throw new Error(`Cloudflare ASR produced no cues for chunk @${start}s`)
			}
			for (const cue of chunkCues) {
				records.push({
					startSec: cue.startSec + start,
					endSec: cue.endSec + start,
					text: cue.text,
				})
			}
		}
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true })
	}
	if (!records.length)
		throw new Error('Cloudflare ASR produced no cues across chunks')
	return records
}

async function asr(flags) {
	const audioPath = resolvePath(requiredFlag(flags, 'audio'))
	const outputPath = resolvePath(requiredFlag(flags, 'out'))
	const apiUrl = flagString(
		flags,
		'api-url',
		process.env.MEDIAFLOW_ASR_API_URL || '',
	)
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
		form.append(
			'model',
			flagString(
				flags,
				'model',
				process.env.MEDIAFLOW_ASR_MODEL || 'whisper-1',
			),
		)
		form.append('response_format', 'verbose_json')
		const language = flagString(flags, 'language')
		if (language) form.append('language', language)
		const response = await fetch(parsedUrl, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}` },
			body: form,
		})
		if (!response.ok) {
			throw new Error(
				`ASR request failed: ${response.status} ${await response.text()}`,
			)
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
		return (
			hostname === 'youtu.be' ||
			hostname === 'youtube.com' ||
			hostname.endsWith('.youtube.com')
		)
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
		const remoteComponents = flagString(
			flags,
			'remote-components',
			'ejs:github',
		)
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
	if (!Number.isFinite(quality) || quality <= 0)
		throw new Error('--quality must be a positive number')
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
	const tempDir = await fs.mkdtemp(
		path.join(os.tmpdir(), 'mediaflow-comments-'),
	)
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
		const infoFile = (await fs.readdir(tempDir)).find((name) =>
			name.endsWith('.info.json'),
		)
		if (!infoFile) throw new Error('yt-dlp did not create an info JSON file')
		const raw = await readJson(path.join(tempDir, infoFile))
		const comments = Array.isArray(raw.comments) ? raw.comments : []
		const snapshot = normalizeCommentsSnapshot(
			{
				videoInfo: {
					title: raw.title,
					author: raw.uploader || raw.channel,
					viewCount: raw.view_count,
				},
				comments: comments.map((comment) => ({
					id: comment.id,
					author: comment.author,
					authorThumbnail: comment.author_thumbnail,
					content: comment.text || comment.content,
					likes: comment.like_count,
					replyCount: comment.reply_count,
				})),
			},
			{ allowRemoteImages: true },
		)
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

async function doctor(flags) {
	const profile = flagString(flags, 'for', 'local')
	const requirements = {
		local: ['nodeSupported', 'ffmpeg', 'remotionRuntimeInstalled'],
		prepare: ['nodeSupported'],
		download: ['nodeSupported', 'ffmpeg', 'ytdlp'],
		subtitles: ['nodeSupported', 'ffmpeg'],
		comments: ['nodeSupported', 'ffmpeg', 'remotionRuntimeInstalled'],
		asr: ['nodeSupported', 'ffmpeg', 'asrConfigured'],
		publish: ['nodeSupported', 'ffmpeg', 'python', 'bilibiliApiInstalled'],
	}
	if (!requirements[profile]) {
		throw new Error(
			'--for must be local, prepare, download, subtitles, comments, asr, or publish',
		)
	}
	const nodeMajor = Number(process.versions.node.split('.')[0])
	const remotionRenderer = await pathExists(
		path.join(runtimeDir, 'node_modules', '@remotion', 'renderer'),
	)
	const python = process.env.MEDIAFLOW_PYTHON || 'python3'
	const dockerCliAvailable = binaryAvailable('docker')
	const report = {
		profile,
		node: process.version,
		nodeSupported: nodeMajor >= 20,
		ffmpeg: binaryAvailable('ffmpeg'),
		ytdlp: binaryAvailable('yt-dlp'),
		remotionRuntimeInstalled: remotionRenderer,
		asrConfigured: Boolean(
			process.env.MEDIAFLOW_ASR_API_URL && process.env.MEDIAFLOW_ASR_API_KEY,
		),
		python: binaryAvailable(python),
		bilibiliApiInstalled:
			spawnSync(python, ['-c', 'import bilibili_api'], { stdio: 'ignore' })
				.status === 0,
		dockerCliAvailable,
		dockerDaemonAvailable:
			dockerCliAvailable &&
			spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0,
	}
	report.requiredChecks = requirements[profile]
	report.ok = report.requiredChecks.every((name) => report[name])
	print(report)
	if (!report.ok) process.exitCode = 1
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
	// On success the engine prints a JSON line ({aid, bvid}); we capture it to record
	// the submission in the local registry (unless --no-registry / _registrySkip).
	const publishScript = path.resolve(
		runtimeDir,
		'..',
		'scripts',
		'publish_bilibili.py',
	)
	const python = flagString(
		flags,
		'python',
		process.env.MEDIAFLOW_PYTHON || 'python3',
	)
	const cookieFile = resolvePath(flagString(flags, 'cookie-file', '.bili.env'))
	const args = [
		publishScript,
		'--cookie-file',
		cookieFile,
		'--video',
		resolvePath(requiredFlag(flags, 'video')),
		'--title',
		requiredFlag(flags, 'title'),
		'--tid',
		flagString(flags, 'tid', '21'),
	]
	const tag = flagString(flags, 'tag')
	if (tag) args.push('--tag', tag)
	const desc = flagString(flags, 'desc')
	if (desc) args.push('--desc', desc)
	const cover = flagString(flags, 'cover')
	if (cover) args.push('--cover', resolvePath(cover))
	if (flags['dry-run']) args.push('--dry-run')
	const stdout = await runCapturingStdout(python, args)
	const jsonLine = stdout
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(-1)[0]
	let result = {}
	if (jsonLine) {
		try {
			result = JSON.parse(jsonLine)
		} catch {
			result = { response: jsonLine }
		}
	}
	print(result)
	if (
		!flags['dry-run'] &&
		!flags['no-registry'] &&
		!flags._registrySkip &&
		(result.aid || result.bvid)
	) {
		try {
			await recordPublish(flags, result)
		} catch (error) {
			console.error(`[mediaflow] registry update skipped: ${error.message}`)
		}
	}
	return result
}

// Run a child process, streaming stderr to the terminal (so upload/ffmpeg
// progress stays visible) while capturing stdout.
function runCapturingStdout(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ['ignore', 'pipe', 'inherit'],
			env: process.env,
		})
		let stdout = ''
		child.stdout.on('data', (chunk) => {
			stdout += chunk
		})
		child.once('error', reject)
		child.once('close', (code) => {
			if (code === 0) resolve(stdout)
			else reject(new Error(`${command} exited with code ${code ?? 'unknown'}`))
		})
	})
}

// Upsert the just-published submission into the local registry.
async function recordPublish(flags, result) {
	const videoPath = resolvePath(requiredFlag(flags, 'video'))
	const sourceUrl = flagString(flags, 'source-url')
	const id =
		(sourceUrl && deriveRecordId(sourceUrl)) ||
		path.basename(path.dirname(videoPath))
	const reg = await loadRegistry(resolveRegistryPath(flags))
	const existing = findRecord(reg, id)
	const rec = upsertRecord(reg, {
		id,
		sourceUrl: sourceUrl || (existing && existing.sourceUrl) || null,
		jobDir: path.dirname(videoPath),
		title: requiredFlag(flags, 'title'),
		publish: {
			platform: 'bilibili',
			aid: result.aid,
			bvid: result.bvid,
			publishedAt: now(),
			reviewState: 'processing',
			reviewCheckedAt: null,
			stateDesc: '',
			rejectReason: '',
		},
	})
	await saveRegistry(reg)
	print({ registry: reg.path, recordId: rec.id, bvid: result.bvid })
}

function recordStatus(rec) {
	if (rec.publish) return rec.publish.reviewState
	if (rec.outputs && rec.outputs.length) return 'rendered'
	return 'draft'
}

async function registryHub(flags, positional) {
	const sub = (positional && positional[0]) || 'list'
	switch (sub) {
		case 'add':
			return registryAdd(flags)
		case 'list':
			return registryList(flags)
		case 'show':
			return registryShow(flags, positional)
		case 'refresh':
			return registryRefresh(flags)
		case 'rerun':
			return registryRerun(flags, positional)
		case 'open':
			return registryOpen(flags, positional)
		default:
			throw new Error(
				`Unknown registry subcommand: ${sub} (add|list|show|refresh|rerun|open)`,
			)
	}
}

async function registryAdd(flags) {
	const reg = await loadRegistry(resolveRegistryPath(flags))
	const sourceUrl = flagString(flags, 'url')
	const id = flagString(flags, 'id') || deriveRecordId(sourceUrl)
	if (!id) throw new Error('Could not derive a record id; pass --id <slug>')
	const patch = { id, sourceUrl: sourceUrl || null }
	const jobDir = flagString(flags, 'job-dir')
	if (jobDir) patch.jobDir = resolvePath(jobDir)
	const title = flagString(flags, 'title')
	if (title) patch.title = title
	const video = flagString(flags, 'video')
	if (video) {
		patch.outputs = [
			{
				path: resolvePath(video),
				template: flagString(flags, 'template', 'landscape'),
				createdAt: now(),
			},
		]
	}
	const bvid = flagString(flags, 'bvid')
	const aid = flagString(flags, 'aid')
	if (bvid || aid) {
		patch.publish = {
			platform: 'bilibili',
			aid: aid || null,
			bvid: bvid || null,
			publishedAt: now(),
			reviewState: 'processing',
			reviewCheckedAt: null,
			stateDesc: '',
			rejectReason: '',
		}
	}
	const rec = upsertRecord(reg, patch)
	await saveRegistry(reg)
	print({ registry: reg.path, record: rec })
}

async function registryList(flags) {
	const reg = await loadRegistry(resolveRegistryPath(flags))
	const status = flagString(flags, 'status')
	let recs = reg.records
	if (status) {
		recs = recs.filter(
			(r) => recordStatus(r) === status || (r.publish && r.publish.reviewState === status),
		)
	}
	if (flags.json) {
		print({ registry: reg.path, count: recs.length, records: recs })
		return
	}
	if (!recs.length) {
		console.log(
			`(no records${status ? ` matching --status ${status}` : ''}) in ${reg.path}`,
		)
		return
	}
	const rows = recs.map((r) => ({
		id: r.id,
		status: recordStatus(r),
		review: r.publish ? r.publish.reviewState : '—',
		bvid: r.publish ? r.publish.bvid : '—',
		title: (r.title || '').slice(0, 40),
	}))
	const cols = ['id', 'status', 'review', 'bvid', 'title']
	const widths = cols.map(
		(c, i) => Math.max(c.length, ...rows.map((r) => String(r[cols[i]]).length)),
		0,
	)
	const fmt = (r) =>
		cols.map((c, i) => String(r ? r[c] : c).padEnd(widths[i])).join('  ')
	console.log(fmt(null))
	console.log(widths.map((w) => '-'.repeat(w)).join('  '))
	rows.forEach((row) => console.log(fmt(row)))
	console.log(`\n${recs.length} record(s) · ${reg.path}`)
}

function requireRecord(reg, id) {
	const rec = id && findRecord(reg, id)
	if (!rec) throw new Error(`No registry record with id ${id || '(none)'}`)
	return rec
}

async function registryShow(flags, positional) {
	const reg = await loadRegistry(resolveRegistryPath(flags))
	const id = (positional && positional[1]) || flagString(flags, 'id')
	print(requireRecord(reg, id))
}

async function registryOpen(flags, positional) {
	const reg = await loadRegistry(resolveRegistryPath(flags))
	const id = (positional && positional[1]) || flagString(flags, 'id')
	const rec = requireRecord(reg, id)
	const jobDir = rec.jobDir
	print({
		id: rec.id,
		review: rec.publish ? rec.publish.reviewState : null,
		rejectReason: rec.publish ? rec.publish.rejectReason : null,
		paths: {
			jobDir,
			sourceVideo: jobDir ? path.join(jobDir, 'source.mp4') : null,
			comments: jobDir ? path.join(jobDir, 'comments.json') : null,
			materialized: jobDir
				? path.join(jobDir, 'materialized', 'comments.safe.json')
				: null,
			outputs: (rec.outputs || []).map((o) => o.path),
		},
	})
}

async function registryRefresh(flags) {
	const reg = await loadRegistry(resolveRegistryPath(flags))
	const onlyId = flagString(flags, 'id')
	const cookieFile = resolvePath(
		flagString(flags, 'cookie-file', 'mediaflow-work/.bili.env'),
	)
	const cookies = await readBiliCookies(cookieFile)
	if (!cookies.SESSDATA) {
		throw new Error(
			`No SESSDATA in ${cookieFile}; log into Bilibili in Dia (WebBridge) or populate the file.`,
		)
	}
	const targets = reg.records.filter(
		(r) => r.publish && r.publish.aid && (!onlyId || r.id === onlyId),
	)
	if (!targets.length) {
		console.log('No published records to refresh.')
		return
	}
	const summary = { passed: 0, processing: 0, rejected: 0, error: 0 }
	for (const rec of targets) {
		try {
			const info = await fetchArchiveState(rec.publish.aid, cookies)
			const reviewState = mapReviewState(info.state, info.rejectReason)
			rec.publish = {
				...rec.publish,
				reviewState,
				stateDesc: info.stateDesc,
				rejectReason: info.rejectReason,
				reviewCheckedAt: now(),
			}
			if (info.bvid && !rec.publish.bvid) rec.publish.bvid = info.bvid
			summary[reviewState] += 1
			console.log(
				`${rec.id}\t${reviewState}\t${info.stateDesc || ''}\t${rec.publish.bvid || ''}`,
			)
		} catch (error) {
			summary.error += 1
			console.log(`${rec.id}\terror\t${error.message}`)
		}
	}
	await saveRegistry(reg)
	print({ registry: reg.path, refreshed: targets.length, ...summary })
}

async function registryRerun(flags, positional) {
	const reg = await loadRegistry(resolveRegistryPath(flags))
	const id = (positional && positional[1]) || flagString(flags, 'id')
	const rec = requireRecord(reg, id)
	const step = flagString(flags, 'step', 'render')
	if (!rec.jobDir) {
		throw new Error(`Record ${rec.id} has no jobDir; cannot rerun.`)
	}
	if (step === 'comments') {
		const out = path.join(rec.jobDir, `comments-rerun-${Date.now()}`)
		await prepareComments({
			input: path.join(rec.jobDir, 'comments.json'),
			out,
			'target-language': flagString(flags, 'target-language', 'zh-CN'),
		})
		print({
			step,
			runDir: out,
			next: 'Re-moderate the new pending tasks, then validate + materialize + render.',
		})
		return
	}
	if (step === 'render') {
		const safeJson = path.join(rec.jobDir, 'materialized', 'comments.safe.json')
		const template = flagString(flags, 'template', 'landscape')
		const sourceVideo =
			flagString(flags, 'video') || path.join(rec.jobDir, 'source.mp4')
		const outPath =
			flagString(flags, 'out') ||
			path.join(rec.jobDir, `urkl-comments-rerun-${template}.mp4`)
		await renderComments({
			input: safeJson,
			out: outPath,
			template,
			video: sourceVideo,
		})
		upsertRecord(reg, {
			id: rec.id,
			outputs: [{ path: outPath, template, createdAt: now() }],
		})
		await saveRegistry(reg)
		print({ step, registry: reg.path, output: outPath })
		return
	}
	if (step === 'publish') {
		const video =
			flagString(flags, 'video') ||
			(rec.outputs &&
				rec.outputs[rec.outputs.length - 1] &&
				rec.outputs[rec.outputs.length - 1].path)
		if (!video) {
			throw new Error('No output to publish; pass --video or rerun --step render first.')
		}
		const title = flagString(flags, 'title') || `${rec.title || rec.id}（重发）`
		const result = await publishBilibili({
			video,
			title,
			tid: flagString(flags, 'tid', '21'),
			tag: flagString(flags, 'tag'),
			desc: flagString(flags, 'desc'),
			'cookie-file': flagString(flags, 'cookie-file', 'mediaflow-work/.bili.env'),
			'source-url': rec.sourceUrl || '',
			_registrySkip: true,
		})
		if (rec.publish) {
			rec.publishHistory = [...(rec.publishHistory || []), rec.publish]
		}
		upsertRecord(reg, {
			id: rec.id,
			publish: {
				platform: 'bilibili',
				aid: result.aid,
				bvid: result.bvid,
				publishedAt: now(),
				reviewState: 'processing',
				reviewCheckedAt: null,
				stateDesc: '',
				rejectReason: '',
			},
		})
		await saveRegistry(reg)
		const prior =
			rec.publishHistory &&
			rec.publishHistory[rec.publishHistory.length - 1] &&
			rec.publishHistory[rec.publishHistory.length - 1].bvid
		print({
			step,
			registry: reg.path,
			newBvid: result.bvid,
			priorBvid: prior || null,
			note: 'Prior submission marked superseded; delete it by hand in 创作中心 (API delete is blocked).',
		})
		return
	}
	throw new Error(`Unknown rerun step: ${step} (use comments|render|publish)`)
}

// Fetch a channel's latest N uploads as {id, title} via flat-playlist (no
// download, no nsig). Cookies pass the bot wall; remote-components is skipped.
async function fetchChannelLatest(url, max, flags) {
	const args = [
		'--flat-playlist',
		'--no-warnings',
		'--print',
		'%(id)s\t%(title)s',
		'--playlist-end',
		String(max),
	]
	const cookieDefault =
		(await pathExists('mediaflow-work/cookies.txt'))
			? 'mediaflow-work/cookies.txt'
			: ''
	appendYtDlpAccessArgs(
		args,
		{
			cookies: flagString(flags, 'cookies', cookieDefault),
			'remote-components': 'none',
		},
		url,
	)
	args.push(url)
	const stdout = await runCapturingStdout('yt-dlp', args)
	const entries = []
	for (const line of stdout.split('\n')) {
		const trimmed = line.trim()
		if (!trimmed) continue
		const idx = trimmed.indexOf('\t')
		if (idx > 0) entries.push({ id: trimmed.slice(0, idx), title: trimmed.slice(idx + 1) })
		else entries.push({ id: trimmed, title: '' })
	}
	return entries
}

function channelRecordStatus(registryIds, reg, videoId) {
	if (!registryIds.has(videoId)) return 'new'
	const rec = reg.records.find((r) => r.id === videoId)
	if (rec && rec.publish) return 'published'
	return 'draft'
}

async function channelsHub(flags, positional) {
	const sub = (positional && positional[0]) || 'list'
	switch (sub) {
		case 'add':
			return channelsAdd(flags)
		case 'list':
			return channelsList(flags)
		case 'show':
			return channelsShow(flags, positional)
		case 'remove':
			return channelsRemove(flags, positional)
		case 'check':
			return channelsCheck(flags, positional)
		default:
			throw new Error(
				`Unknown channels subcommand: ${sub} (add|list|show|remove|check)`,
			)
	}
}

async function channelsAdd(flags) {
	const store = await loadChannels(resolveChannelsPath(flags))
	const url = requiredFlag(flags, 'url')
	const derived = deriveChannel(url)
	const id = flagString(flags, 'id') || derived.id
	if (findChannel(store, id)) {
		throw new Error(`Channel ${id} already exists; use --id or remove it first.`)
	}
	const max = Number(flagString(flags, 'max', '10'))
	const channel = {
		id,
		url: normalizeChannelUrl(url),
		name: flagString(flags, 'name') || derived.name,
		platform: derived.platform,
		max: Number.isFinite(max) && max > 0 ? max : 10,
		createdAt: now(),
		lastCheckedAt: null,
	}
	store.channels.push(channel)
	await saveChannels(store)
	print({ channelsFile: store.path, channel })
}

async function channelsList(flags) {
	const store = await loadChannels(resolveChannelsPath(flags))
	if (!store.channels.length) {
		console.log(`(no channels) in ${store.path}`)
		return
	}
	const rows = store.channels.map((c) => ({
		id: c.id,
		name: c.name,
		platform: c.platform,
		max: String(c.max ?? 10),
		lastChecked: c.lastCheckedAt ? c.lastCheckedAt.slice(0, 10) : '—',
	}))
	const cols = ['id', 'name', 'platform', 'max', 'lastChecked']
	const widths = cols.map(
		(_, i) => Math.max(cols[i].length, ...rows.map((r) => String(r[cols[i]]).length)),
		0,
	)
	const fmt = (r) => cols.map((c, i) => String(r ? r[c] : c).padEnd(widths[i])).join('  ')
	console.log(fmt(null))
	console.log(widths.map((w) => '-'.repeat(w)).join('  '))
	rows.forEach((row) => console.log(fmt(row)))
	console.log(`\n${store.channels.length} channel(s) · ${store.path}`)
}

async function channelsShow(flags, positional) {
	const store = await loadChannels(resolveChannelsPath(flags))
	const id = (positional && positional[1]) || flagString(flags, 'id')
	const ch = id && findChannel(store, id)
	if (!ch) throw new Error(`No channel with id ${id || '(none)'}`)
	print(ch)
}

async function channelsRemove(flags, positional) {
	const store = await loadChannels(resolveChannelsPath(flags))
	const id = (positional && positional[1]) || flagString(flags, 'id')
	const idx = store.channels.findIndex((c) => c.id === id)
	if (idx < 0) throw new Error(`No channel with id ${id || '(none)'}`)
	const [removed] = store.channels.splice(idx, 1)
	await saveChannels(store)
	print({ channelsFile: store.path, removed })
}

async function channelsCheck(flags, positional) {
	const store = await loadChannels(resolveChannelsPath(flags))
	const onlyId = (positional && positional[1]) || flagString(flags, 'id')
	const targets = onlyId
		? store.channels.filter((c) => c.id === onlyId)
		: store.channels
	if (!targets.length) {
		console.log(onlyId ? `No channel with id ${onlyId}.` : 'No channels to check.')
		return
	}
	const maxOverride = flags.max ? Number(flagString(flags, 'max')) : null
	const reg = await loadRegistry(resolveRegistryPath(flags))
	const registryIds = new Set(reg.records.map((r) => r.id))
	let total = 0
	for (const ch of targets) {
		const max =
			(maxOverride && Number.isFinite(maxOverride) ? maxOverride : ch.max) || 10
		let entries = []
		try {
			entries = await fetchChannelLatest(ch.url, max, flags)
		} catch (error) {
			console.log(`== ${ch.name} (${ch.id}) ==\n  fetch error: ${error.message}`)
			continue
		}
		ch.lastCheckedAt = now()
		console.log(`== ${ch.name} (${ch.id}) — latest ${entries.length} ==`)
		for (const e of entries) {
			const status = channelRecordStatus(registryIds, reg, e.id)
			console.log(
				`${e.id}\t[${status}]\t${(e.title || '').slice(0, 60)}\thttps://youtu.be/${e.id}`,
			)
			total += 1
		}
	}
	await saveChannels(store)
	print({ channelsFile: store.path, checked: targets.length, videosListed: total })
}

async function main() {
	const [command = 'help', ...argv] = process.argv.slice(2)
	const { positional, flags } = parseArgs(argv)
	switch (command) {
		case 'help':
		case '--help':
		case '-h':
			usage()
			return
		case 'doctor':
			return doctor(flags)
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
		case 'registry':
			return registryHub(flags, positional)
		case 'channels':
			return channelsHub(flags, positional)
		default:
			throw new Error(`Unknown command: ${command}. Run mediaflow help.`)
	}
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error)
	console.error(`[mediaflow] ${message}`)
	process.exit(1)
})
