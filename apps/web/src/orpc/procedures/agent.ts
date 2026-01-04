import { ORPCError, os } from '@orpc/server'
import { z } from 'zod'

import type { RequestContext } from '~/lib/auth/types'
import type { UIMessage } from 'ai'
import {
	createAgentChatSession,
	deleteAgentChatSession,
	getAgentChatSessionWithMessages,
	listAgentChatSessions,
	renameAgentChatSession,
	saveAgentChatSessionMessages,
	setAgentChatSessionModel,
} from '~/lib/ai/server/agent-chat-storage'

const SessionIdSchema = z.string().trim().min(1)

export const listSessions = os
	.input(
		z.object({
			limit: z.number().int().min(1).max(200).optional().default(50),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const items = await listAgentChatSessions({ userId, limit: input.limit })
		return { items }
	})

export const createSession = os
	.input(
		z.object({
			title: z.string().trim().min(1).max(120).optional(),
			modelId: z.string().trim().min(1).nullable().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const session = await createAgentChatSession({
			userId,
			title: input.title,
			modelId: input.modelId ?? null,
		})
		return { session }
	})

export const renameSession = os
	.input(
		z.object({
			sessionId: SessionIdSchema,
			title: z.string().trim().min(1).max(120),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const session = await renameAgentChatSession({
			userId,
			sessionId: input.sessionId,
			title: input.title,
		})
		if (!session) {
			throw new ORPCError('NOT_FOUND', {
				status: 404,
				message: 'SESSION_NOT_FOUND',
			})
		}
		return { session }
	})

export const setSessionModel = os
	.input(
		z.object({
			sessionId: SessionIdSchema,
			modelId: z.string().trim().min(1).nullable(),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const session = await setAgentChatSessionModel({
			userId,
			sessionId: input.sessionId,
			modelId: input.modelId,
		})
		if (!session) {
			throw new ORPCError('NOT_FOUND', {
				status: 404,
				message: 'SESSION_NOT_FOUND',
			})
		}
		return { session }
	})

export const deleteSession = os
	.input(z.object({ sessionId: SessionIdSchema }))
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		await deleteAgentChatSession({ userId, sessionId: input.sessionId })
		return { ok: true }
	})

export const getSession = os
	.input(z.object({ sessionId: SessionIdSchema }))
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const res = await getAgentChatSessionWithMessages({
			userId,
			sessionId: input.sessionId,
		})
		if (!res.session) {
			throw new ORPCError('NOT_FOUND', {
				status: 404,
				message: 'SESSION_NOT_FOUND',
			})
		}
		return res
	})

export const syncMessages = os
	.input(
		z.object({
			sessionId: SessionIdSchema,
			messages: z.array(z.unknown()).max(400),
			modelId: z.string().trim().min(1).nullable().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		try {
			await saveAgentChatSessionMessages({
				userId,
				sessionId: input.sessionId,
				messages: input.messages as UIMessage[],
				modelId: input.modelId,
			})
			return { ok: true }
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			if (message === 'SESSION_NOT_FOUND') {
				throw new ORPCError('NOT_FOUND', {
					status: 404,
					message: 'SESSION_NOT_FOUND',
				})
			}
			throw err
		}
	})
