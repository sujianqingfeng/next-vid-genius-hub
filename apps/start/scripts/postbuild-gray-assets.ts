import { cp, mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await stat(filePath)
		return true
	} catch {
		return false
	}
}

async function main() {
	const clientDir = path.resolve(process.cwd(), 'dist/client')
	const assetsDir = path.join(clientDir, 'assets')
	const grayAssetsDir = path.join(clientDir, '__start/assets')

	if (!(await pathExists(clientDir))) return
	if (!(await pathExists(assetsDir))) return

	await mkdir(path.dirname(grayAssetsDir), { recursive: true })
	await rm(grayAssetsDir, { recursive: true, force: true })
	await mkdir(grayAssetsDir, { recursive: true })

	await cp(assetsDir, grayAssetsDir, { recursive: true })
}

main().catch((err) => {
	// biome-ignore lint/suspicious/noConsole: build script output
	console.error('[postbuild-gray-assets] failed:', err)
	process.exitCode = 1
})

