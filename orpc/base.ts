import { os as rawOs } from '@orpc/server'
import type { RequestContext } from '~/lib/auth/types'

// Re-export the base builder so existing usage (`os.router`, `os.input` etc.) still works.
export const os = rawOs

/**
 * Common authentication middleware.
 *
 * - Assumes `RequestContext` is already built in `app/api/orpc/[...slug]/route.ts`
 * - Throws `UNAUTHORIZED` when there is no logged-in user
 */
export const requireAuth = os.middleware(async ({ context, next }) => {
	const ctx = context as RequestContext
	if (!ctx.auth?.user) {
		// Keep the same error shape as existing handlers for compatibility
		throw new Error('UNAUTHORIZED')
	}

	return next({ context })
})

/**
 * Convenience builder for "authenticated" routers/procedures.
 *
 * Usage:
 *   export const appRouter = os.router({
 *     auth,                        // public routes
 *     media: authed.router(media), // all media.* require login
 *   })
 */
export const authed = os.use(requireAuth)

/**
 * Admin-only middleware.
 *
 * - Requires a logged-in user
 * - Additionally checks `user.role === 'admin'`
 * - Throws:
 *   - `UNAUTHORIZED` when there is no logged-in user
 *   - `FORBIDDEN` when the user is not an admin
 */
export const requireAdmin = os.middleware(async ({ context, next }) => {
	const ctx = context as RequestContext
	const user = ctx.auth?.user

	if (!user) {
		throw new Error('UNAUTHORIZED')
	}

	if (user.role !== 'admin') {
		throw new Error('FORBIDDEN')
	}

	return next({ context })
})

/**
 * Convenience builder for "admin-only" routers/procedures.
 *
 * Usage:
 *   export const appRouter = os.router({
 *     admin: adminOnly.router(admin),
 *   })
 */
export const adminOnly = os.use(requireAdmin)
