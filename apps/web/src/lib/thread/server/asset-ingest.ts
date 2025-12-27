import { and, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import { putObjectByKey } from '~/lib/cloudflare/storage'

const DEFAULT_MAX_ASSETS_PER_RUN = 5
const DEFAULT_FETCH_TIMEOUT_MS = 25_000
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024

function normalizeContentType(value: string | null): string | null {
	if (!value) return null
	const v = value.split(';')[0]?.trim() || null
	return v || null
}

function extForContentType(contentType: string | null): string {
	switch (contentType) {
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
		default:
			return ''
	}
}

async function readBodyWithLimit(
	res: Response,
	maxBytes: number,
): Promise<Uint8Array> {
	const reader = res.body?.getReader()
	if (!reader) return new Uint8Array()
	const chunks: Uint8Array[] = []
	let total = 0

	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		if (!value) continue
		total += value.byteLength
		if (total > maxBytes) {
			throw new Error(`asset too large: ${total} bytes (max ${maxBytes})`)
		}
		chunks.push(value)
	}

	const out = new Uint8Array(total)
	let offset = 0
	for (const c of chunks) {
		out.set(c, offset)
		offset += c.byteLength
	}
	return out
}

export async function ingestThreadAssets(opts?: {
	userId?: string
	assetIds?: string[]
	maxAssetsPerRun?: number
	fetchTimeoutMs?: number
	maxBytes?: number
}): Promise<{
	processed: number
	succeeded: number
	failed: number
}> {
	const maxAssetsPerRun = opts?.maxAssetsPerRun ?? DEFAULT_MAX_ASSETS_PER_RUN
	const fetchTimeoutMs = opts?.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
	const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES

	const db = await getDb()

	const conditions = [
		or(
			eq(schema.threadAssets.status, 'pending'),
			eq(schema.threadAssets.status, 'ready'),
		),
		isNull(schema.threadAssets.storageKey),
		isNotNull(schema.threadAssets.sourceUrl),
		opts?.userId ? eq(schema.threadAssets.userId, opts.userId) : null,
		opts?.assetIds?.length ? inArray(schema.threadAssets.id, opts.assetIds) : null,
	].filter(Boolean)

	const candidates = await db.query.threadAssets.findMany({
		where: and(...(conditions as any)),
		limit: maxAssetsPerRun,
		orderBy: (t, { asc }) => [asc(t.createdAt)],
	})

	let processed = 0
	let succeeded = 0
	let failed = 0

	for (const asset of candidates) {
		const url = asset.sourceUrl?.trim()
		if (!url) continue
		processed += 1

		try {
			const controller =
				typeof AbortController !== 'undefined' ? new AbortController() : null
			const timeout = setTimeout(() => controller?.abort(), fetchTimeoutMs)
			let res: Response
			try {
				res = await fetch(url, {
					headers: { 'user-agent': 'next-vid-genius-hub/threads-asset-ingest' },
					signal: controller?.signal,
					redirect: 'follow',
					cache: 'no-store',
				})
			} finally {
				clearTimeout(timeout)
			}

			if (!res.ok) {
				throw new Error(`fetch failed: ${res.status} ${await res.text()}`)
			}

			const contentType = normalizeContentType(res.headers.get('content-type'))
			const bytes = await readBodyWithLimit(res, maxBytes)
			const key = `thread-assets/${asset.id}${extForContentType(contentType)}`

			await putObjectByKey(key, contentType ?? 'application/octet-stream', bytes)

			await db
				.update(schema.threadAssets)
				.set({
					status: 'ready',
					storageKey: key,
					contentType: contentType ?? null,
					bytes: bytes.byteLength,
					updatedAt: new Date(),
				})
				.where(eq(schema.threadAssets.id, asset.id))

			succeeded += 1
		} catch (e) {
			failed += 1
			const msg = e instanceof Error ? e.message : String(e)
			logger.warn('api', `[thread-assets] ingest failed asset=${asset.id} ${msg}`)
			await db
				.update(schema.threadAssets)
				.set({ status: 'failed', updatedAt: new Date() })
				.where(eq(schema.threadAssets.id, asset.id))
		}
	}

	return { processed, succeeded, failed }
}

export async function runScheduledThreadAssetIngest(): Promise<void> {
	try {
		await ingestThreadAssets()
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e)
		logger.error('api', `[thread-assets] scheduled ingest failed ${msg}`)
	}
}
