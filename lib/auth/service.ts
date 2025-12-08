import { createId } from '@paralleldrive/cuid2'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'
import type { User } from './types'
import { hashPassword, verifyPassword } from './password'
import {
	createClearSessionCookie,
	createSession,
	createSessionCookie,
	revokeSessionById,
} from './session'
import { addPoints, getBalance } from '~/lib/points/service'

const SIGNUP_BONUS_POINTS = 100

function normalizeEmail(email: string) {
	return email.trim().toLowerCase()
}

function normalizeNickname(nickname?: string | null) {
	const value = nickname?.trim()
	return value && value.length > 0 ? value : null
}

function toPublicUser(user: User) {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { passwordHash, ...rest } = user
	return rest
}

export async function signupUser(input: { email: string; password: string; nickname?: string | null }) {
	const email = normalizeEmail(input.email)
	const db = await getDb()

	const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) })
	if (existing) {
		throw new Error('EMAIL_EXISTS')
	}

	const passwordHash = await hashPassword(input.password)
	const now = new Date()

	let user: User | undefined

	try {
		const [inserted] = await db
			.insert(schema.users)
			.values({
				id: createId(),
				email,
				passwordHash,
				nickname: normalizeNickname(input.nickname),
				role: 'user',
				status: 'active',
				createdAt: now,
				updatedAt: now,
			})
			.returning()
		user = inserted
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		if (message.toLowerCase().includes('unique') || message.toLowerCase().includes('constraint')) {
			throw new Error('EMAIL_EXISTS')
		}
		throw error
	}

	if (!user) {
		throw new Error('Failed to create user')
	}

	let balance = 0
	if (SIGNUP_BONUS_POINTS > 0) {
		balance = await addPoints({
			userId: user.id,
			amount: SIGNUP_BONUS_POINTS,
			type: 'signup_bonus',
			remark: '注册奖励',
			db,
		})
	}

	const { token, session } = await createSession({ userId: user.id, db })

	const result = { user, session, token, balance }

	return {
		user: toPublicUser(result.user),
		session: result.session,
		token: result.token,
		balance: result.balance,
		cookie: createSessionCookie(result.token, result.session.expiresAt),
	}
}

export async function loginUser(input: { email: string; password: string }) {
	const email = normalizeEmail(input.email)
	const db = await getDb()
	const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) })
	if (!user) {
		throw new Error('INVALID_CREDENTIALS')
	}
	if (user.status === 'banned') {
		throw new Error('USER_BANNED')
	}

	const isValid = await verifyPassword(input.password, user.passwordHash)
	if (!isValid) {
		throw new Error('INVALID_CREDENTIALS')
	}

	const { token, session } = await createSession({ userId: user.id, db })
	const now = new Date()

	await db
		.update(schema.users)
		.set({ lastLoginAt: now, updatedAt: now })
		.where(eq(schema.users.id, user.id))

	const balance = await getBalance(user.id, db)

	return {
		user: toPublicUser(user),
		session,
		token,
		balance,
		cookie: createSessionCookie(token, session.expiresAt),
	}
}

export async function logoutUser(sessionId: string | null) {
	if (!sessionId) return
	await revokeSessionById(sessionId)
	return createClearSessionCookie()
}

export { toPublicUser }
