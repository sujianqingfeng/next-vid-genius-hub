import { promises as fs } from 'node:fs'
import path from 'node:path'
import { normalizeRemoteImageUrl, pathExists, sha256 } from './lib.mjs'

const MAX_AVATAR_BYTES = 256 * 1024
const AVATAR_TIMEOUT_MS = 10_000
const AVATAR_EXTENSIONS = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
}

function avatarExtension(contentType) {
	return AVATAR_EXTENSIONS[contentType]
}

function hasBytes(bytes, offset, expected) {
	return expected.every((value, index) => bytes[offset + index] === value)
}

function validateImageBytes(bytes, contentType) {
	const valid =
		(contentType === 'image/jpeg' && hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) ||
		(contentType === 'image/png' &&
			hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
		(contentType === 'image/webp' &&
			hasBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
			hasBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50])) ||
		(contentType === 'image/gif' &&
			hasBytes(bytes, 0, [0x47, 0x49, 0x46, 0x38]) &&
			(bytes[4] === 0x37 || bytes[4] === 0x39) &&
			bytes[5] === 0x61)
	if (!valid) throw new Error(`avatar bytes do not match ${contentType}`)
}

async function readResponseBytes(response) {
	const contentLength = Number(response.headers.get('content-length'))
	if (Number.isFinite(contentLength) && contentLength > MAX_AVATAR_BYTES) {
		throw new Error(`avatar exceeds ${MAX_AVATAR_BYTES} bytes`)
	}
	if (!response.body) {
		const bytes = new Uint8Array(await response.arrayBuffer())
		if (bytes.byteLength > MAX_AVATAR_BYTES) {
			throw new Error(`avatar exceeds ${MAX_AVATAR_BYTES} bytes`)
		}
		return bytes
	}
	const reader = response.body.getReader()
	const chunks = []
	let total = 0
	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			total += value.byteLength
			if (total > MAX_AVATAR_BYTES) {
				throw new Error(`avatar exceeds ${MAX_AVATAR_BYTES} bytes`)
			}
			chunks.push(value)
		}
	} finally {
		reader.releaseLock()
	}
	const bytes = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		bytes.set(chunk, offset)
		offset += chunk.byteLength
	}
	return bytes
}

async function fetchWithSafeRedirects(initialUrl) {
	let currentUrl = initialUrl
	const signal = AbortSignal.timeout(AVATAR_TIMEOUT_MS)
	for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
		const response = await fetch(currentUrl, {
			redirect: 'manual',
			signal,
		})
		if (![301, 302, 303, 307, 308].includes(response.status)) {
			return response
		}
		const location = response.headers.get('location')
		await response.body?.cancel()
		if (!location) throw new Error('avatar redirect is missing a location')
		const redirectUrl = normalizeRemoteImageUrl(
			new URL(location, currentUrl).href,
		)
		if (!redirectUrl) throw new Error('avatar redirect target is not allowed')
		currentUrl = redirectUrl
	}
	throw new Error('avatar request exceeded 3 redirects')
}

export async function fetchAvatarAsset(url, assetDir) {
	const safeUrl = normalizeRemoteImageUrl(url)
	if (!safeUrl) throw new Error('avatar URL is not an allowed public HTTPS URL')
	await fs.mkdir(assetDir, { recursive: true })
	const assetHash = sha256(safeUrl)
	for (const [contentType, extension] of Object.entries(AVATAR_EXTENSIONS)) {
		const cachedPath = path.join(assetDir, `${assetHash}.${extension}`)
		if (await pathExists(cachedPath)) {
			try {
				const bytes = await fs.readFile(cachedPath)
				if (bytes.byteLength > MAX_AVATAR_BYTES) continue
				validateImageBytes(bytes, contentType)
				return { assetPath: `avatars/${assetHash}.${extension}`, cached: true }
			} catch {
				continue
			}
		}
	}
	const response = await fetchWithSafeRedirects(safeUrl)
	if (!response.ok) {
		throw new Error(`avatar request failed with HTTP ${response.status}`)
	}
	const contentType = (response.headers.get('content-type') || '')
		.split(';', 1)[0]
		.trim()
		.toLowerCase()
	const extension = avatarExtension(contentType)
	if (!extension) {
		throw new Error(
			`unsupported avatar content type: ${contentType || 'unknown'}`,
		)
	}
	const bytes = await readResponseBytes(response)
	validateImageBytes(bytes, contentType)
	const fileName = `${assetHash}.${extension}`
	const outputPath = path.join(assetDir, fileName)
	await fs.writeFile(outputPath, bytes)
	return { assetPath: `avatars/${fileName}`, cached: false }
}
