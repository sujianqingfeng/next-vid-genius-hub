import { ORPCError, os } from '@orpc/server'
import { z } from 'zod'
import { loginUser, logoutUser, signupUser, toPublicUser } from '~/lib/auth/service'
import { pushResponseCookie } from '~/lib/auth/session'
import type { RequestContext } from '~/lib/auth/types'
import { getBalance } from '~/lib/points/service'

function throwAuthOrpcError(error: unknown): never {
	if (error instanceof ORPCError) throw error

	const code = error instanceof Error ? error.message : String(error)

	switch (code) {
		case 'INVALID_CREDENTIALS':
			throw new ORPCError('INVALID_CREDENTIALS', {
				status: 401,
				message: 'INVALID_CREDENTIALS',
				data: { reason: 'INVALID_CREDENTIALS' },
			})
		case 'USER_BANNED':
			throw new ORPCError('USER_BANNED', {
				status: 403,
				message: 'USER_BANNED',
				data: { reason: 'USER_BANNED' },
			})
		case 'EMAIL_EXISTS':
			throw new ORPCError('EMAIL_EXISTS', {
				status: 409,
				message: 'EMAIL_EXISTS',
				data: { reason: 'EMAIL_EXISTS' },
			})
		case 'UNAUTHORIZED':
			throw new ORPCError('UNAUTHORIZED', {
				status: 401,
				message: 'UNAUTHORIZED',
				data: { reason: 'UNAUTHORIZED' },
			})
		case 'FORBIDDEN':
			throw new ORPCError('FORBIDDEN', {
				status: 403,
				message: 'FORBIDDEN',
				data: { reason: 'FORBIDDEN' },
			})
		default:
			throw error instanceof Error ? error : new Error(code)
	}
}

const SignupSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
	nickname: z.string().min(1).optional(),
})

const LoginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
})

export const signup = os
	.input(SignupSchema)
	.handler(async ({ input, context }) => {
		const result = await signupUser(input).catch(throwAuthOrpcError)
		const ctx = context as RequestContext
		pushResponseCookie(ctx, result.cookie)
		return {
			user: result.user,
			balance: result.balance,
		}
	})

export const login = os
	.input(LoginSchema)
	.handler(async ({ input, context }) => {
		const result = await loginUser(input).catch(throwAuthOrpcError)
		const ctx = context as RequestContext
		pushResponseCookie(ctx, result.cookie)
		return {
			user: result.user,
			balance: result.balance,
		}
	})

export const logout = os.handler(async ({ context }) => {
	const ctx = context as RequestContext
	const clearCookie = await logoutUser(ctx.auth.session?.id ?? null)
	if (clearCookie) {
		pushResponseCookie(ctx, clearCookie)
	}
	return { success: true }
})

export const me = os.handler(async ({ context }) => {
	const ctx = context as RequestContext
	if (!ctx.auth.user) {
		return { user: null, balance: 0 }
	}
	const balance = await getBalance(ctx.auth.user.id)
	return {
		user: toPublicUser(ctx.auth.user),
		balance,
	}
})
