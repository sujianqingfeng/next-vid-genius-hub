import { os } from '@orpc/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDefaultAiModel, isEnabledModel } from '~/lib/ai/config/service'
import { translateTextWithUsage } from '~/lib/ai/translate'
import type { RequestContext } from '~/lib/auth/types'
import { getJobStatus, type JobManifest } from '~/lib/cloudflare'
import { TRANSLATE_CONCURRENCY } from '~/lib/config/env'
import { getDb, schema } from '~/lib/db'
import { enqueueCloudTask } from '~/lib/job/enqueue'
import { TASK_KINDS } from '~/lib/job/task'
import { MEDIA_SOURCES } from '~/lib/media/source'
import { throwInsufficientPointsError } from '~/lib/orpc/errors'
import { chargeLlmUsage, InsufficientPointsError } from '~/lib/points/billing'
import { resolveSuccessProxy } from '~/lib/proxy/resolve-success-proxy'
import { toProxyJobPayload } from '~/lib/proxy/utils'
import { mapWithConcurrency } from '~/lib/utils/concurrency'
import { createId } from '~/lib/utils/id'

const CreateChannelInput = z.object({
	channelUrlOrId: z.string().min(1),
	defaultProxyId: z.string().optional(),
})

export const createChannel = os
	.input(CreateChannelInput)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const now = new Date()
		const id = createId()
		const channelUrl = input.channelUrlOrId
		const provider: 'youtube' = MEDIA_SOURCES.YOUTUBE

		const db = await getDb()
		await db
			.insert(schema.channels)
			.values({
				id,
				userId,
				provider,
				channelUrl,
				defaultProxyId: input.defaultProxyId ?? null,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing()

		const row = await db.query.channels.findFirst({
			where: eq(schema.channels.id, id),
		})
		return { channel: row }
	})

export const listChannels = os
	.input(
		z
			.object({
				query: z.string().optional(),
				limit: z.number().min(1).max(100).default(50),
			})
			.optional(),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const rows = await db.query.channels.findMany({
			where: eq(schema.channels.userId, userId),
			orderBy: (t, { desc }) => [desc(t.updatedAt ?? t.createdAt)],
			limit: input?.limit ?? 50,
		})
		return { channels: rows }
	})

export const deleteChannel = os
	.input(z.object({ id: z.string().min(1) }))
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		// delete videos then channel (scoped to current user)
		const ch = await db.query.channels.findFirst({
			where: and(
				eq(schema.channels.id, input.id),
				eq(schema.channels.userId, userId),
			),
		})
		if (!ch) throw new Error('Channel not found')
		await db
			.delete(schema.channelVideos)
			.where(eq(schema.channelVideos.channelId, ch.id))
		await db
			.delete(schema.channels)
			.where(
				and(eq(schema.channels.id, ch.id), eq(schema.channels.userId, userId)),
			)
		return { success: true }
	})

const StartCloudSyncInput = z.object({
	id: z.string().min(1),
	limit: z.number().min(1).max(50).default(20),
	proxyId: z.string().optional(),
})

export const startCloudSync = os
	.input(StartCloudSyncInput)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const channel = await db.query.channels.findFirst({
			where: and(
				eq(schema.channels.id, input.id),
				eq(schema.channels.userId, userId),
			),
		})
		if (!channel) throw new Error('Channel not found')
		const channelUrlOrId = channel.channelUrl || channel.channelId || input.id

		const { proxyId: effectiveProxyId, proxyRecord } =
			await resolveSuccessProxy({
				db,
				requestedProxyId: input.proxyId,
				preferredProxyId: channel.defaultProxyId ?? null,
			})
		const proxyPayload = toProxyJobPayload(proxyRecord)

		const { taskId, jobId } = await enqueueCloudTask({
				db,
				userId,
				kind: TASK_KINDS.CHANNEL_SYNC,
				engine: 'media-downloader',
				targetType: 'channel',
				targetId: channel.id,
				mediaId: channel.id,
				purpose: TASK_KINDS.CHANNEL_SYNC,
				title: channel.title || undefined,
				payload: {
					limit: input.limit,
					proxyId: effectiveProxyId ?? null,
					channelUrlOrId,
				},
				options: {
					task: 'channel-list',
					source: MEDIA_SOURCES.YOUTUBE,
					channelUrlOrId,
					limit: input.limit,
					proxy: proxyPayload,
				},
				buildManifest: ({ jobId }): JobManifest => {
					return {
						jobId,
						mediaId: channel.id,
						purpose: TASK_KINDS.CHANNEL_SYNC,
						engine: 'media-downloader',
						createdAt: Date.now(),
						inputs: {},
						optionsSnapshot: {
							task: 'channel-list',
							source: MEDIA_SOURCES.YOUTUBE,
							channelUrlOrId,
							limit: input.limit,
							proxyId: effectiveProxyId ?? null,
						},
					}
				},
		})

		await db
			.update(schema.channels)
			.set({
				lastJobId: jobId,
				lastSyncStatus: 'queued',
				updatedAt: new Date(),
			})
			.where(eq(schema.channels.id, channel.id))

		return { jobId, taskId }
	})

export const getCloudSyncStatus = os
	.input(z.object({ jobId: z.string().min(1) }))
	.handler(async ({ input }) => {
		const status = await getJobStatus(input.jobId)
		return status
	})

export const getChannel = os
	.input(z.object({ id: z.string().min(1) }))
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const ch = await db.query.channels.findFirst({
			where: and(
				eq(schema.channels.id, input.id),
				eq(schema.channels.userId, userId),
			),
		})
		if (!ch) throw new Error('Channel not found')
		const videos = await db
			.select()
			.from(schema.channelVideos)
			.where(eq(schema.channelVideos.channelId, input.id))
			.orderBy(
				desc(
					schema.channelVideos.publishedAt ?? schema.channelVideos.createdAt,
				),
			)
			.limit(50)
		return { channel: ch, videos }
	})

export const listChannelVideos = os
	.input(
		z.object({
			id: z.string().min(1),
			limit: z.number().min(1).max(100).default(50),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const ch = await db.query.channels.findFirst({
			where: and(
				eq(schema.channels.id, input.id),
				eq(schema.channels.userId, userId),
			),
		})
		if (!ch) throw new Error('Channel not found')
		const rows = await db
			.select()
			.from(schema.channelVideos)
			.where(eq(schema.channelVideos.channelId, input.id))
			.orderBy(
				desc(
					schema.channelVideos.publishedAt ?? schema.channelVideos.createdAt,
				),
			)
			.limit(input.limit)
		return { videos: rows }
	})

// Translate the latest channel video titles (non-persistent, on-demand)
export const translateVideoTitles = os
	.input(
		z.object({
			channelId: z.string().min(1),
			limit: z.number().min(1).max(100).default(20),
			model: z.string().trim().min(1).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()
		const defaultModel = await getDefaultAiModel('llm', db)
		const modelId = input.model ?? defaultModel?.id
		if (!modelId || !(await isEnabledModel('llm', modelId, db))) {
			throw new Error('LLM model is not enabled')
		}
		const ch = await db.query.channels.findFirst({
			where: and(
				eq(schema.channels.id, input.channelId),
				eq(schema.channels.userId, userId),
			),
		})
		if (!ch) throw new Error('Channel not found')
		const rows = await db
			.select()
			.from(schema.channelVideos)
			.where(eq(schema.channelVideos.channelId, input.channelId))
			.orderBy(
				desc(
					schema.channelVideos.publishedAt ?? schema.channelVideos.createdAt,
				),
			)
			.limit(input.limit)

		let totalInputTokens = 0
		let totalOutputTokens = 0
		const translations = await mapWithConcurrency(
			rows,
			TRANSLATE_CONCURRENCY,
			async (r) => {
				const text = r.title || ''
				if (!text.trim()) {
					return { id: r.id, translation: '' }
				}
				const res = await translateTextWithUsage(text, modelId)
				totalInputTokens += res.usage.inputTokens
				totalOutputTokens += res.usage.outputTokens
				return { id: r.id, translation: res.translation }
			},
		)

		try {
			await chargeLlmUsage({
				userId,
				modelId,
				inputTokens: totalInputTokens,
				outputTokens: totalOutputTokens,
				refType: 'channel-translate',
				refId: input.channelId,
				remark: `channel translate tokens=${totalInputTokens + totalOutputTokens}`,
			})
		} catch (err) {
			if (err instanceof InsufficientPointsError) {
				throwInsufficientPointsError()
			}
			throw err
		}

		return { items: translations }
	})
