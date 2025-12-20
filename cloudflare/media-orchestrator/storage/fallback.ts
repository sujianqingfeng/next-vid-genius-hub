import type { Env } from '../types'
import { presignS3 } from './presign'
import { getBucketName, s3Delete, s3Head, s3Put } from './s3'

function json(data: unknown, init?: ResponseInit) {
	return new Response(JSON.stringify(data), {
		headers: { 'content-type': 'application/json' },
		...init,
	})
}

function preferS3Only(env: Env): boolean {
	return env.FORCE_S3_STORAGE === 'true'
}

// Try R2 绑定优先；本地 dev 下若 R2 只是 Miniflare 模拟，则回退到远端 R2（S3）。
export async function readObjectTextWithFallback(
	env: Env,
	key: string,
): Promise<string | null> {
	if (env.RENDER_BUCKET && !preferS3Only(env)) {
		try {
			const obj = await env.RENDER_BUCKET.get(key)
			if (obj) return await obj.text()
		} catch (e) {
			console.warn('[storage] R2 get failed, falling back to S3', e)
		}
	}
	try {
		const bucket = getBucketName(env)
		const url = await presignS3(env, 'GET', bucket, key, 600)
		const r = await fetch(url)
		if (!r.ok) {
			if (r.status === 404) return null
			console.warn('[storage] S3 GET failed', { key, status: r.status })
			return null
		}
		return await r.text()
	} catch (e) {
		console.warn('[storage] S3 GET error', e)
		return null
	}
}

export async function readObjectArrayBufferWithFallback(
	env: Env,
	key: string,
): Promise<ArrayBuffer | null> {
	if (env.RENDER_BUCKET && !preferS3Only(env)) {
		try {
			const obj = await env.RENDER_BUCKET.get(key)
			if (obj) return await obj.arrayBuffer()
		} catch (e) {
			console.warn('[storage] R2 get(arrayBuffer) failed, falling back to S3', e)
		}
	}
	try {
		const bucket = getBucketName(env)
		const url = await presignS3(env, 'GET', bucket, key, 600)
		const r = await fetch(url)
		if (!r.ok) {
			if (r.status === 404) return null
			console.warn('[storage] S3 GET(arrayBuffer) failed', { key, status: r.status })
			return null
		}
		return await r.arrayBuffer()
	} catch (e) {
		console.warn('[storage] S3 GET(arrayBuffer) error', e)
		return null
	}
}

export async function objectExistsWithFallback(
	env: Env,
	key: string,
): Promise<boolean> {
	if (env.RENDER_BUCKET && !preferS3Only(env)) {
		try {
			const head = await env.RENDER_BUCKET.head(key)
			if (head) return true
		} catch (e) {
			console.warn('[storage] R2 head failed, falling back to S3', e)
		}
	}
	const bucket = getBucketName(env)
	return s3Head(env, bucket, key)
}

export async function copyObjectWithFallback(
	env: Env,
	sourceKey: string,
	targetKey: string,
	contentType: string,
): Promise<void> {
	if (env.RENDER_BUCKET && !preferS3Only(env)) {
		try {
			const obj = await env.RENDER_BUCKET.get(sourceKey)
			if (obj) {
				await env.RENDER_BUCKET.put(targetKey, obj.body as ReadableStream, {
					httpMetadata: { contentType },
				})
				return
			}
			console.warn('[storage] R2 copy: source not found, falling back to S3', {
				sourceKey,
			})
		} catch (e) {
			console.warn('[storage] R2 copy failed, falling back to S3', e)
		}
	}
	const bucket = getBucketName(env)
	const url = await presignS3(env, 'GET', bucket, sourceKey, 600)
	const r = await fetch(url)
	if (!r.ok) {
		let msg = ''
		try {
			msg = await r.text()
		} catch {}
		throw new Error(
			`copyObjectWithFallback: source GET failed: ${r.status} ${msg}`,
		)
	}
	await s3Put(env, bucket, targetKey, contentType, r.body as ReadableStream)
}

export async function putObjectStreamToStorage(
	env: Env,
	key: string,
	contentType: string,
	body: ReadableStream | string,
): Promise<void> {
	const bucket = getBucketName(env)
	await s3Put(env, bucket, key, contentType, body)
}

export async function deleteObjectFromStorage(
	env: Env,
	key: string,
): Promise<void> {
	if (!key) return
	const bucket = getBucketName(env)
	let r2Error: Error | null = null
	if (env.RENDER_BUCKET && !preferS3Only(env)) {
		try {
			await env.RENDER_BUCKET.delete(key)
		} catch (e) {
			r2Error = e instanceof Error ? e : new Error(String(e))
		}
	}
	try {
		await s3Delete(env, bucket, key)
	} catch (e) {
		if (r2Error) throw r2Error
		throw e instanceof Error ? e : new Error(String(e))
	}
}

// List keys under a prefix using R2 binding
export async function listKeysByPrefix(
	env: Env,
	prefix: string,
): Promise<string[]> {
	const out: string[] = []
	if (env.RENDER_BUCKET && !preferS3Only(env)) {
		let cursor: string | undefined
		// Cloudflare R2 list supports pagination via cursor
		while (true) {
			const resp = await env.RENDER_BUCKET.list({ prefix, cursor, limit: 1000 })
			for (const obj of resp.objects) {
				if (obj.key) out.push(obj.key)
			}
			if (!resp.truncated || !resp.cursor) break
			cursor = resp.cursor
		}
		return out
	}

	// Fallback to S3 ListObjectsV2 so local dev can operate solely on remote R2 (S3-compatible).
	const bucket = getBucketName(env)
	const decodeXml = (value: string) =>
		value
			.replaceAll('&amp;', '&')
			.replaceAll('&lt;', '<')
			.replaceAll('&gt;', '>')
			.replaceAll('&quot;', '"')
			.replaceAll('&apos;', "'")
	const parseKeys = (xml: string): string[] => {
		const keys: string[] = []
		const re = /<Key>([^<]+)<\/Key>/g
		let m: RegExpExecArray | null
		while ((m = re.exec(xml))) {
			keys.push(decodeXml(m[1]))
		}
		return keys
	}
	const isTruncated = (xml: string): boolean =>
		/<IsTruncated>\s*true\s*<\/IsTruncated>/.test(xml)
	const nextToken = (xml: string): string | null => {
		const m = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)
		return m ? decodeXml(m[1]) : null
	}

	let token: string | null = null
	while (true) {
		const extraQuery: Record<string, string> = {
			'list-type': '2',
			prefix,
			'max-keys': '1000',
		}
		if (token) extraQuery['continuation-token'] = token
		const url = await presignS3(env, 'GET', bucket, undefined, 600, undefined, undefined, extraQuery)
		const r = await fetch(url)
		if (!r.ok) {
			const msg = await r.text().catch(() => '')
			throw new Error(`listKeysByPrefix(S3) failed: ${r.status} ${msg}`)
		}
		const xml = await r.text()
		out.push(...parseKeys(xml))
		if (!isTruncated(xml)) break
		token = nextToken(xml)
		if (!token) break
	}
	return out
}

export async function streamObjectFromS3(
	env: Env,
	key: string,
	range: string | null,
): Promise<Response> {
	const bucket = getBucketName(env)
	const url = await presignS3(env, 'GET', bucket, key, 600)
	const headers: Record<string, string> = {}
	if (range) headers.range = range
	const r = await fetch(url, { method: 'GET', headers })
	if (!r.ok && r.status !== 206) {
		if (r.status === 404) return new Response('not found', { status: 404 })
		let msg = ''
		try {
			msg = await r.text()
		} catch {}
		console.error('[artifacts] S3 GET failed', { key, status: r.status, msg })
		return json(
			{ error: 'storage_read_failed', status: r.status },
			{ status: 502 },
		)
	}
	const h = new Headers()
	const ct = r.headers.get('content-type') || 'video/mp4'
	h.set('content-type', ct)
	const ar = r.headers.get('accept-ranges') || 'bytes'
	h.set('accept-ranges', ar)
	const cl = r.headers.get('content-length')
	if (cl) h.set('content-length', cl)
	const cr = r.headers.get('content-range')
	if (cr) h.set('content-range', cr)
	return new Response(r.body, { status: r.status, headers: h })
}
