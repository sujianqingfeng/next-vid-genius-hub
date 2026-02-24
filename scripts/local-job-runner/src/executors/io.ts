import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ensureDir, isRemoteUrl } from '../fs-utils'

export async function readTextFromPathOrUrl(input: {
	path?: string
	url?: string
	timeoutMs?: number
}): Promise<string> {
	if (input.path) {
		return fs.readFile(path.resolve(input.path), 'utf8')
	}
	if (!input.url) {
		throw new Error('Either path or url must be provided')
	}
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), input.timeoutMs || 20_000)
	try {
		const response = await fetch(input.url, {
			method: 'GET',
			signal: controller.signal,
			cache: 'no-store',
		})
		if (!response.ok) {
			throw new Error(`Request failed: ${response.status} ${response.statusText}`)
		}
		return await response.text()
	} finally {
		clearTimeout(timeout)
	}
}

export async function readBufferFromPathOrUrl(input: {
	path?: string
	url?: string
	timeoutMs?: number
}): Promise<Buffer> {
	if (input.path) {
		return fs.readFile(path.resolve(input.path))
	}
	if (!input.url) {
		throw new Error('Either path or url must be provided')
	}
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), input.timeoutMs || 30_000)
	try {
		const response = await fetch(input.url, {
			method: 'GET',
			signal: controller.signal,
			cache: 'no-store',
		})
		if (!response.ok) {
			throw new Error(`Request failed: ${response.status} ${response.statusText}`)
		}
		return Buffer.from(await response.arrayBuffer())
	} finally {
		clearTimeout(timeout)
	}
}

export async function materializeInputFile(input: {
	path?: string
	url?: string
	fallbackPath: string
	timeoutMs?: number
}): Promise<string> {
	if (input.path) return path.resolve(input.path)
	if (!input.url) return path.resolve(input.fallbackPath)

	const target = path.resolve(input.fallbackPath)
	await ensureDir(path.dirname(target))
	const data = await readBufferFromPathOrUrl({
		url: input.url,
		timeoutMs: input.timeoutMs,
	})
	await fs.writeFile(target, data)
	return target
}

export function assertNoInternalApiUrl(url: string): void {
	const u = String(url || '')
	if (!u) return
	if (/\/api\//.test(u) || /localhost:(3100|8787)/.test(u)) {
		throw new Error(`Internal API URL is not allowed in local runner: ${u}`)
	}
}

export function normalizeOptionalRemote(urlOrPath: string):
	| { path: string; url?: undefined }
	| { path?: undefined; url: string } {
	const value = String(urlOrPath || '').trim()
	if (!value) return { path: '' }
	if (isRemoteUrl(value)) {
		assertNoInternalApiUrl(value)
		return { url: value }
	}
	return { path: path.resolve(value) }
}
