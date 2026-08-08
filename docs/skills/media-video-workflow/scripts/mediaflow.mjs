#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const runtimeCli = path.join(scriptDir, '..', 'runtime', 'src', 'workflow.mjs')
const result = spawnSync(process.execPath, [runtimeCli, ...process.argv.slice(2)], {
	stdio: 'inherit',
})

if (result.error) {
	console.error(`[mediaflow] ${result.error.message}`)
	process.exit(1)
}
process.exit(result.status ?? 1)
