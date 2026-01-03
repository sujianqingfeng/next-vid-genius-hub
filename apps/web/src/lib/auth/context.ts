import { eq } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'
import {
	createClearSessionCookie,
	findSessionByToken,
	SESSION_COOKIE_NAME,
} from './session'
import type { AuthContext, RequestContext } from './types'

function parseCookies(header: string | null) {
	const result: Record<string, string> = {}
	if (!header) return result
	const parts = header.split(';')
	for (const part of parts) {
		const [rawKey, ...rest] = part.trim().split('=')
		if (!rawKey) continue
		const key = rawKey.trim()
		const value = rest.join('=').trim()
		result[key] = decodeURIComponent(value)
	}
	return result
}

export async function buildRequestContext(
	request: Request,
): Promise<RequestContext> {
	const cookieHeader = request.headers.get('cookie')
	const cookies = parseCookies(cookieHeader)
	const token = cookies[SESSION_COOKIE_NAME]

	let auth: AuthContext = { user: null, session: null }
	const responseCookies: string[] = []

	if (token) {
		try {
			const db = await getDb()
			const session = await findSessionByToken(token, db)
			if (session) {
				const user = await db.query.users.findFirst({
					where: eq(schema.users.id, session.userId),
				})
				if (user && user.status !== 'banned') {
					auth = { user, session }
				} else {
					responseCookies.push(createClearSessionCookie())
				}
			} else {
				responseCookies.push(createClearSessionCookie())
			}
		} catch (error) {
			// When the local D1 schema hasn't been migrated yet, stale cookies can
			// break all requests. Clear the cookie and continue as anonymous.
			if (isDbSchemaNotReadyError(error)) {
				responseCookies.push(createClearSessionCookie())
			} else if (isDbBindingMissingError(error)) {
				// In Vite dev / non-Worker runtimes, the Cloudflare D1 binding may not
				// be injected. Treat as anonymous so requests don't hard-fail.
			} else {
				throw error
			}
		}
	}

	return { auth, responseCookies }
}

function isDbSchemaNotReadyError(error: unknown) {
	const message = error instanceof Error ? error.message : String(error)
	if (message.includes('D1_SCHEMA_NOT_READY')) return true
	if (message.includes('no such table: sessions')) return true
	if (message.includes('no such table: users')) return true

	const cause =
		error instanceof Error ? (error as { cause?: unknown }).cause : undefined
	const causeMessage =
		cause instanceof Error ? cause.message : String(cause ?? '')
	if (causeMessage.includes('D1_SCHEMA_NOT_READY')) return true
	if (causeMessage.includes('no such table: sessions')) return true
	if (causeMessage.includes('no such table: users')) return true

	return false
}

function isDbBindingMissingError(error: unknown) {
	const message = error instanceof Error ? error.message : String(error)
	if (message.includes('D1_BINDING_MISSING')) return true

	const cause =
		error instanceof Error ? (error as { cause?: unknown }).cause : undefined
	const causeMessage =
		cause instanceof Error ? cause.message : String(cause ?? '')
	if (causeMessage.includes('D1_BINDING_MISSING')) return true

	return false
}
