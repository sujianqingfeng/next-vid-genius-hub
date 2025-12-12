import type { Env } from '../types'
import { presignS3 } from '../storage/presign'
import { deleteObjectFromStorage, listKeysByPrefix } from '../storage/fallback'
import { json } from '../utils/http'
import { requireJobCallbackSecret, verifyHmac } from '../utils/hmac'

export async function handleDebugPresign(env: Env, req: Request): Promise<Response> {
	const url = new URL(req.url)
	const key = url.searchParams.get('key') || `debug/${Date.now()}.txt`
	const contentType = url.searchParams.get('contentType') || 'text/plain'
	try {
		const bucket = env.S3_BUCKET_NAME || 'vidgen-render'
		const putUrl = await presignS3(env, 'PUT', bucket, key, 600, contentType)
		const getUrl = await presignS3(env, 'GET', bucket, key, 600)
		return json({
			key,
			style: env.S3_STYLE || 'vhost',
			region: env.S3_REGION || 'us-east-1',
			endpoint: env.S3_ENDPOINT,
			putUrl,
			getUrl,
			curlPut: `curl -v -X PUT '${putUrl}' --data-binary 'hello'`,
		})
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 500 })
	}
}

export async function handleDebugDelete(env: Env, req: Request) {
	const raw = await req.text()
	const sig = req.headers.get('x-signature') || ''
	const secret = requireJobCallbackSecret(env)
	if (!(await verifyHmac(secret, raw, sig))) {
		return json({ error: 'unauthorized' }, { status: 401 })
	}

	let body: any
	try {
		body = JSON.parse(raw)
	} catch {
		return json({ error: 'invalid_json' }, { status: 400 })
	}

	const keys = Array.isArray(body?.keys)
		? body.keys.filter(
				(k: unknown): k is string =>
					typeof k === 'string' && k.trim().length > 0,
			)
		: []

	const deleted: string[] = []
	const errors: Record<string, string> = {}

	for (const key of keys) {
		try {
			await deleteObjectFromStorage(env, key)
			deleted.push(key)
		} catch (err) {
			errors[key] = err instanceof Error ? err.message : String(err)
		}
	}

	const hasErrors = Object.keys(errors).length > 0
	return json(
		{ ok: !hasErrors, deleted, errors },
		{ status: hasErrors ? 500 : 200 },
	)
}

export async function handleDebugDeletePrefixes(env: Env, req: Request) {
	const raw = await req.text()
	const sig = req.headers.get('x-signature') || ''
	const secret = requireJobCallbackSecret(env)
	if (!(await verifyHmac(secret, raw, sig))) {
		return json({ error: 'unauthorized' }, { status: 401 })
	}
	let body: any
	try {
		body = JSON.parse(raw)
	} catch {
		return json({ error: 'invalid_json' }, { status: 400 })
	}
	const prefixes: string[] = Array.isArray(body?.prefixes)
		? body.prefixes.filter(
				(p: unknown): p is string =>
					typeof p === 'string' && p.trim().length > 0,
			)
		: []
	if (prefixes.length === 0) return json({ ok: true, deleted: [] })
	const toDelete = new Set<string>()
	for (const p of prefixes) {
		try {
			const keys = await listKeysByPrefix(env, p)
			for (const k of keys) toDelete.add(k)
		} catch (err) {
			// Best-effort: continue other prefixes
			console.warn('[delete-prefixes] list failed for', p, err)
		}
	}
	const deleted: string[] = []
	const errors: Record<string, string> = {}
	for (const key of toDelete) {
		try {
			await deleteObjectFromStorage(env, key)
			deleted.push(key)
		} catch (err) {
			errors[key] = err instanceof Error ? err.message : String(err)
		}
	}
	const hasErrors = Object.keys(errors).length > 0
	return json(
		{ ok: !hasErrors, deleted, errors },
		{ status: hasErrors ? 500 : 200 },
	)
}

