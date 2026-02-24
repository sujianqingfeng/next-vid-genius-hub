#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { listLocalRunCommands, type LocalRunCommand } from './command-surface'

const DEFAULT_SKILL_MD = path.resolve('docs/skills/local-media-orchestrator/SKILL.md')
const DEFAULT_COMMANDS_REF = path.resolve(
	'docs/skills/local-media-orchestrator/references/commands.md',
)
const DEFAULT_CLI = path.resolve('scripts/local-job-runner/src/cli.ts')

type CommandSurfaceDiff = {
	missing: string[]
	unknown: string[]
	outOfOrder: boolean
	expectedKnownOrder: string[]
	foundKnownOrder: string[]
}

function uniqueOrdered(items: string[]): string[] {
	const seen = new Set<string>()
	const ordered: string[] = []
	for (const item of items) {
		const command = item.trim()
		if (!command || seen.has(command)) continue
		seen.add(command)
		ordered.push(command)
	}
	return ordered
}

function extractLocalRunCommandsFromMarkdown(markdown: string): string[] {
	const commands: string[] = []
	const commandPattern = /`pnpm\s+local-run\s+([a-z-]+)(?=\s|`)/g
	let match = commandPattern.exec(markdown)
	while (match) {
		const command = match[1]?.trim()
		if (command) commands.push(command)
		match = commandPattern.exec(markdown)
	}
	return uniqueOrdered(commands)
}

function extractCommandsFromCliHelp(helpText: string): string[] {
	const sectionMatch = helpText.match(
		/(?:^|\n)\s*Commands:\r?\n([\s\S]*?)(?:\r?\n\s*Examples:|$)/,
	)
	if (!sectionMatch) {
		throw new Error('Failed to locate "Commands:" section in CLI help output')
	}
	const section = sectionMatch[1]
	if (!section) return []
	const commands = section
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => /^[a-z-]+$/.test(line))
	return uniqueOrdered(commands)
}

function runCliHelpAndExtractCommands(cliPath: string): string[] {
	const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
	const result = spawnSync(pnpmBin, ['exec', 'tsx', cliPath, 'help'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	if (result.status !== 0) {
		const stderr = result.stderr?.trim()
		const stdout = result.stdout?.trim()
		throw new Error(
			[
				'Failed to execute CLI help for command-surface check.',
				stderr ? `stderr: ${stderr}` : '',
				stdout ? `stdout: ${stdout}` : '',
			]
				.filter(Boolean)
				.join('\n'),
		)
	}
	return extractCommandsFromCliHelp(result.stdout ?? '')
}

function diffCommandSurface(foundCommands: string[], expectedCommands: string[]): CommandSurfaceDiff {
	const found = uniqueOrdered(foundCommands)
	const expected = uniqueOrdered(expectedCommands)
	const foundSet = new Set(found)
	const expectedSet = new Set(expected)

	const missing = expected.filter((command) => !foundSet.has(command))
	const unknown = found.filter((command) => !expectedSet.has(command))
	const foundKnownOrder = found.filter((command) => expectedSet.has(command))
	const expectedKnownOrder = expected.filter((command) => foundSet.has(command))
	const outOfOrder = foundKnownOrder.join('|') !== expectedKnownOrder.join('|')

	return {
		missing,
		unknown,
		outOfOrder,
		expectedKnownOrder,
		foundKnownOrder,
	}
}

function formatCommands(commands: string[]): string {
	return commands.join(', ') || '(none)'
}

async function main(): Promise<void> {
	const skillPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SKILL_MD
	const expectedCommands = listLocalRunCommands() as LocalRunCommand[]
	const surfaces = [
		{
			label: 'SKILL.md',
			path: skillPath,
			commands: extractLocalRunCommandsFromMarkdown(await readFile(skillPath, 'utf8')),
		},
		{
			label: 'commands.md',
			path: DEFAULT_COMMANDS_REF,
			commands: extractLocalRunCommandsFromMarkdown(await readFile(DEFAULT_COMMANDS_REF, 'utf8')),
		},
		{
			label: 'cli-help',
			path: DEFAULT_CLI,
			commands: runCliHelpAndExtractCommands(DEFAULT_CLI),
		},
	]

	let hasError = false
	for (const surface of surfaces) {
		const diff = diffCommandSurface(surface.commands, expectedCommands)
		if (diff.missing.length === 0 && diff.unknown.length === 0 && !diff.outOfOrder) {
			continue
		}
		hasError = true
		if (diff.missing.length > 0) {
			console.error(
				`[${surface.label}] Missing commands (${surface.path}): ${formatCommands(diff.missing)}`,
			)
		}
		if (diff.unknown.length > 0) {
			console.error(
				`[${surface.label}] Unknown commands (${surface.path}): ${formatCommands(diff.unknown)}`,
			)
		}
		if (diff.outOfOrder) {
			console.error(
				`[${surface.label}] Command order mismatch (${surface.path}). expected: ${formatCommands(diff.expectedKnownOrder)}; found: ${formatCommands(diff.foundKnownOrder)}`,
			)
		}
	}

	if (hasError) {
		process.exit(1)
	}

	console.log(
		`OK: local-run command surfaces are aligned (${skillPath}, ${DEFAULT_COMMANDS_REF}, cli help)`,
	)
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error)
	console.error(`[local-run:check-skill-doc] ${message}`)
	process.exit(1)
})
