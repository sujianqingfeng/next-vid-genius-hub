import { postSignedJson } from '@app/job-callbacks'
import { requireJobCallbackSecret, requireOrchestratorUrl } from './utils'

export async function presignGetByKey(key: string): Promise<string> {
	const base = requireOrchestratorUrl()
	const url = `${base.replace(/\/$/, '')}/debug/presign?key=${encodeURIComponent(key)}`
	const res = await fetch(url)
	if (!res.ok)
		throw new Error(`presignGetByKey failed: ${res.status} ${await res.text()}`)
	const body = (await res.json()) as { getUrl?: string }
	if (!body?.getUrl)
		throw new Error('presignGetByKey: missing getUrl in response')
	return body.getUrl
}

export async function remoteKeyExists(key: string): Promise<boolean> {
	try {
		const url = await presignGetByKey(key)
		const controller =
			typeof AbortController !== 'undefined' ? new AbortController() : null
		const timeout = setTimeout(() => controller?.abort(), 10_000)
		try {
			const res = await fetch(url, {
				method: 'GET',
				headers: { range: 'bytes=0-0' },
				signal: controller?.signal,
				cache: 'no-store',
			})
			try {
				if (res.ok || res.status === 206) return true
				if (res.status === 404) return false
				return false
			} finally {
				if (!res.bodyUsed) {
					try {
						await res.body?.cancel?.()
					} catch {}
				}
			}
		} finally {
			clearTimeout(timeout)
		}
	} catch {
		return false
	}
}

export async function deleteCloudArtifacts(input: {
	keys?: string[]
	artifactJobIds?: string[]
	prefixes?: string[]
}): Promise<void> {
	const base = requireOrchestratorUrl()
	const keys = (input.keys ?? []).filter(Boolean)
	const jobIds = (input.artifactJobIds ?? []).filter(Boolean)
	const prefixes = (input.prefixes ?? []).filter(Boolean)

	if (keys.length > 0) {
		const url = `${base.replace(/\/$/, '')}/debug/delete`
		const secret = requireJobCallbackSecret()
		const res = await postSignedJson(url, secret, { keys })
		if (!res.ok)
			throw new Error(
				`deleteCloudArtifacts: delete keys failed: ${res.status} ${await res.text()}`,
			)
	}

	for (const id of jobIds) {
		const url = `${base.replace(/\/$/, '')}/artifacts/${encodeURIComponent(id)}`
		const r = await fetch(url, { method: 'DELETE' })
		if (!r.ok && r.status !== 404) {
			throw new Error(
				`deleteCloudArtifacts: delete artifact ${id} failed: ${r.status} ${await r.text()}`,
			)
		}
	}

	if (prefixes.length > 0) {
		const url = `${base.replace(/\/$/, '')}/debug/delete-prefixes`
		const secret = requireJobCallbackSecret()
		const res = await postSignedJson(url, secret, { prefixes })
		if (!res.ok)
			throw new Error(
				`deleteCloudArtifacts: delete prefixes failed: ${res.status} ${await res.text()}`,
			)
	}
}

export async function presignPutAndGetByKey(
	key: string,
	contentType: string,
): Promise<{ putUrl: string; getUrl: string }> {
	const base = requireOrchestratorUrl()
	const url = `${base.replace(/\/$/, '')}/debug/presign?key=${encodeURIComponent(key)}&contentType=${encodeURIComponent(contentType)}`
	const res = await fetch(url)
	if (!res.ok)
		throw new Error(
			`presignPutAndGetByKey failed: ${res.status} ${await res.text()}`,
		)
	const body = (await res.json()) as { putUrl?: string; getUrl?: string }
	if (!body?.putUrl || !body?.getUrl)
		throw new Error('presignPutAndGetByKey: missing URLs in response')
	return { putUrl: body.putUrl, getUrl: body.getUrl }
}

export async function putObjectByKey(
	key: string,
	contentType: string,
	body: string | Uint8Array | Buffer,
): Promise<void> {
	const { putUrl } = await presignPutAndGetByKey(key, contentType)
	const payload: BodyInit =
		typeof body === 'string' ? body : (body as unknown as BodyInit)
	const init: RequestInit = {
		method: 'PUT',
		headers: {
			'content-type': contentType,
			'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
		},
		body: payload,
	}
	const res = await fetch(putUrl, init)
	if (!res.ok)
		throw new Error(`putObjectByKey failed: ${res.status} ${await res.text()}`)
}
