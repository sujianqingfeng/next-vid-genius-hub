import type { Env } from '../types'

export function requireJobCallbackSecret(env: Env): string {
	if (!env.JOB_CALLBACK_HMAC_SECRET) {
		throw new Error('JOB_CALLBACK_HMAC_SECRET is not configured')
	}
	return env.JOB_CALLBACK_HMAC_SECRET
}

export async function hmacHex(secret: string, data: string): Promise<string> {
	const enc = new TextEncoder()
	const key = await crypto.subtle.importKey(
		'raw',
		enc.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	)
	const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
	return [...new Uint8Array(sig)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

export async function verifyHmac(
	secret: string,
	data: string,
	signature: string,
): Promise<boolean> {
	const expected = await hmacHex(secret, data)
	if (expected.length !== signature.length) return false
	// timing-safe compare
	let ok = 0
	for (let i = 0; i < expected.length; i++) {
		ok |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
	}
	return ok === 0
}

