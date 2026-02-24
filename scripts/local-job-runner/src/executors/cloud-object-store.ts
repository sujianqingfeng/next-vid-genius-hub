import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { LocalObjectStorePort } from '../contracts'

type CloudObjectStoreOptions = {
	baseUrl: string
	keyPrefix?: string
}

type PresignPayload = {
	key?: string
	putUrl?: string
	getUrl?: string
	error?: string
}

function normalizeBaseUrl(value: string): string {
	const base = String(value || '').trim().replace(/\/+$/, '')
	if (!/^https?:\/\//i.test(base)) {
		throw new Error('Upload base URL must start with http:// or https://')
	}
	return base
}

function normalizeKey(value: string): string {
	const key = String(value || '').trim().replace(/^\/+/, '')
	if (!key) throw new Error('Object key is required')
	return key
}

function resolveObjectKey(prefix: string | undefined, key: string): string {
	const normalizedKey = normalizeKey(key)
	const normalizedPrefix = String(prefix || '')
		.trim()
		.replace(/^\/+|\/+$/g, '')
	if (!normalizedPrefix) return normalizedKey
	if (
		normalizedKey === normalizedPrefix ||
		normalizedKey.startsWith(`${normalizedPrefix}/`)
	) {
		return normalizedKey
	}
	return `${normalizedPrefix}/${normalizedKey}`
}

async function requestPresign(
	baseUrl: string,
	key: string,
	contentType?: string,
): Promise<PresignPayload> {
	const url = new URL(`${baseUrl}/debug/presign`)
	url.searchParams.set('key', key)
	if (contentType && String(contentType).trim()) {
		url.searchParams.set('contentType', String(contentType).trim())
	}

	const res = await fetch(url.toString(), { method: 'GET', cache: 'no-store' })
	if (!res.ok) {
		throw new Error(`presign failed: ${res.status} ${await res.text()}`)
	}
	const payload = (await res.json()) as PresignPayload
	if (!payload?.putUrl || !payload?.getUrl) {
		throw new Error('presign response missing putUrl/getUrl')
	}
	return payload
}

async function putToPresignedUrl(input: {
	putUrl: string
	contentType: string
	body: Uint8Array
}): Promise<void> {
	const res = await fetch(input.putUrl, {
		method: 'PUT',
		headers: {
			'content-type': input.contentType,
			'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
		},
		body: input.body,
	})
	if (!res.ok) {
		throw new Error(`upload failed: ${res.status} ${await res.text()}`)
	}
}

export function createCloudObjectStorePort(
	options: CloudObjectStoreOptions,
): LocalObjectStorePort {
	const baseUrl = normalizeBaseUrl(options.baseUrl)
	const keyPrefix = options.keyPrefix
	const presignedGetUrlByKey = new Map<string, string>()

	async function putBytes(
		key: string,
		data: Uint8Array,
		contentType: string,
	): Promise<string> {
		const objectKey = resolveObjectKey(keyPrefix, key)
		const presigned = await requestPresign(baseUrl, objectKey, contentType)
		await putToPresignedUrl({
			putUrl: presigned.putUrl!,
			contentType,
			body: data,
		})
		const resolvedKey = normalizeKey(presigned.key || objectKey)
		if (presigned.getUrl) {
			presignedGetUrlByKey.set(resolvedKey, presigned.getUrl)
		}
		return resolvedKey
	}

	return {
		async putFile(key, localPath, contentType) {
			const filePath = path.resolve(localPath)
			const data = await fs.readFile(filePath)
			return putBytes(key, data, contentType || 'application/octet-stream')
		},
		async putText(key, text, contentType) {
			const data = Buffer.from(String(text ?? ''), 'utf8')
			return putBytes(key, data, contentType || 'text/plain; charset=utf-8')
		},
		async getUrl(key) {
			const objectKey = resolveObjectKey(keyPrefix, key)
			const cached = presignedGetUrlByKey.get(objectKey)
			if (cached) return cached
			const presigned = await requestPresign(baseUrl, objectKey)
			if (presigned.getUrl) {
				presignedGetUrlByKey.set(objectKey, presigned.getUrl)
				return presigned.getUrl
			}
			return undefined
		},
	}
}
