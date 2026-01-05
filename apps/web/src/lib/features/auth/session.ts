import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '~/lib/infra/db'
import type { RequestContext, Session } from './types'

export const SESSION_COOKIE_NAME = 'vg_session'
const DEFAULT_SESSION_TTL_DAYS = 30

type DbClient = Awaited<ReturnType<typeof getDb>>

export function hashSessionToken(token: string) {
	return createHash('sha256').update(token).digest('hex')
}

function buildCookie(
	name: string,
	value: string,
	options: { maxAge?: number; expires?: Date; path?: string },
) {
	const parts = [`${name}=${value}`]
	const path = options.path ?? '/'
	parts.push(`Path=${path}`)
	parts.push('HttpOnly')
	parts.push('SameSite=Lax')
	if (options.maxAge !== undefined) {
		parts.push(`Max-Age=${options.maxAge}`)
	}
	if (options.expires) {
		parts.push(`Expires=${options.expires.toUTCString()}`)
	}
	if (process.env.NODE_ENV === 'production') {
		parts.push('Secure')
	}
	return parts.join('; ')
}

export function createSessionCookie(token: string, expiresAt: Date) {
	const maxAge = Math.max(
		0,
		Math.floor((expiresAt.getTime() - Date.now()) / 1000),
	)
	return buildCookie(SESSION_COOKIE_NAME, token, { maxAge, expires: expiresAt })
}

export function createClearSessionCookie() {
	return buildCookie(SESSION_COOKIE_NAME, '', {
		maxAge: 0,
		expires: new Date(0),
	})
}

export async function createSession(opts: {
	userId: string
	expiresInDays?: number
	db?: DbClient
}) {
	const db = opts.db ?? (await getDb())
	const token = randomBytes(32).toString('hex')
	const tokenHash = hashSessionToken(token)
	const expiresAt = new Date(
		Date.now() +
			(opts.expiresInDays ?? DEFAULT_SESSION_TTL_DAYS) * 24 * 60 * 60 * 1000,
	)

	const [session] = await db
		.insert(schema.sessions)
		.values({
			userId: opts.userId,
			tokenHash,
			expiresAt,
		})
		.returning()

	if (!session) {
		throw new Error('Failed to create session')
	}

	return { token, session }
}

export async function revokeSessionById(sessionId: string, db?: DbClient) {
	const client = db ?? (await getDb())
	await client
		.update(schema.sessions)
		.set({ revokedAt: new Date() })
		.where(eq(schema.sessions.id, sessionId))
}

export async function findSessionByToken(
	token: string,
	db?: DbClient,
): Promise<Session | null> {
	const client = db ?? (await getDb())
	const tokenHash = hashSessionToken(token)
	const record = await client.query.sessions.findFirst({
		where: eq(schema.sessions.tokenHash, tokenHash),
	})
	if (!record) {
		return null
	}
	const now = Date.now()
	if (record.revokedAt) return null
	if (record.expiresAt && record.expiresAt.getTime() < now) return null
	return record
}

export function pushResponseCookie(context: RequestContext, cookie: string) {
	context.responseCookies.push(cookie)
}
