#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import path from 'node:path'

const SRC_DIR = path.resolve('scripts/local-job-runner/src')
const ALLOWED_DIR = path.join(SRC_DIR, 'executors')
const ALLOWLIST_PATH_PATTERNS = [/check-boundary\.ts$/]

type ViolationRule = {
	id: string
	description: string
	pattern: RegExp
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createImportRule(moduleName: string): ViolationRule {
	const escaped = escapeRegExp(moduleName)
	return {
		id: `import-${moduleName.replace(/[^a-z0-9]+/gi, '-')}`,
		description: `network client import for "${moduleName}"`,
		pattern: new RegExp(
			`\\b(?:from\\s+['"]${escaped}['"]|require\\(\\s*['"]${escaped}['"]\\s*\\)|import\\(\\s*['"]${escaped}['"]\\s*\\))`,
		),
	}
}

const NETWORK_RULES: ViolationRule[] = [
	{
		id: 'fetch-call',
		description: 'fetch() usage',
		pattern: /\b(?:globalThis\.)?fetch\s*\(/,
	},
	createImportRule('node:http'),
	createImportRule('node:https'),
	createImportRule('http'),
	createImportRule('https'),
	createImportRule('undici'),
	createImportRule('axios'),
	createImportRule('got'),
	createImportRule('ky'),
]

function isAllowlisted(file: string): boolean {
	return ALLOWLIST_PATH_PATTERNS.some((pattern) => pattern.test(file))
}

async function walk(dir: string): Promise<string[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true })
	const files: string[] = []
	for (const entry of entries) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			files.push(...(await walk(full)))
			continue
		}
		if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
			files.push(full)
		}
	}
	return files
}

async function main() {
	const files = await walk(SRC_DIR)
	const violations: Array<{
		file: string
		line: number
		text: string
		ruleId: string
		ruleDescription: string
	}> = []
	for (const file of files) {
		if (isAllowlisted(file)) continue
		if (file.startsWith(ALLOWED_DIR)) continue
		const raw = await fs.readFile(file, 'utf8')
		const lines = raw.split(/\r?\n/)
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!
			for (const rule of NETWORK_RULES) {
				if (!rule.pattern.test(line)) continue
				violations.push({
					file,
					line: i + 1,
					text: line.trim(),
					ruleId: rule.id,
					ruleDescription: rule.description,
				})
			}
		}
	}

	if (violations.length === 0) {
		console.log('OK: no outbound-network usage outside executors/')
		return
	}

	console.error('Found outbound-network usage outside executors/:')
	for (const item of violations) {
		console.error(
			`- [${item.ruleId}] ${item.file}:${item.line} ${item.text} (${item.ruleDescription})`,
		)
	}
	process.exit(1)
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
