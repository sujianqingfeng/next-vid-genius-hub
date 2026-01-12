import type { Env } from '../types'
import { presignS3 } from './presign'

// --- S3 helpers ---
// Note: R2 对预签名 HEAD 的行为在某些场景下会返回 403，而同一对象的 GET 却是 200。
// 这里直接使用带 Range 的 GET 探测对象是否存在，避免误判 missing_inputs。
export type S3ProbeResult = {
	exists: boolean
	status: number | null
	url: string | null
	error: string | null
}

export async function s3Probe(
	env: Env,
	bucket: string,
	key: string,
): Promise<S3ProbeResult> {
	try {
		const url = await presignS3(env, 'GET', bucket, key, 60)
		const r = await fetch(url, {
			method: 'GET',
			headers: { range: 'bytes=0-0' },
		})
		try {
			if (!r.bodyUsed) {
				await r.body?.cancel?.()
			}
		} catch {}
		const exists = r.ok || r.status === 206
		return { exists, status: r.status, url: url.split('?')[0], error: null }
	} catch (err) {
		return {
			exists: false,
			status: null,
			url: null,
			error: err instanceof Error ? err.message : String(err),
		}
	}
}

export async function s3Head(env: Env, bucket: string, key: string): Promise<boolean> {
	const probe = await s3Probe(env, bucket, key)
	return probe.exists
}

export async function s3Put(
	env: Env,
	bucket: string,
	key: string,
	contentType: string,
	body: ReadableStream | string,
): Promise<void> {
	const url = await presignS3(env, 'PUT', bucket, key, 600, contentType)
	const headers: Record<string, string> = {
		'content-type': contentType,
		'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
	}
	const init: RequestInit = { method: 'PUT', headers }
	if (typeof body === 'string') {
		init.body = body
	} else {
		// Miniflare/wrangler 对 ReadableStream 直传可能存在兼容问题，这里转 ArrayBuffer 以提高兼容性
		try {
			init.body = await new Response(body).arrayBuffer()
		} catch {
			// 兜底转文本
			init.body = await new Response(body).text()
		}
	}
	const r = await fetch(url, init)
	if (!r.ok) {
		let msg = ''
		try {
			msg = await r.text()
		} catch {}
		console.error('[s3Put] PUT', url.split('?')[0], r.status, msg)
		throw new Error(`s3Put failed: ${r.status}`)
	}
}

export function getBucketName(env: Env): string {
	return env.S3_BUCKET_NAME || 'vidgen-render'
}

export async function s3Delete(env: Env, bucket: string, key: string): Promise<void> {
	const url = await presignS3(env, 'DELETE', bucket, key, 600)
	const r = await fetch(url, {
		method: 'DELETE',
		headers: { 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
	})
	if (!r.ok && r.status !== 404 && r.status !== 204) {
		let msg = ''
		try {
			msg = await r.text()
		} catch {}
		console.error('[s3Delete] DELETE', url.split('?')[0], r.status, msg)
		throw new Error(`s3Delete failed: ${r.status}`)
	}
}
