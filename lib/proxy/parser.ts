import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'
import { logger } from '~/lib/logger'

export interface ParsedProxy {
	id: string
	name?: string
	server: string
	port: number
	protocol: 'http' | 'https' | 'socks4' | 'socks5'
	username?: string
	password?: string
}

// SSR URL scheme: ssr://server:port:protocol:method:obfs:base64(password)/?remarks=base64(remarks)&protoparam=...
const SSR_URL_REGEX = /^ssr:\/\/([^:]+):(\d+):([^:]+):([^:]+):([^:]+):([^/]+)\/\?(.*)$/

export async function parseSSRUrl(ssrUrl: string): Promise<ParsedProxy[]> {
	try {
		if (!ssrUrl.startsWith('ssr://')) {
			throw new Error('Invalid SSR URL format')
		}

		const match = ssrUrl.match(SSR_URL_REGEX)
		if (!match) {
			throw new Error('Failed to parse SSR URL')
		}

		const [, server, port, protocol, , , passwordBase64, params] = match
		
		// Decode password
		const password = Buffer.from(passwordBase64, 'base64').toString('utf-8')
		
		// Parse parameters
		const urlParams = new URLSearchParams(params)
		const remarksBase64 = urlParams.get('remarks')
		const remarks = remarksBase64 ? Buffer.from(remarksBase64, 'base64').toString('utf-8') : undefined

		// Map SSR protocol to standard proxy protocol
		const proxyProtocol = mapSSRProtocolToProxy(protocol)

		return [{
			id: createId(),
			name: remarks || `${server}:${port}`,
			server,
			port: parseInt(port, 10),
			protocol: proxyProtocol,
			password,
		}]
	} catch (error) {
		logger.error('proxy', `Error parsing SSR URL: ${error}`)
		throw new Error(`Failed to parse SSR URL: ${error instanceof Error ? error.message : 'Unknown error'}`)
	}
}

function mapSSRProtocolToProxy(ssrProtocol: string): ParsedProxy['protocol'] {
	switch (ssrProtocol) {
		case 'origin':
			return 'socks5'
		case 'auth_sha1_v4':
		case 'auth_aes128_md5':
		case 'auth_aes128_sha1':
			return 'socks5'
		default:
			return 'socks5'
	}
}



// For parsing subscription URLs that return multiple SSR configs
export async function parseSSRSubscription(subscriptionUrl: string): Promise<ParsedProxy[]> {
	try {
		const response = await fetch(subscriptionUrl)
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`)
		}

		const content = await response.text()
		const proxies: ParsedProxy[] = []
		
		// Split by lines and parse each SSR URL
		const lines = content.split('\n').filter(line => line.trim())

		for (const line of lines) {
			const trimmedLine = line.trim()
			if (!trimmedLine || !trimmedLine.startsWith('ssr://')) continue
			
			try {
				const parsedProxies = await parseSSRUrl(trimmedLine)
				proxies.push(...parsedProxies)
			} catch {
				// Continue parsing other URLs even if one fails
			}
		}

		return proxies
	} catch (error) {
		logger.error('proxy', `Error fetching SSR subscription: ${error}`)
		throw new Error(`Failed to fetch SSR subscription: ${error instanceof Error ? error.message : 'Unknown error'}`)
	}
}



// Validation schemas
export const SSRUrlSchema = z.string().url().startsWith('ssr://')

export const ProxyGroupSchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().max(500).optional(),
	ssrUrl: SSRUrlSchema.optional(),
})

export const ProxySchema = z.object({
	name: z.string().max(100).optional(),
	server: z.string().min(1).max(255),
	port: z.number().min(1).max(65535),
	protocol: z.enum(['http', 'https', 'socks4', 'socks5']),
	username: z.string().max(100).optional(),
	password: z.string().max(255).optional(),
})
