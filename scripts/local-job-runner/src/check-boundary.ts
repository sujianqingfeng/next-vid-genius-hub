#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import path from 'node:path'

const SRC_DIR = path.resolve('scripts/local-job-runner/src')
const ALLOWED_DIR = path.join(SRC_DIR, 'executors')

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
	const violations: Array<{ file: string; line: number; text: string }> = []
	for (const file of files) {
		if (file.endsWith('check-boundary.ts')) continue
		if (file.startsWith(ALLOWED_DIR)) continue
		const raw = await fs.readFile(file, 'utf8')
		const lines = raw.split(/\r?\n/)
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!
			if (/\bfetch\s*\(/.test(line)) {
				violations.push({ file, line: i + 1, text: line.trim() })
			}
		}
	}

	if (violations.length === 0) {
		console.log('OK: no fetch() usage outside executors/')
		return
	}

	console.error('Found fetch() usage outside executors/:')
	for (const item of violations) {
		console.error(`- ${item.file}:${item.line} ${item.text}`)
	}
	process.exit(1)
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
