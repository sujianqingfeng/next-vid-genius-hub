import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// Workspace guard via Basic Auth only.
// Enable by setting `WORKSPACE_PROTECT=1` in your environment.
// Configure:
// - WORKSPACE_AUTH_USERNAME
// - WORKSPACE_AUTH_PASSWORD

function decodeBase64(input: string): string {
	// Edge runtime has `atob`; Node fallback guards against build-time contexts.
	// @ts-ignore - atob exists in Edge/runtime
	if (typeof atob === 'function') {
		return atob(input)
	}
	// eslint-disable-next-line no-restricted-globals
	// @ts-ignore - Buffer is not available on Edge, but fallback only runs in Node
	return Buffer.from(input, 'base64').toString('utf-8')
}

const ALLOWLIST_PREFIXES = ['/api/render/cf-callback']

export function proxy(req: NextRequest) {
	const enabled = process.env.WORKSPACE_PROTECT === '1'
	if (!enabled) return NextResponse.next()

	const url = req.nextUrl

	// Allow specific public callbacks (e.g., Cloudflare render webhook)
	if (ALLOWLIST_PREFIXES.some((p) => url.pathname.startsWith(p))) {
		return NextResponse.next()
	}

	// Basic Auth fallback
	const user = process.env.WORKSPACE_AUTH_USERNAME
	const pass = process.env.WORKSPACE_AUTH_PASSWORD

	if (user && pass) {
		const header = req.headers.get('authorization')
		if (header) {
			const [scheme, encoded] = header.split(' ')
			if (scheme === 'Basic' && encoded) {
				const decoded = decodeBase64(encoded)
				const [givenUser, givenPass] = decoded.split(':')
				if (givenUser === user && givenPass === pass) {
					return NextResponse.next()
				}
			}
		}

		return new NextResponse('Authentication required', {
			status: 401,
			headers: { 'WWW-Authenticate': 'Basic realm=\"Workspace\"' },
		})
	}

	// Protection is enabled but no valid method configured
	return new NextResponse('Forbidden', { status: 403 })
}

// Apply only to workspace routes; leave marketing/home and assets open
export const config = {
	matcher: ['/media/:path*', '/proxy/:path*', '/api/:path*'],
}

