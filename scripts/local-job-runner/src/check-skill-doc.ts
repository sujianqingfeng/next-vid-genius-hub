#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { listSupportedKinds } from './dispatch'

const DEFAULT_SKILL_MD = path.resolve('docs/skills/local-media-orchestrator/SKILL.md')

function extractLocalRunCommands(markdown: string): Set<string> {
	const commands = new Set<string>()
	const commandPattern = /`pnpm\s+local-run\s+([a-z-]+)(?=\s|`)/g
	let match = commandPattern.exec(markdown)
	while (match) {
		const command = match[1]?.trim()
		if (command) commands.add(command)
		match = commandPattern.exec(markdown)
	}
	return commands
}

async function main(): Promise<void> {
	const skillPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SKILL_MD
	const markdown = await readFile(skillPath, 'utf8')
	const foundCommands = extractLocalRunCommands(markdown)
	const expectedCommands = new Set<string>([
		...listSupportedKinds(),
		'status',
		'cancel',
		'clean',
	])

	const missing = Array.from(expectedCommands).filter((command) => !foundCommands.has(command))
	const unknown = Array.from(foundCommands).filter((command) => !expectedCommands.has(command))

	if (missing.length === 0 && unknown.length === 0) {
		console.log(`OK: skill command list matches local-run commands (${skillPath})`)
		return
	}

	if (missing.length > 0) {
		console.error(`Missing commands in skill doc: ${missing.join(', ')}`)
	}
	if (unknown.length > 0) {
		console.error(`Unknown commands in skill doc: ${unknown.join(', ')}`)
	}
	process.exit(1)
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error)
	console.error(`[local-run:check-skill-doc] ${message}`)
	process.exit(1)
})
