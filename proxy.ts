import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// Workspace guard via Basic Auth only.
// Enable by setting `WORKSPACE_PROTECT=1` in your environment.
// Configure:
// - WORKSPACE_AUTH_USERNAME
// - WORKSPACE_AUTH_PASSWORD

const ALLOWLIST_PREFIXES = ['/api/render/cf-callback']

function decodeBase64(input: string): string {
	return atob(input)
}

export function proxy(req: NextRequest) {
	const enabled = process.env.WORKSPACE_PROTECT === '1'
	if (!enabled) return NextResponse.next()

	const url = req.nextUrl

	// Allow specific public callbacks (e.g., Cloudflare render webhook)
	if (ALLOWLIST_PREFIXES.some((p) => url.pathname.startsWith(p))) {
		return NextResponse.next()
	}

	// Basic Auth
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
			headers: { 'WWW-Authenticate': 'Basic realm="Workspace"' },
		})
	}

	// Protection is enabled but no valid method configured
	return new NextResponse('Forbidden', { status: 403 })
}

export const config = {
	matcher: ['/media/:path*', '/proxy/:path*', '/api/:path*'],
}
