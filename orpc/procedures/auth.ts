import { os } from '@orpc/server'
import { z } from 'zod'
import { loginUser, logoutUser, signupUser, toPublicUser } from '~/lib/auth/service'
import { pushResponseCookie } from '~/lib/auth/session'
import type { RequestContext } from '~/lib/auth/types'
import { getBalance } from '~/lib/points/service'

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
		const result = await signupUser(input)
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
		const result = await loginUser(input)
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
