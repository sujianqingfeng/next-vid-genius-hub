'use server'

import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import type { UIMessage } from 'ai'

import {
	getDb,
	getInjectedD1DatabaseBinding,
	hasInjectedD1DatabaseBinding,
	schema,
} from '~/lib/infra/db'
import { createId } from '~/lib/shared/utils/id'

export type AgentChatSessionRow = typeof schema.agentChatSessions.$inferSelect

function toSqlTimestampSeconds(value: Date): number {
	return Math.trunc(value.getTime() / 1000)
}

async function runD1BatchOrFallback(d1: any, statements: any[]) {
	if (typeof d1.batch === 'function') {
		await d1.batch(statements)
		return
	}
	for (const stmt of statements) {
		await stmt.run()
	}
}

function toDate(value: unknown): Date | null {
	if (!value) return null
	if (value instanceof Date) return value
	if (typeof value === 'number') {
		const d = new Date(value)
		return Number.isFinite(d.valueOf()) ? d : null
	}
	if (typeof value === 'string') {
		const d = new Date(value)
		return Number.isFinite(d.valueOf()) ? d : null
	}
	return null
}

function getFirstUserText(messages: UIMessage[]): string | null {
	for (const m of messages) {
		if (m.role !== 'user') continue
		const text = (m.parts ?? [])
			.filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
			.map((p: any) => p.text)
			.join('')
			.trim()
		if (text) return text
	}
	return null
}

function deriveTitle(messages: UIMessage[]): string | null {
	const text = getFirstUserText(messages)
	if (!text) return null
	return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

export async function listAgentChatSessions(input: {
	userId: string
	limit: number
}) {
	const db = await getDb()
	const items = await db.query.agentChatSessions.findMany({
		where: and(
			eq(schema.agentChatSessions.userId, input.userId),
			isNull(schema.agentChatSessions.deletedAt),
		),
		orderBy: [
			desc(schema.agentChatSessions.lastMessageAt),
			desc(schema.agentChatSessions.updatedAt),
		],
		limit: input.limit,
	})
	return items
}

export async function createAgentChatSession(input: {
	userId: string
	title?: string
	modelId?: string | null
	sessionId?: string
}) {
	const db = await getDb()
	const id = input.sessionId?.trim() ? input.sessionId.trim() : createId()
	const now = new Date()
	await db
		.insert(schema.agentChatSessions)
		.values({
			id,
			userId: input.userId,
			title: input.title?.trim() || 'New chat',
			modelId: input.modelId ?? null,
			createdAt: now,
			updatedAt: now,
			lastMessageAt: null,
			deletedAt: null,
		})
		.onConflictDoNothing()
	const row = await db.query.agentChatSessions.findFirst({
		where: and(
			eq(schema.agentChatSessions.id, id),
			eq(schema.agentChatSessions.userId, input.userId),
		),
	})
	if (!row) throw new Error('Failed to create chat session')
	return row
}

export async function renameAgentChatSession(input: {
	userId: string
	sessionId: string
	title: string
}) {
	const db = await getDb()
	const now = new Date()
	await db
		.update(schema.agentChatSessions)
		.set({ title: input.title.trim(), updatedAt: now })
		.where(
			and(
				eq(schema.agentChatSessions.id, input.sessionId),
				eq(schema.agentChatSessions.userId, input.userId),
				isNull(schema.agentChatSessions.deletedAt),
			),
		)
	return await getAgentChatSession({
		userId: input.userId,
		sessionId: input.sessionId,
	})
}

export async function setAgentChatSessionModel(input: {
	userId: string
	sessionId: string
	modelId: string | null
}) {
	const db = await getDb()
	const now = new Date()
	await db
		.update(schema.agentChatSessions)
		.set({ modelId: input.modelId, updatedAt: now })
		.where(
			and(
				eq(schema.agentChatSessions.id, input.sessionId),
				eq(schema.agentChatSessions.userId, input.userId),
				isNull(schema.agentChatSessions.deletedAt),
			),
		)
	return await getAgentChatSession({
		userId: input.userId,
		sessionId: input.sessionId,
	})
}

export async function deleteAgentChatSession(input: {
	userId: string
	sessionId: string
}) {
	const now = new Date()

	if (hasInjectedD1DatabaseBinding()) {
		const d1 = getInjectedD1DatabaseBinding()
		if (!d1) throw new Error('D1_BINDING_MISSING')

		const nowTs = toSqlTimestampSeconds(now)
		const statements = [
			d1
				.prepare(
					[
						`UPDATE agent_chat_sessions`,
						`SET deleted_at = ?, updated_at = ?`,
						`WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
					].join(' '),
				)
				.bind(nowTs, nowTs, input.sessionId, input.userId),
			d1
				.prepare(
					`DELETE FROM agent_chat_messages WHERE session_id = ? AND user_id = ?`,
				)
				.bind(input.sessionId, input.userId),
		]

		await runD1BatchOrFallback(d1, statements)
		return
	}

	const db = await getDb()
	await db.transaction(async (tx) => {
		await tx
			.update(schema.agentChatSessions)
			.set({ deletedAt: now, updatedAt: now })
			.where(
				and(
					eq(schema.agentChatSessions.id, input.sessionId),
					eq(schema.agentChatSessions.userId, input.userId),
					isNull(schema.agentChatSessions.deletedAt),
				),
			)
		await tx
			.delete(schema.agentChatMessages)
			.where(
				and(
					eq(schema.agentChatMessages.sessionId, input.sessionId),
					eq(schema.agentChatMessages.userId, input.userId),
				),
			)
	})
}

export async function getAgentChatSession(input: {
	userId: string
	sessionId: string
}) {
	const db = await getDb()
	return (
		(await db.query.agentChatSessions.findFirst({
			where: and(
				eq(schema.agentChatSessions.id, input.sessionId),
				eq(schema.agentChatSessions.userId, input.userId),
				isNull(schema.agentChatSessions.deletedAt),
			),
		})) ?? null
	)
}

export async function getAgentChatSessionWithMessages(input: {
	userId: string
	sessionId: string
}) {
	const db = await getDb()
	const session = await getAgentChatSession(input)
	if (!session) return { session: null, messages: [] as UIMessage[] }

	const rows = await db.query.agentChatMessages.findMany({
		where: and(
			eq(schema.agentChatMessages.sessionId, input.sessionId),
			eq(schema.agentChatMessages.userId, input.userId),
		),
		orderBy: [asc(schema.agentChatMessages.seq)],
	})

	const messages = rows
		.map((r) => r.message)
		.filter(Boolean) as unknown as UIMessage[]

	return { session, messages }
}

export async function saveAgentChatSessionMessages(input: {
	userId: string
	sessionId: string
	messages: UIMessage[]
	modelId?: string | null
}) {
	const session = await getAgentChatSession({
		userId: input.userId,
		sessionId: input.sessionId,
	})
	if (!session) throw new Error('SESSION_NOT_FOUND')

	const now = new Date()
	const titleFromMessages = deriveTitle(input.messages)

	const shouldUpdateTitle =
		typeof titleFromMessages === 'string' &&
		titleFromMessages.trim().length > 0 &&
		(session.title.trim() === '' || session.title === 'New chat')

	const lastCreatedAt =
		input.messages.length > 0
			? (toDate(
					(input.messages[input.messages.length - 1] as any)?.createdAt,
				) ?? now)
			: now

	if (hasInjectedD1DatabaseBinding()) {
		const d1 = getInjectedD1DatabaseBinding()
		if (!d1) throw new Error('D1_BINDING_MISSING')

		const nowTs = toSqlTimestampSeconds(now)
		const lastMessageAtTs = toSqlTimestampSeconds(lastCreatedAt)
		const modelId =
			typeof input.modelId === 'string'
				? input.modelId
				: input.modelId === null
					? null
					: session.modelId
		const title = shouldUpdateTitle ? titleFromMessages : session.title

		const statements: any[] = [
			d1
				.prepare(
					[
						`UPDATE agent_chat_sessions`,
						`SET model_id = ?, title = ?, updated_at = ?, last_message_at = ?`,
						`WHERE id = ? AND user_id = ?`,
					].join(' '),
				)
				.bind(
					modelId,
					title,
					nowTs,
					lastMessageAtTs,
					input.sessionId,
					input.userId,
				),
			d1
				.prepare(
					`DELETE FROM agent_chat_messages WHERE session_id = ? AND user_id = ?`,
				)
				.bind(input.sessionId, input.userId),
		]

		for (const [idx, m] of input.messages.entries()) {
			const id =
				typeof (m as any)?.id === 'string' && (m as any).id.trim()
					? String((m as any).id)
					: `msg_${input.sessionId}_${idx}`
			const createdAt = toDate((m as any)?.createdAt) ?? now
			const createdAtTs = toSqlTimestampSeconds(createdAt)
			const role =
				(m as any)?.role === 'assistant' ||
				(m as any)?.role === 'system' ||
				(m as any)?.role === 'user'
					? (m as any).role
					: 'assistant'

			statements.push(
				d1
					.prepare(
						[
							`INSERT INTO agent_chat_messages`,
							`(id, session_id, user_id, role, seq, message, created_at, updated_at)`,
							`VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
						].join(' '),
					)
					.bind(
						id,
						input.sessionId,
						input.userId,
						role,
						idx,
						JSON.stringify(m as any),
						createdAtTs,
						nowTs,
					),
			)
		}

		await runD1BatchOrFallback(d1, statements)
		return
	}

	const db = await getDb()
	await db.transaction(async (tx) => {
		await tx
			.update(schema.agentChatSessions)
			.set({
				modelId:
					typeof input.modelId === 'string'
						? input.modelId
						: input.modelId === null
							? null
							: session.modelId,
				title: shouldUpdateTitle ? titleFromMessages : session.title,
				updatedAt: now,
				lastMessageAt: lastCreatedAt,
			})
			.where(
				and(
					eq(schema.agentChatSessions.id, input.sessionId),
					eq(schema.agentChatSessions.userId, input.userId),
				),
			)

		await tx
			.delete(schema.agentChatMessages)
			.where(
				and(
					eq(schema.agentChatMessages.sessionId, input.sessionId),
					eq(schema.agentChatMessages.userId, input.userId),
				),
			)

		if (input.messages.length > 0) {
			await tx.insert(schema.agentChatMessages).values(
				input.messages.map((m, idx) => {
					const id =
						typeof (m as any)?.id === 'string' && (m as any).id.trim()
							? String((m as any).id)
							: `msg_${input.sessionId}_${idx}`
					const createdAt = toDate((m as any)?.createdAt) ?? now
					const role =
						(m as any)?.role === 'assistant' ||
						(m as any)?.role === 'system' ||
						(m as any)?.role === 'user'
							? (m as any).role
							: 'assistant'

					return {
						id,
						sessionId: input.sessionId,
						userId: input.userId,
						role,
						seq: idx,
						message: m as any,
						createdAt,
						updatedAt: now,
					}
				}),
			)
		}
	})
}
