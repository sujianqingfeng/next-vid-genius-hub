import { promises as fs } from 'node:fs'
import path from 'node:path'

export async function ensureDir(dirPath: string): Promise<void> {
	await fs.mkdir(dirPath, { recursive: true })
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
	await ensureDir(path.dirname(filePath))
	await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
	const raw = await fs.readFile(filePath, 'utf8')
	return JSON.parse(raw) as T
}

export function resolveOutputPath(baseDir: string, relativeOrAbsolute: string): string {
	if (!relativeOrAbsolute) return baseDir
	if (path.isAbsolute(relativeOrAbsolute)) return relativeOrAbsolute
	return path.join(baseDir, relativeOrAbsolute)
}

export function extFromContentType(contentType: string | null | undefined): string {
	const normalized = String(contentType || '')
		.split(';')[0]
		.trim()
		.toLowerCase()
	switch (normalized) {
		case 'image/jpeg':
			return '.jpg'
		case 'image/png':
			return '.png'
		case 'image/webp':
			return '.webp'
		case 'image/gif':
			return '.gif'
		case 'video/mp4':
			return '.mp4'
		case 'application/json':
			return '.json'
		case 'audio/mpeg':
			return '.mp3'
		case 'audio/wav':
		case 'audio/x-wav':
			return '.wav'
		default:
			return ''
	}
}

export function isRemoteUrl(value: string): boolean {
	return /^https?:\/\//i.test(String(value || ''))
}

export function sanitizeFileName(name: string): string {
	const n = String(name || '').trim()
	if (!n) return 'untitled'
	return n.replace(/[^a-zA-Z0-9._-]+/g, '_')
}
