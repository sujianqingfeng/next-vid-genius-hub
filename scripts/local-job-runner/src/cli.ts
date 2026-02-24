#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { LocalJobKind, LocalJobSpec } from './contracts'
import { listSupportedKinds } from './dispatch'
import { createLocalMediaOrchestrator } from './orchestrator'
import { createJobId } from './state-store'

type ParsedArgs = {
	positional: string[]
	flags: Record<string, string | boolean>
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
	console.log(`local-run - local media orchestrator\n
Usage:
  local-run <command> [--input <file.json>] [--payload '<json>'] [--job-id <id>] [--state-dir <dir>]
  local-run status <jobId> [--state-dir <dir>]
  local-run cancel <jobId> [--reason <text>] [--state-dir <dir>]

Commands:
  download
  render-subtitles
  render-comments
  comments-translate
  comments-review
  comments-download
  channel-sync
  thread-asset-ingest
  asr
  proxy-check
  status
  cancel

Examples:
  local-run download --payload '{"url":"https://www.youtube.com/watch?v=...","quality":"1080p"}'
  local-run comments-translate --payload '{"dataPath":"./comments-snapshot.json","targetLanguage":"zh-CN"}'
  local-run comments-review --payload '{"dataPath":"./comments-snapshot.translated.json","mode":"prepare"}'
  local-run comments-review --payload '{"dataPath":"./comments-snapshot.translated.json","mode":"apply","reviewPath":"./comments-review.template.json"}'
  local-run render-subtitles --input ./examples/subtitles-job.json
  local-run status job_abc123
`)
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
	return listSupportedKinds().includes(kind as LocalJobKind)
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
	const orchestrator = createLocalMediaOrchestrator({ stateDir })

	if (command === 'status') {
		const jobId = positional[1] || (typeof flags['job-id'] === 'string' ? flags['job-id'] : '')
		if (!jobId) throw new Error('status requires <jobId> or --job-id')
		const status = await orchestrator.getStatus(jobId)
		console.log(JSON.stringify(status, null, 2))
		return
	}

	if (command === 'cancel') {
		const jobId = positional[1] || (typeof flags['job-id'] === 'string' ? flags['job-id'] : '')
		if (!jobId) throw new Error('cancel requires <jobId> or --job-id')
		const reason = typeof flags.reason === 'string' ? flags.reason : undefined
		const result = await orchestrator.cancelJob(jobId, reason)
		console.log(JSON.stringify(result, null, 2))
		return
	}

	if (!isSupportedKind(command)) {
		throw new Error(
			`Unsupported command: ${command}. Supported: ${listSupportedKinds().join(', ')}`,
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
