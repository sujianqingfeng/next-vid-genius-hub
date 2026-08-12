#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { asrTimestamp, normalizeCommentsSnapshot } from '../runtime/src/lib.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const skillDir = path.join(scriptDir, '..')
const cli = path.join(scriptDir, 'mediaflow.mjs')
const fixtureDir = path.join(skillDir, 'assets', 'fixtures')
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mediaflow-smoke-'))
const renderMedia = process.argv.includes('--render')

function run(...args) {
	return runWithEnv({}, ...args)
}

function runWithEnv(env, ...args) {
	const result = spawnSync(process.execPath, [cli, ...args], {
		encoding: 'utf8',
		env: { ...process.env, ...env },
	})
	if (result.status !== 0) {
		throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'))
	}
	return result.stdout
}

function expectFailure(...args) {
	const result = spawnSync(process.execPath, [cli, ...args], {
		encoding: 'utf8',
	})
	if (result.status === 0) {
		throw new Error(`Expected command to fail: ${args.join(' ')}`)
	}
}

function runProgram(command, args) {
	const result = spawnSync(command, args, { encoding: 'utf8' })
	if (result.status !== 0) {
		throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'))
	}
}

async function readJsonl(filePath) {
	return (await fs.readFile(filePath, 'utf8'))
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => JSON.parse(line))
}

async function writeJsonl(filePath, rows) {
	await fs.writeFile(
		filePath,
		`${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
		'utf8',
	)
}

try {
	if (asrTimestamp(1.9996) !== '00:00:02.000') {
		throw new Error(
			'ASR timestamp rounding did not carry milliseconds into seconds',
		)
	}
	const remoteImageFixture = {
		comments: [
			{
				id: 'avatar',
				author: 'Avatar Test',
				authorThumbnail: 'https://127.0.0.1/avatar.png',
				content: 'test',
			},
		],
	}
	if (
		normalizeCommentsSnapshot(remoteImageFixture, { allowRemoteImages: true })
			.comments[0].authorThumbnail
	) {
		throw new Error('Private remote avatar URL was not rejected')
	}

	const subtitleRun = path.join(tempDir, 'subtitles')
	run(
		'prepare-subtitles',
		'--input',
		path.join(fixtureDir, 'transcript.vtt'),
		'--out',
		subtitleRun,
	)
	expectFailure(
		'prepare-subtitles',
		'--input',
		path.join(fixtureDir, 'transcript.vtt'),
		'--out',
		subtitleRun,
	)
	const subtitleResults = (
		await readJsonl(path.join(subtitleRun, 'tasks', 'subtitles.pending.jsonl'))
	).map((task, index) => {
		// First cue is quarantined (exclude) to exercise the fail-closed split;
		// the rest are allowed and rendered.
		const excluded = index === 0
		const moderation = excluded
			? {
					decision: 'exclude',
					categories: ['personal_data'],
					confidence: 'high',
					reasonCode: 'private_info_in_subtitle',
				}
			: {
					decision: 'allow',
					categories: [],
					confidence: 'high',
					reasonCode: 'safe_relevant',
				}
		return {
			...task,
			translation: excluded ? '' : `translated: ${task.source.sourceText}`,
			status: 'completed',
			moderation,
		}
	})
	const subtitleResultPath = path.join(
		subtitleRun,
		'tasks',
		'subtitles.results.jsonl',
	)
	await writeJsonl(subtitleResultPath, subtitleResults)
	const incompleteSubtitlePath = path.join(
		subtitleRun,
		'tasks',
		'subtitles.incomplete.jsonl',
	)
	await writeJsonl(incompleteSubtitlePath, subtitleResults.slice(1))
	expectFailure(
		'validate',
		'--kind',
		'subtitles',
		'--tasks',
		incompleteSubtitlePath,
	)
	const staleSubtitlePath = path.join(
		subtitleRun,
		'tasks',
		'subtitles.stale.jsonl',
	)
	const staleResults = structuredClone(subtitleResults)
	staleResults[0].source.sourceText = 'altered source content'
	await writeJsonl(staleSubtitlePath, staleResults)
	expectFailure('validate', '--kind', 'subtitles', '--tasks', staleSubtitlePath)
	const wrongLanguagePath = path.join(
		subtitleRun,
		'tasks',
		'subtitles.wrong-language.jsonl',
	)
	const wrongLanguageResults = structuredClone(subtitleResults)
	wrongLanguageResults[0].targetLanguage = 'fr'
	await writeJsonl(wrongLanguagePath, wrongLanguageResults)
	expectFailure('validate', '--kind', 'subtitles', '--tasks', wrongLanguagePath)
	const prematureSubtitleOutput = path.join(tempDir, 'subtitles.premature.vtt')
	expectFailure(
		'materialize-subtitles',
		'--tasks',
		subtitleResultPath,
		'--out',
		prematureSubtitleOutput,
	)
	// A subtitle allow cue with an unknown moderation category must be rejected.
	const invalidCategorySubtitlePath = path.join(
		subtitleRun,
		'tasks',
		'subtitles.invalid-category.jsonl',
	)
	const invalidCategorySubtitle = structuredClone(subtitleResults)
	const allowedSubtitle = invalidCategorySubtitle.find(
		(task) => task.kind === 'subtitle' && task.moderation.decision === 'allow',
	)
	allowedSubtitle.moderation.categories = ['unknown_category']
	await writeJsonl(invalidCategorySubtitlePath, invalidCategorySubtitle)
	expectFailure(
		'validate',
		'--kind',
		'subtitles',
		'--tasks',
		invalidCategorySubtitlePath,
	)
	// A subtitle allow cue with an empty translation must be rejected, even
	// though exclude/review cues may leave translation empty.
	const allowNoXlatSubtitlePath = path.join(
		subtitleRun,
		'tasks',
		'subtitles.allow-noxlat.jsonl',
	)
	const allowNoXlatSubtitle = structuredClone(subtitleResults)
	const firstAllowSubtitle = allowNoXlatSubtitle.find(
		(task) => task.kind === 'subtitle' && task.moderation.decision === 'allow',
	)
	firstAllowSubtitle.translation = ''
	await writeJsonl(allowNoXlatSubtitlePath, allowNoXlatSubtitle)
	expectFailure(
		'validate',
		'--kind',
		'subtitles',
		'--tasks',
		allowNoXlatSubtitlePath,
	)
	run('validate', '--kind', 'subtitles', '--tasks', subtitleResultPath)
	const subtitleOutput = path.join(tempDir, 'subtitles.bilingual.vtt')
	run(
		'materialize-subtitles',
		'--tasks',
		subtitleResultPath,
		'--out',
		subtitleOutput,
	)
	const subtitleVtt = await fs.readFile(subtitleOutput, 'utf8')
	if (!subtitleVtt.includes('translated:')) {
		throw new Error('Subtitle materialization did not write translations')
	}
	// The excluded cue must be absent from the burned VTT, and present in the
	// sibling quarantine + report files (fail-closed materialization).
	if (subtitleVtt.includes('Welcome to the workflow.')) {
		throw new Error('Excluded subtitle cue was burned into the output VTT')
	}
	const subtitleQuarantine = JSON.parse(
		await fs.readFile(path.join(tempDir, 'subtitles.quarantine.json'), 'utf8'),
	)
	if (
		subtitleQuarantine.cues?.length !== 1 ||
		subtitleQuarantine.cues[0].moderation?.decision !== 'exclude'
	) {
		throw new Error('Subtitle quarantine did not capture the excluded cue')
	}
	const subtitleReport = JSON.parse(
		await fs.readFile(path.join(tempDir, 'moderation-report.json'), 'utf8'),
	)
	if (
		subtitleReport.totalCues !== 2 ||
		subtitleReport.allowedCues !== 1 ||
		subtitleReport.quarantinedCues !== 1 ||
		subtitleReport.byDecision?.allow !== 1 ||
		subtitleReport.byDecision?.exclude !== 1
	) {
		throw new Error('Subtitle moderation report tallies are incorrect')
	}

	const commentsInput = path.join(tempDir, 'comments-with-avatar.json')
	const commentsFixture = JSON.parse(
		await fs.readFile(path.join(fixtureDir, 'comments.json'), 'utf8'),
	)
	commentsFixture.comments[0].authorThumbnail =
		'https://example.invalid/avatar.png'
	await fs.writeFile(
		commentsInput,
		`${JSON.stringify(commentsFixture, null, 2)}\n`,
		'utf8',
	)
	const commentsRun = path.join(tempDir, 'comments')
	run('prepare-comments', '--input', commentsInput, '--out', commentsRun)
	expectFailure(
		'prepare-comments',
		'--input',
		commentsInput,
		'--out',
		commentsRun,
	)
	const commentsResults = (
		await readJsonl(path.join(commentsRun, 'tasks', 'comments.pending.jsonl'))
	).map((task) => {
		if (task.kind === 'comment-title') {
			return { ...task, translation: 'translated title', status: 'completed' }
		}
		const isSuspicious = task.source.content.includes('https://')
		const moderation = isSuspicious
			? {
					decision: 'exclude',
					categories: ['spam_or_scam'],
					confidence: 'high',
					reasonCode: 'external_link_scam',
				}
			: {
					decision: 'allow',
					categories: [],
					confidence: 'high',
					reasonCode: 'safe_relevant',
				}
		return {
			...task,
			// Excluded comments are quarantined and never rendered, so their
			// translation is optional (may be empty); allows are translated.
			translation:
				moderation.decision === 'exclude'
					? ''
					: `translated: ${task.source.content}`,
			status: 'completed',
			moderation,
		}
	})
	const commentsResultPath = path.join(
		commentsRun,
		'tasks',
		'comments.results.jsonl',
	)
	await writeJsonl(commentsResultPath, commentsResults)
	const invalidCategoryPath = path.join(
		commentsRun,
		'tasks',
		'comments.invalid-category.jsonl',
	)
	const invalidCategoryResults = structuredClone(commentsResults)
	const allowedWithInvalidCategory = invalidCategoryResults.find(
		(task) => task.kind === 'comment' && task.moderation.decision === 'allow',
	)
	allowedWithInvalidCategory.moderation.categories = ['unknown_category']
	await writeJsonl(invalidCategoryPath, invalidCategoryResults)
	expectFailure(
		'validate',
		'--kind',
		'comments',
		'--tasks',
		invalidCategoryPath,
	)
	// An allow comment with an empty translation must still be rejected, even
	// though exclude/review comments may leave translation empty.
	const allowNoXlatPath = path.join(
		commentsRun,
		'tasks',
		'comments.allow-noxlat.jsonl',
	)
	const allowNoXlat = structuredClone(commentsResults)
	const firstAllowNoXlat = allowNoXlat.find(
		(task) => task.kind === 'comment' && task.moderation.decision === 'allow',
	)
	firstAllowNoXlat.translation = ''
	await writeJsonl(allowNoXlatPath, allowNoXlat)
	expectFailure('validate', '--kind', 'comments', '--tasks', allowNoXlatPath)
	expectFailure(
		'materialize-comments',
		'--tasks',
		commentsResultPath,
		'--out',
		path.join(tempDir, 'comments-premature'),
	)
	run('validate', '--kind', 'comments', '--tasks', commentsResultPath)
	const outputDir = path.join(tempDir, 'comments-output')
	const mockAvatarFetch = path.join(tempDir, 'mock-avatar-fetch.mjs')
	await fs.writeFile(
		mockAvatarFetch,
		`globalThis.fetch = async () => new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'), { status: 200, headers: { 'content-type': 'image/png' } })\n`,
		'utf8',
	)
	runWithEnv(
		{
			NODE_OPTIONS:
				`${process.env.NODE_OPTIONS || ''} --import=${pathToFileURL(mockAvatarFetch).href}`.trim(),
		},
		'materialize-comments',
		'--tasks',
		commentsResultPath,
		'--out',
		outputDir,
		'--fetch-avatars',
	)
	const safe = JSON.parse(
		await fs.readFile(path.join(outputDir, 'comments.safe.json'), 'utf8'),
	)
	const quarantine = JSON.parse(
		await fs.readFile(path.join(outputDir, 'comments.quarantine.json'), 'utf8'),
	)
	const moderationReport = JSON.parse(
		await fs.readFile(path.join(outputDir, 'moderation-report.json'), 'utf8'),
	)
	if (safe.comments.length !== 1 || quarantine.comments.length !== 1) {
		throw new Error(
			'Fail-closed moderation materialization produced unexpected output',
		)
	}
	if (safe.comments[0].authorThumbnail) {
		throw new Error('Fetched avatar retained a direct remote URL')
	}
	if (
		!/^avatars\/[a-f0-9]{64}\.png$/.test(
			safe.comments[0].authorThumbnailAsset || '',
		)
	) {
		throw new Error(
			'Comment materialization did not write a cached avatar asset reference',
		)
	}
	const avatarAsset = path.join(
		outputDir,
		'assets',
		safe.comments[0].authorThumbnailAsset,
	)
	if ((await fs.stat(avatarAsset)).size <= 0) {
		throw new Error('Cached avatar asset is empty')
	}
	if (
		moderationReport.avatars?.requested !== 1 ||
		moderationReport.avatars?.fetched !== 1 ||
		moderationReport.avatars?.failed !== 0
	) {
		throw new Error('Avatar materialization report is inconsistent')
	}
	expectFailure(
		'render-comments',
		'--input',
		path.join(outputDir, 'comments.safe.json'),
		'--out',
		path.join(tempDir, 'invalid-template.mp4'),
		'--template',
		'unknown',
	)

	if (renderMedia) {
		const sourceVideo = path.join(tempDir, 'source.mp4')
		runProgram('ffmpeg', [
			'-y',
			'-hide_banner',
			'-loglevel',
			'error',
			'-f',
			'lavfi',
			'-i',
			'color=c=#152a32:s=640x360:d=3',
			'-f',
			'lavfi',
			'-i',
			'anullsrc=channel_layout=stereo:sample_rate=44100',
			'-shortest',
			'-c:v',
			'libx264',
			'-pix_fmt',
			'yuv420p',
			'-c:a',
			'aac',
			sourceVideo,
		])
		const subtitleVideo = path.join(tempDir, 'subtitles.mp4')
		run(
			'render-subtitles',
			'--video',
			sourceVideo,
			'--subtitles',
			subtitleOutput,
			'--out',
			subtitleVideo,
		)
		const commentsVideo = path.join(tempDir, 'comments.mp4')
		expectFailure(
			'render-comments',
			'--input',
			path.join(fixtureDir, 'comments.json'),
			'--out',
			path.join(tempDir, 'unsafe-comments.mp4'),
		)
		run(
			'render-comments',
			'--input',
			path.join(outputDir, 'comments.safe.json'),
			'--out',
			commentsVideo,
		)
		for (const output of [subtitleVideo, commentsVideo]) {
			const stat = await fs.stat(output)
			if (stat.size <= 0)
				throw new Error(`Expected rendered output is empty: ${output}`)
		}
	}

	console.log(
		JSON.stringify({
			ok: true,
			tempDir,
			safeComments: safe.comments.length,
			quarantinedComments: quarantine.comments.length,
			rendered: renderMedia,
		}),
	)
} finally {
	await fs.rm(tempDir, { recursive: true, force: true })
}
