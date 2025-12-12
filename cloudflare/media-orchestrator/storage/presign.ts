import type { Env } from '../types'

export function containerS3Endpoint(endpoint?: string, override?: string): string | undefined {
	const base = override || endpoint
	if (!base) return undefined
	try {
		const url = new URL(base)
		const host = url.hostname.toLowerCase()
		if (host === '127.0.0.1' || host === 'localhost') {
			url.hostname = 'minio'
			return url.toString()
		}
		return base
	} catch {
		return base
	}
}

// ========= R2 S3 Pre-sign (SigV4) =========
export async function presignS3(
	env: Env,
	method: 'GET' | 'PUT' | 'HEAD' | 'DELETE',
	bucket: string,
	key: string | undefined,
	expiresSec: number,
	contentType?: string,
	endpointOverride?: string,
	extraQuery?: Record<string, string>,
): Promise<string> {
	const endpoint = endpointOverride || env.S3_ENDPOINT
	if (!endpoint || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
		throw new Error('S3 credentials not configured')
	}
	const endpointHost = endpoint.replace(/^https?:\/\//, '')
	const style = (env.S3_STYLE || 'vhost') as 'vhost' | 'path'
	const region = env.S3_REGION || 'auto'
	const host = style === 'vhost' ? `${bucket}.${endpointHost}` : endpointHost
	const now = new Date()
	const amzDate = now.toISOString().replace(/[:-]|\..*/g, '') + 'Z' // YYYYMMDDTHHMMSSZ
	const date = amzDate.slice(0, 8)
	const service = 's3'
	const algorithm = 'AWS4-HMAC-SHA256'
	const credential = `${env.S3_ACCESS_KEY_ID}/${date}/${region}/${service}/aws4_request`
	const headerEntries: Array<[string, string]> = [['host', host]]
	if (method === 'PUT') {
		if (contentType) headerEntries.push(['content-type', contentType])
		headerEntries.push(['x-amz-content-sha256', 'UNSIGNED-PAYLOAD'])
	} else if (method === 'DELETE') {
		headerEntries.push(['x-amz-content-sha256', 'UNSIGNED-PAYLOAD'])
	}
	headerEntries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
	const signedHeaders = headerEntries.map(([name]) => name).join(';') || 'host'
	const encodeKey = (value: string) =>
		encodeURIComponent(value).replace(/%2F/g, '/').replace(/%7E/g, '~')
	const canonicalUri = (() => {
		if (style === 'vhost') {
			if (!key) return '/'
			return `/${encodeKey(key)}`
		}
		if (!key) return `/${bucket}`
		return `/${bucket}/${encodeKey(key)}`
	})()
	const enc = (s: string) =>
		encodeURIComponent(s).replace(/[!*'()]/g, (c) =>
			`%${c.charCodeAt(0).toString(16).toUpperCase()}`,
		)
	const qpObj: Record<string, string> = {
		'X-Amz-Algorithm': algorithm,
		'X-Amz-Credential': credential,
		'X-Amz-Date': amzDate,
		'X-Amz-Expires': String(expiresSec),
		'X-Amz-SignedHeaders': signedHeaders,
	}
	// Merge any extra query params (e.g., list-type=2&prefix=... for ListObjectsV2)
	const allQuery: Record<string, string> = { ...qpObj, ...(extraQuery || {}) }
	const canonicalQuery = Object.keys(allQuery)
		.sort()
		.map((k) => `${enc(k)}=${enc(allQuery[k])}`)
		.join('&')
	const canonicalHeaders = headerEntries
		.map(([name, value]) => `${name}:${value}\n`)
		.join('')
	const payloadHash = 'UNSIGNED-PAYLOAD'
	const canonicalRequest = [
		method,
		canonicalUri,
		canonicalQuery,
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	].join('\n')
	const hash = await sha256Hex(canonicalRequest)
	const stringToSign = [
		algorithm,
		amzDate,
		`${date}/${region}/${service}/aws4_request`,
		hash,
	].join('\n')

	const signingKey = await getSigningKey(
		env.S3_SECRET_ACCESS_KEY!,
		date,
		region,
		service,
	)
	const signature = await hmacHexRaw(signingKey, stringToSign)
	const scheme = endpoint.startsWith('http://') ? 'http' : 'https'
	const url = `${scheme}://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
	return url
}

async function sha256Hex(data: string): Promise<string> {
	const enc = new TextEncoder()
	const digest = await crypto.subtle.digest('SHA-256', enc.encode(data))
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

async function hmacRaw(key: CryptoKey, data: string): Promise<ArrayBuffer> {
	const enc = new TextEncoder()
	return crypto.subtle.sign('HMAC', key, enc.encode(data))
}

async function importKey(raw: ArrayBuffer | ArrayBufferView) {
	return crypto.subtle.importKey(
		'raw',
		raw as unknown as BufferSource,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	)
}

async function hmacHexRaw(key: CryptoKey, data: string): Promise<string> {
	const sig = await hmacRaw(key, data)
	return [...new Uint8Array(sig)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

async function getSigningKey(
	secret: string,
	date: string,
	region: string,
	service: string,
): Promise<CryptoKey> {
	const enc = new TextEncoder()
	let kDate = await importKey(enc.encode('AWS4' + secret))
	kDate = await importKey(await hmacRaw(kDate, date))
	let kRegion = await importKey(await hmacRaw(kDate, region))
	let kService = await importKey(await hmacRaw(kRegion, service))
	let kSigning = await importKey(await hmacRaw(kService, 'aws4_request'))
	return kSigning
}
