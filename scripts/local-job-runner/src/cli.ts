#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ExternalPorts, LocalJobKind, LocalJobSpec } from './contracts'
import { listJobCommands, listLocalRunCommands } from './command-surface'
import { createCloudObjectStorePort } from './executors/cloud-object-store'
import { createLocalMediaOrchestrator } from './orchestrator'
import { createJobId } from './state-store'

type ParsedArgs = {
	positional: string[]
	flags: Record<string, string | boolean>
}

type CleanupSummary = {
	stateDir: string
	all: boolean
	dryRun: boolean
	orphansOnly: boolean
	days: number
	removedJobDocs: number
	removedJobArtifacts: number
	removedOrphanArtifacts: number
	keptActiveJobs: number
	keptRecentTerminalJobs: number
	errors: string[]
}

function parseArgs(argv: string[]): ParsedArgs {
	const positional: string[] = []
	const flags: Record<string, string | boolean> = {}
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i]!
		if (!token.startsWith('--')) {
			positional.push(token)
			continue
		}
		const key = token.slice(2)
		const next = argv[i + 1]
		if (!next || next.startsWith('--')) {
			flags[key] = true
			continue
		}
		flags[key] = next
		i += 1
	}
	return { positional, flags }
}

function printHelp(): void {
	const commandLines = listLocalRunCommands()
		.map((command) => `  ${command}`)
		.join('\n')

	console.log(`local-run - local media orchestrator\n
Usage:
  local-run <command> [--input <file.json>] [--payload '<json>'] [--job-id <id>] [--state-dir <dir>] [--upload] [--upload-base-url <url>] [--upload-prefix <prefix>]
  local-run status <jobId> [--state-dir <dir>]
  local-run cancel <jobId> [--reason <text>] [--state-dir <dir>]
  local-run clean [--state-dir <dir>] [--days <n>] [--all] [--orphans-only] [--dry-run]

Commands:
${commandLines}

Examples:
  local-run download --payload '{"url":"https://www.youtube.com/watch?v=...","quality":"1080p"}'
  local-run comments-translate --payload '{"dataPath":"./comments-snapshot.json","targetLanguage":"zh-CN"}'
  local-run comments-review --payload '{"dataPath":"./comments-snapshot.translated.json","mode":"prepare"}'
  local-run comments-review --payload '{"dataPath":"./comments-snapshot.translated.json","mode":"apply","reviewPath":"./comments-review.template.json"}'
  local-run clean --days 3 --dry-run
  local-run clean --all
  local-run render-subtitles --input ./examples/subtitles-job.json
  local-run render-subtitles --payload '{"videoPath":"<video.mp4>","subtitlePath":"<bilingual.vtt>","overlapPolicy":"force-clip"}'
  local-run render-subtitles --payload '{"videoPath":"<video.mp4>","subtitlePath":"<bilingual.vtt>"}' --upload --upload-base-url 'https://media-orchestrator.<account>.workers.dev' --upload-prefix 'shared'
  local-run status job_abc123
`)
}

function isTruthyFlag(value: string | boolean | undefined): boolean {
	if (value === true) return true
	if (typeof value !== 'string') return false
	const normalized = value.trim().toLowerCase()
	return (
		normalized === '1' ||
		normalized === 'true' ||
		normalized === 'yes' ||
		normalized === 'y' ||
		normalized === 'on'
	)
}

function parseDays(flags: Record<string, string | boolean>): number {
	const raw = flags.days
	if (raw == null || raw === false) return 3
	const parsed = Number(raw)
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error('--days must be a non-negative number')
	}
	return parsed
}

function resolveRunPorts(flags: Record<string, string | boolean>): ExternalPorts {
	const uploadEnabled = isTruthyFlag(flags.upload) || isTruthyFlag(process.env.LOCAL_RUN_UPLOAD)
	if (!uploadEnabled) return {}

	const baseUrlFromFlag =
		typeof flags['upload-base-url'] === 'string'
			? flags['upload-base-url'].trim()
			: ''
	const baseUrl =
		baseUrlFromFlag ||
		String(process.env.LOCAL_RUN_UPLOAD_BASE_URL || process.env.CF_ORCHESTRATOR_URL || '').trim()
	if (!baseUrl) {
		throw new Error(
			'--upload requires --upload-base-url or LOCAL_RUN_UPLOAD_BASE_URL / CF_ORCHESTRATOR_URL',
		)
	}

	const keyPrefixFromFlag =
		typeof flags['upload-prefix'] === 'string'
			? flags['upload-prefix'].trim()
			: ''
	const keyPrefix =
		keyPrefixFromFlag ||
		String(process.env.LOCAL_RUN_UPLOAD_PREFIX || '').trim() ||
		'local-run'

	return {
		objectStore: createCloudObjectStorePort({
			baseUrl,
			keyPrefix,
		}),
	}
}

async function removePath(target: string, dryRun: boolean): Promise<void> {
	if (dryRun) return
	await fs.rm(target, { recursive: true, force: true })
}

async function listJobDocs(stateDir: string): Promise<string[]> {
	const entries = await fs.readdir(stateDir, { withFileTypes: true }).catch(() => [])
	return entries
		.filter((entry) => entry.isFile() && /^job_.+\.json$/.test(entry.name))
		.map((entry) => path.join(stateDir, entry.name))
}

async function listArtifactDirs(stateDir: string): Promise<string[]> {
	const artifactsDir = path.join(stateDir, 'artifacts')
	const entries = await fs
		.readdir(artifactsDir, { withFileTypes: true })
		.catch(() => [])
	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.join(artifactsDir, entry.name))
}

async function cleanLocalJobs(
	stateDirInput: string,
	flags: Record<string, string | boolean>,
): Promise<CleanupSummary> {
	const stateDir = path.resolve(stateDirInput)
	const all = isTruthyFlag(flags.all)
	const dryRun = isTruthyFlag(flags['dry-run'])
	const orphansOnly = isTruthyFlag(flags['orphans-only'])
	const days = parseDays(flags)

	const summary: CleanupSummary = {
		stateDir,
		all,
		dryRun,
		orphansOnly,
		days,
		removedJobDocs: 0,
		removedJobArtifacts: 0,
		removedOrphanArtifacts: 0,
		keptActiveJobs: 0,
		keptRecentTerminalJobs: 0,
		errors: [],
	}

	const stateDirExists = await fs
		.stat(stateDir)
		.then((st) => st.isDirectory())
		.catch(() => false)
	if (!stateDirExists) return summary

	const terminalStatuses = new Set(['completed', 'failed', 'canceled'])
	const now = Date.now()
	const cutoffTs = now - days * 24 * 60 * 60 * 1000

	if (all) {
		const docs = await listJobDocs(stateDir)
		const artifactDirs = await listArtifactDirs(stateDir)
		summary.removedJobDocs = docs.length
		summary.removedJobArtifacts = artifactDirs.length
		await removePath(stateDir, dryRun)
		if (!dryRun) {
			await fs.mkdir(stateDir, { recursive: true })
		}
		return summary
	}

	if (!orphansOnly) {
		const docs = await listJobDocs(stateDir)
		for (const docPath of docs) {
			try {
				const docText = await fs.readFile(docPath, 'utf8')
				const doc = JSON.parse(docText) as Record<string, unknown>
				const status = String(doc.status || '').trim().toLowerCase()
				const stat = await fs.stat(docPath)
				const isTerminal = terminalStatuses.has(status)
				if (!isTerminal) {
					summary.keptActiveJobs += 1
					continue
				}
				if (stat.mtimeMs > cutoffTs) {
					summary.keptRecentTerminalJobs += 1
					continue
				}

				const jobId = path.basename(docPath, '.json')
				await removePath(docPath, dryRun)
				summary.removedJobDocs += 1

				const artifactDir = path.join(stateDir, 'artifacts', jobId)
				const hasArtifacts = await fs
					.stat(artifactDir)
					.then((s) => s.isDirectory())
					.catch(() => false)
				if (hasArtifacts) {
					await removePath(artifactDir, dryRun)
					summary.removedJobArtifacts += 1
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				summary.errors.push(`${path.basename(docPath)}: ${message}`)
			}
		}
	}

	const artifactDirs = await listArtifactDirs(stateDir)
	for (const dirPath of artifactDirs) {
		const jobId = path.basename(dirPath)
		const statePath = path.join(stateDir, `${jobId}.json`)
		const hasState = await fs
			.stat(statePath)
			.then((st) => st.isFile())
			.catch(() => false)
		if (!hasState) {
			await removePath(dirPath, dryRun)
			summary.removedOrphanArtifacts += 1
		}
	}

	return summary
}

async function loadPayload(flags: Record<string, string | boolean>): Promise<Record<string, unknown>> {
	if (typeof flags.input === 'string') {
		const file = path.resolve(flags.input)
		const text = await fs.readFile(file, 'utf8')
		const parsed = JSON.parse(text)
		if (!parsed || typeof parsed !== 'object') {
			throw new Error(`Input file must contain a JSON object: ${file}`)
		}
		return parsed as Record<string, unknown>
	}
	if (typeof flags.payload === 'string') {
		const parsed = JSON.parse(flags.payload)
		if (!parsed || typeof parsed !== 'object') {
			throw new Error('--payload must be a JSON object')
		}
		return parsed as Record<string, unknown>
	}
	return {}
}

function isSupportedKind(kind: string): kind is LocalJobKind {
	return listJobCommands().includes(kind as LocalJobKind)
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2)
	const { positional, flags } = parseArgs(argv)

	const command = positional[0]
	if (!command || command === 'help' || flags.help) {
		printHelp()
		return
	}

	const stateDir = typeof flags['state-dir'] === 'string' ? flags['state-dir'] : '.local-jobs'

	if (command === 'clean') {
		const result = await cleanLocalJobs(stateDir, flags)
		console.log(JSON.stringify(result, null, 2))
		return
	}

	if (command === 'status') {
		const orchestrator = createLocalMediaOrchestrator({ stateDir })
		const jobId = positional[1] || (typeof flags['job-id'] === 'string' ? flags['job-id'] : '')
		if (!jobId) throw new Error('status requires <jobId> or --job-id')
		const status = await orchestrator.getStatus(jobId)
		console.log(JSON.stringify(status, null, 2))
		return
	}

	if (command === 'cancel') {
		const orchestrator = createLocalMediaOrchestrator({ stateDir })
		const jobId = positional[1] || (typeof flags['job-id'] === 'string' ? flags['job-id'] : '')
		if (!jobId) throw new Error('cancel requires <jobId> or --job-id')
		const reason = typeof flags.reason === 'string' ? flags.reason : undefined
		const result = await orchestrator.cancelJob(jobId, reason)
		console.log(JSON.stringify(result, null, 2))
		return
	}

	if (!isSupportedKind(command)) {
		throw new Error(
			`Unsupported command: ${command}. Supported: ${listJobCommands().join(', ')}`,
		)
	}

	const payload = await loadPayload(flags)
	const jobId =
		typeof flags['job-id'] === 'string' && flags['job-id'].trim()
			? flags['job-id'].trim()
			: createJobId()

	const spec: LocalJobSpec = {
		jobId,
		kind: command,
		input: payload,
		createdAt: Date.now(),
	}

	const ports = resolveRunPorts(flags)
	const orchestrator = createLocalMediaOrchestrator({ stateDir, ports })
	const result = await orchestrator.runJob(spec)
	const status = await orchestrator.getStatus(result.jobId)
	console.log(
		JSON.stringify(
			{
				result,
				status,
			},
			null,
			2,
		),
	)
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error)
	console.error(`[local-run] ${message}`)
	process.exitCode = 1
})
