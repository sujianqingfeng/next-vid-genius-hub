#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const skillDir = path.join(scriptDir, '..')
const cli = path.join(scriptDir, 'mediaflow.mjs')
const fixtureDir = path.join(skillDir, 'assets', 'fixtures')
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mediaflow-smoke-'))
const renderMedia = process.argv.includes('--render')

function run(...args) {
	const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
	if (result.status !== 0) {
		throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'))
	}
	return result.stdout
}

function expectFailure(...args) {
	const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
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
	await fs.writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')
}

try {
	const subtitleRun = path.join(tempDir, 'subtitles')
	run('prepare-subtitles', '--input', path.join(fixtureDir, 'transcript.vtt'), '--out', subtitleRun)
	const subtitleResults = (await readJsonl(path.join(subtitleRun, 'tasks', 'subtitles.pending.jsonl'))).map((task) => ({
		...task,
		translation: `translated: ${task.source.sourceText}`,
		status: 'completed',
	}))
	const subtitleResultPath = path.join(subtitleRun, 'tasks', 'subtitles.results.jsonl')
	await writeJsonl(subtitleResultPath, subtitleResults)
	const incompleteSubtitlePath = path.join(subtitleRun, 'tasks', 'subtitles.incomplete.jsonl')
	await writeJsonl(incompleteSubtitlePath, subtitleResults.slice(1))
	expectFailure('validate', '--kind', 'subtitles', '--tasks', incompleteSubtitlePath)
	const staleSubtitlePath = path.join(subtitleRun, 'tasks', 'subtitles.stale.jsonl')
	const staleResults = structuredClone(subtitleResults)
	staleResults[0].source.sourceText = 'altered source content'
	await writeJsonl(staleSubtitlePath, staleResults)
	expectFailure('validate', '--kind', 'subtitles', '--tasks', staleSubtitlePath)
	run('validate', '--kind', 'subtitles', '--tasks', subtitleResultPath)
	const subtitleOutput = path.join(tempDir, 'subtitles.bilingual.vtt')
	run('materialize-subtitles', '--tasks', subtitleResultPath, '--out', subtitleOutput)
	if (!(await fs.readFile(subtitleOutput, 'utf8')).includes('translated:')) {
		throw new Error('Subtitle materialization did not write translations')
	}

	const commentsRun = path.join(tempDir, 'comments')
	run('prepare-comments', '--input', path.join(fixtureDir, 'comments.json'), '--out', commentsRun)
	const commentsResults = (await readJsonl(path.join(commentsRun, 'tasks', 'comments.pending.jsonl'))).map((task) => {
		if (task.kind === 'comment-title') {
			return { ...task, translation: 'translated title', status: 'completed' }
		}
		const isSuspicious = task.source.content.includes('https://')
		return {
			...task,
			translation: `translated: ${task.source.content}`,
			status: 'completed',
			moderation: isSuspicious
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
					},
		}
	})
	const commentsResultPath = path.join(commentsRun, 'tasks', 'comments.results.jsonl')
	await writeJsonl(commentsResultPath, commentsResults)
	run('validate', '--kind', 'comments', '--tasks', commentsResultPath)
	const outputDir = path.join(tempDir, 'comments-output')
	run('materialize-comments', '--tasks', commentsResultPath, '--out', outputDir)
	const safe = JSON.parse(await fs.readFile(path.join(outputDir, 'comments.safe.json'), 'utf8'))
	const quarantine = JSON.parse(await fs.readFile(path.join(outputDir, 'comments.quarantine.json'), 'utf8'))
	if (safe.comments.length !== 1 || quarantine.comments.length !== 1) {
		throw new Error('Fail-closed moderation materialization produced unexpected output')
	}

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
		run('render-subtitles', '--video', sourceVideo, '--subtitles', subtitleOutput, '--out', subtitleVideo)
		const commentsVideo = path.join(tempDir, 'comments.mp4')
		expectFailure(
			'render-comments',
			'--input',
			path.join(fixtureDir, 'comments.json'),
			'--out',
			path.join(tempDir, 'unsafe-comments.mp4'),
		)
		run('render-comments', '--input', path.join(outputDir, 'comments.safe.json'), '--out', commentsVideo)
		for (const output of [subtitleVideo, commentsVideo]) {
			const stat = await fs.stat(output)
			if (stat.size <= 0) throw new Error(`Expected rendered output is empty: ${output}`)
		}
	}

	console.log(JSON.stringify({ ok: true, tempDir, safeComments: safe.comments.length, quarantinedComments: quarantine.comments.length, rendered: renderMedia }))
} finally {
	await fs.rm(tempDir, { recursive: true, force: true })
}
