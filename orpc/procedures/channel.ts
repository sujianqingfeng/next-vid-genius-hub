import { os } from '@orpc/server'
import { z } from 'zod'
import { desc, eq, and } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { getDb, schema } from '~/lib/db'
import { translateText } from '~/lib/ai/translate'
import { type AIModelId, AIModelIds } from '~/lib/ai/models'
import { toProxyJobPayload } from '~/lib/proxy/utils'
import { startCloudJob, getJobStatus, presignGetByKey, putObjectByKey } from '~/lib/cloudflare'
import { PROXY_URL } from '~/lib/config/app.config'
import { bucketPaths } from '~/lib/storage/bucket-paths'
import type { RequestContext } from '~/lib/auth/types'
import { TERMINAL_JOB_STATUSES } from '~/lib/job/status'
import { TASK_KINDS } from '~/lib/job/task'
import { MEDIA_SOURCES } from '~/lib/media/source'

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
    const id = (await import('@paralleldrive/cuid2')).createId()
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

    const row = await db.query.channels.findFirst({ where: eq(schema.channels.id, id) })
    return { channel: row }
  })

export const listChannels = os
  .input(z.object({ query: z.string().optional(), limit: z.number().min(1).max(100).default(50) }).optional())
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
      where: and(eq(schema.channels.id, input.id), eq(schema.channels.userId, userId)),
    })
    if (!ch) throw new Error('Channel not found')
    await db.delete(schema.channelVideos).where(eq(schema.channelVideos.channelId, ch.id))
    await db.delete(schema.channels).where(and(eq(schema.channels.id, ch.id), eq(schema.channels.userId, userId)))
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
      where: and(eq(schema.channels.id, input.id), eq(schema.channels.userId, userId)),
    })
    if (!channel) throw new Error('Channel not found')
    const channelUrlOrId = channel.channelUrl || channel.channelId || input.id

    let proxyPayload = undefined
    const proxyId = input.proxyId || channel.defaultProxyId || undefined
	    if (proxyId) {
	      const proxy = await db.query.proxies.findFirst({ where: eq(schema.proxies.id, proxyId) })
	      proxyPayload = toProxyJobPayload(proxy)
	    }

	    const taskId = createId()
	    await db.insert(schema.tasks).values({
	      id: taskId,
	      userId,
	      kind: TASK_KINDS.CHANNEL_SYNC,
	      engine: 'media-downloader',
	      targetType: 'channel',
	      targetId: channel.id,
	      status: 'queued',
	      progress: 0,
	      payload: { limit: input.limit, proxyId: proxyId ?? null, channelUrlOrId },
	      createdAt: new Date(),
	      updatedAt: new Date(),
	    })

	    try {
	      const job = await startCloudJob({
	        mediaId: channel.id,
	        engine: 'media-downloader',
	        options: {
	          task: 'channel-list',
	          source: MEDIA_SOURCES.YOUTUBE,
	          channelUrlOrId,
	          limit: input.limit,
	          defaultProxyUrl: PROXY_URL,
	          proxy: proxyPayload,
	        },
	      })

	      await db
	        .update(schema.channels)
	        .set({ lastJobId: job.jobId, lastSyncStatus: 'queued', updatedAt: new Date() })
	        .where(eq(schema.channels.id, channel.id))

	      await db
	        .update(schema.tasks)
	        .set({ jobId: job.jobId, startedAt: new Date(), updatedAt: new Date() })
	        .where(eq(schema.tasks.id, taskId))

	      return { jobId: job.jobId, taskId }
	    } catch (error) {
	      const message = error instanceof Error ? error.message : 'Failed to start channel sync'
	      await db
	        .update(schema.tasks)
	        .set({
	          status: 'failed',
	          error: message,
	          finishedAt: new Date(),
	          updatedAt: new Date(),
	        })
	        .where(eq(schema.tasks.id, taskId))
	      throw error
	    }
	  })

export const getCloudSyncStatus = os
  .input(z.object({ jobId: z.string().min(1) }))
  .handler(async ({ input }) => {
    const status = await getJobStatus(input.jobId)
    try {
      const db = await getDb()
      const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.jobId, input.jobId) })
      if (task) {
        await db
          .update(schema.tasks)
          .set({
            status: status.status,
            progress: typeof status.progress === 'number' ? Math.round(status.progress * 100) : null,
            jobStatusSnapshot: status,
            updatedAt: new Date(),
            finishedAt: TERMINAL_JOB_STATUSES.includes(status.status) ? new Date() : task.finishedAt,
          })
          .where(eq(schema.tasks.id, task.id))
      }
    } catch {
      // best-effort
    }
    return status
  })

export const finalizeCloudSync = os
  .input(z.object({ id: z.string().min(1), jobId: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const ctx = context as RequestContext
    const userId = ctx.auth.user!.id
    const db = await getDb()
    const channel = await db.query.channels.findFirst({
      where: and(eq(schema.channels.id, input.id), eq(schema.channels.userId, userId)),
    })
    if (!channel) throw new Error('Channel not found')

	    const status = await getJobStatus(input.jobId)
	    if (status.status !== 'completed') {
	      throw new Error(`Job not completed: ${status.status}`)
	    }
	    try {
	      const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.jobId, input.jobId) })
	      if (task) {
	        await db
	          .update(schema.tasks)
	          .set({
	            status: status.status,
	            progress: typeof status.progress === 'number' ? Math.round(status.progress * 100) : null,
	            jobStatusSnapshot: status,
	            updatedAt: new Date(),
	            finishedAt: new Date(),
	          })
	          .where(eq(schema.tasks.id, task.id))
	      }
	    } catch {
	      // ignore
	    }

	    const urlFromStatus = status.outputs?.metadata?.url
	    const keyFromStatus = status.outputs?.metadata?.key ?? status.outputMetadataKey
	    let metadataUrl = urlFromStatus
	    if (!metadataUrl && keyFromStatus) {
      metadataUrl = await presignGetByKey(keyFromStatus)
    }
    if (!metadataUrl) throw new Error('Missing metadata output from job')

    const r = await fetch(metadataUrl)
    if (!r.ok) throw new Error(`Fetch metadata failed: ${r.status}`)
    const data = (await r.json()) as any
    const list: any[] = Array.isArray(data?.videos) ? data.videos : []

    // Upsert videos
    function toDateOrUndefined(value: unknown): Date | undefined {
      if (value == null) return undefined
      if (value instanceof Date) return isNaN(value.getTime()) ? undefined : value
      if (typeof value === 'number') {
        const ms = value < 1e12 ? value * 1000 : value
        const d = new Date(ms)
        return isNaN(d.getTime()) ? undefined : d
      }
      if (typeof value === 'string') {
        const d = new Date(value)
        return isNaN(d.getTime()) ? undefined : d
      }
      if (typeof value === 'object') {
        // youtube may return objects like { text: '3 hours ago' } — skip; or { timestamp: 1690000000 }
        const anyv: any = value as any
        const ts = anyv?.timestamp ?? anyv?.seconds ?? anyv?.ms
        if (typeof ts === 'number') {
          const d = new Date(ts < 1e12 ? ts * 1000 : ts)
          return isNaN(d.getTime()) ? undefined : d
        }
        const txt = anyv?.text
        if (typeof txt === 'string') {
          const d = new Date(txt)
          if (!isNaN(d.getTime())) return d
        }
      }
      return undefined
    }

    for (const v of list) {
      const vid: string = String(v?.id || '')
      if (!vid) continue
      const title: string = String(v?.title || '')
      const url: string = String(v?.url || (vid ? `https://www.youtube.com/watch?v=${vid}` : ''))
      const publishedRaw = v?.publishedAt || v?.published || v?.date || v?.publishedTimeText
      const publishedAt = toDateOrUndefined(publishedRaw)
      const thumb: string | undefined = v?.thumbnail || v?.thumbnails?.[0]?.url || undefined
      const viewCount = typeof v?.viewCount === 'number' ? v.viewCount : undefined
      const likeCount = typeof v?.likeCount === 'number' ? v.likeCount : undefined

      await db
        .insert(schema.channelVideos)
        .values({
          channelId: channel.id,
          videoId: vid,
          title,
          url,
          thumbnail: thumb ?? null,
          publishedAt: publishedAt ?? undefined,
          viewCount: viewCount ?? undefined,
          likeCount: likeCount ?? undefined,
          raw: v ? (JSON.stringify(v) as any) : undefined,
        })
        .onConflictDoNothing()
    }

    await db
      .update(schema.channels)
      .set({
        lastSyncedAt: new Date(),
        lastSyncStatus: 'completed',
        updatedAt: new Date(),
        title: (data?.channel?.title as string) || channel.title || null,
        thumbnail: (data?.channel?.thumbnail as string) || channel.thumbnail || null,
      })
      .where(eq(schema.channels.id, channel.id))

    // Optional: materialize snap to bucket for auditing
    try {
      const key = bucketPaths.inputs.channelVideos(channel.id, input.jobId)
      await putObjectByKey(key, 'application/json', JSON.stringify({ channel: { id: channel.id, url: channel.channelUrl }, videos: list }, null, 2))
    } catch {}

    return { success: true, count: list.length }
  })

export const getChannel = os
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ input, context }) => {
    const ctx = context as RequestContext
    const userId = ctx.auth.user!.id
    const db = await getDb()
    const ch = await db.query.channels.findFirst({
      where: and(eq(schema.channels.id, input.id), eq(schema.channels.userId, userId)),
    })
    if (!ch) throw new Error('Channel not found')
    const videos = await db
      .select()
      .from(schema.channelVideos)
      .where(eq(schema.channelVideos.channelId, input.id))
      .orderBy(desc(schema.channelVideos.publishedAt ?? schema.channelVideos.createdAt))
      .limit(50)
    return { channel: ch, videos }
  })

export const listChannelVideos = os
  .input(z.object({ id: z.string().min(1), limit: z.number().min(1).max(100).default(50) }))
  .handler(async ({ input, context }) => {
    const ctx = context as RequestContext
    const userId = ctx.auth.user!.id
    const db = await getDb()
    const ch = await db.query.channels.findFirst({
      where: and(eq(schema.channels.id, input.id), eq(schema.channels.userId, userId)),
    })
    if (!ch) throw new Error('Channel not found')
    const rows = await db
      .select()
      .from(schema.channelVideos)
      .where(eq(schema.channelVideos.channelId, input.id))
      .orderBy(desc(schema.channelVideos.publishedAt ?? schema.channelVideos.createdAt))
      .limit(input.limit)
    return { videos: rows }
  })

// Translate the latest channel video titles (non-persistent, on-demand)
export const translateVideoTitles = os
  .input(
    z.object({
      channelId: z.string().min(1),
      limit: z.number().min(1).max(100).default(20),
      model: z.enum(AIModelIds).default('openai/gpt-4o-mini' as AIModelId),
    }),
  )
  .handler(async ({ input, context }) => {
    const ctx = context as RequestContext
    const userId = ctx.auth.user!.id
    const db = await getDb()
    const ch = await db.query.channels.findFirst({
      where: and(eq(schema.channels.id, input.channelId), eq(schema.channels.userId, userId)),
    })
    if (!ch) throw new Error('Channel not found')
    const rows = await db
      .select()
      .from(schema.channelVideos)
      .where(eq(schema.channelVideos.channelId, input.channelId))
      .orderBy(desc(schema.channelVideos.publishedAt ?? schema.channelVideos.createdAt))
      .limit(input.limit)

    const translations = await Promise.all(
      rows.map(async (r) => {
        const text = r.title || ''
        const t = await translateText(text, input.model)
        return { id: r.id, translation: t }
      }),
    )

    return { items: translations }
  })
