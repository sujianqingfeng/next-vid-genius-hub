import {
	createHmac,
	randomUUID as _randomUUID,
	timingSafeEqual,
} from 'node:crypto'

export function signHmacSHA256(secret: string, payload: string): string {
	return createHmac('sha256', secret).update(payload).digest('hex')
}

export function verifyHmacSHA256(
	secret: string,
	payload: string,
	signature?: string,
): boolean {
	try {
		const expected = signHmacSHA256(secret, payload)
		const a = Buffer.from(expected, 'hex')
		const b = Buffer.from(signature || '', 'hex')
		if (a.length !== b.length) return false
		return timingSafeEqual(a, b)
	} catch {
		return false
	}
}

function defaultNonce(): string {
	try {
		return _randomUUID && typeof _randomUUID === 'function'
			? _randomUUID()
			: `${Math.random().toString(36).slice(2)}${Math.random()
					.toString(36)
					.slice(2)}`
	} catch {
		return `${Math.random().toString(36).slice(2)}${Math.random()
			.toString(36)
			.slice(2)}`
	}
}

type FetchImpl = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>

type LoggerLike = {
	error?: (...args: unknown[]) => void
}

export type StatusCallback = (
	status: string,
	extra?: Record<string, unknown>,
) => Promise<void>

export type StatusCallbackOptions = {
	callbackUrl?: string
	secret?: string
	fetchImpl?: FetchImpl
	logger?: LoggerLike
	maxAttempts?: number
	backoffMs?: number
	baseFields?: Record<string, unknown>
}

/**
 * Create a status callback poster bound to a URL and secret.
 * Adds { jobId?, status, ts, nonce, ...extra } and signs payload via x-signature.
 */
export function makeStatusCallback({
	callbackUrl,
	secret,
	fetchImpl,
	logger = console,
	maxAttempts = 3,
	backoffMs = 300,
	baseFields = {},
}: StatusCallbackOptions = {}): StatusCallback {
	const post: StatusCallback = async (status, extra = {}) => {
		if (!callbackUrl) return

		const body = {
			status,
			ts: Date.now(),
			nonce: defaultNonce(),
			...baseFields,
			...extra,
		}
		const payload = JSON.stringify(body)
		if (!secret) throw new Error('makeStatusCallback: secret is required')

		const signature = signHmacSHA256(secret, payload)
		const headers = {
			'content-type': 'application/json',
			'x-signature': signature,
		}

		const f: FetchImpl | undefined =
			fetchImpl ??
			(globalThis.fetch
				? (globalThis.fetch.bind(globalThis) as FetchImpl)
				: undefined)
		if (!f) return

		let attempt = 0

		while (true) {
			attempt += 1
			try {
				const r = await f(callbackUrl, {
					method: 'POST',
					headers,
					body: payload,
				})
				if (!r.ok) {
					let msg = ''
					try {
						// Clone before reading so callers can still read the body later.
						msg = await r.clone().text()
					} catch {}
					logger?.error?.('[job-callbacks] callback non-2xx', r.status, msg)
				}
				return
			} catch (e) {
				const err = e as { message?: string }
				logger?.error?.(
					'[job-callbacks] callback error',
					err?.message || String(e),
				)
				if (attempt >= maxAttempts) return
				await new Promise((res) => setTimeout(res, backoffMs * attempt))
			}
		}
	}
	return post
}

/**
 * Low-level signed JSON POST helper.
 */
export async function postSignedJson(
	url: string,
	secret: string,
	body: unknown,
	{
		fetchImpl,
		headers = {},
		logger = console,
	}: {
		fetchImpl?: FetchImpl
		headers?: Record<string, string>
		logger?: LoggerLike
	} = {},
): Promise<Response> {
	const payload = JSON.stringify(body)
	if (!secret) throw new Error('postSignedJson: secret is required')

	const signature = signHmacSHA256(secret, payload)
	const f: FetchImpl | undefined =
		fetchImpl ??
		(globalThis.fetch
			? (globalThis.fetch.bind(globalThis) as FetchImpl)
			: undefined)
	if (!f) throw new Error('No fetch implementation available')

	const r = await f(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-signature': signature,
			...headers,
		},
		body: payload,
	})

	if (!r.ok) {
		let msg = ''
		try {
			// Clone before reading so callers can still read the body later.
			msg = await r.clone().text()
		} catch {}
		logger?.error?.('[job-callbacks] postSignedJson non-2xx', r.status, msg)
	}
	return r
}

export function buildSignedBody(
	secret: string,
	body: Record<string, unknown>,
): { payload: string; signature: string; ts: number } {
	const ts = Date.now()
	const payload = JSON.stringify({ ...body, ts })
	if (!secret) throw new Error('buildSignedBody: secret is required')
	const signature = signHmacSHA256(secret, payload)
	return { payload, signature, ts }
}
