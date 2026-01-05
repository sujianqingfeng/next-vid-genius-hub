import type { EngineId } from '@app/media-domain'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { getDb, schema } from '~/lib/infra/db'
import { logger } from '~/lib/infra/logger'
import type { TaskKindId } from '~/lib/features/job/task'
import { createId } from '~/lib/shared/utils/id'
import {
	cancelCloudJob,
	putJobManifest,
	startCloudJob,
	type JobManifest,
} from '~/lib/infra/cloudflare'

type Db = Awaited<ReturnType<typeof getDb>>
type TaskTargetType = 'media' | 'channel' | 'thread' | 'system'

export async function enqueueCloudTask(input: {
	db?: Db
	userId: string | null
	kind: TaskKindId
	engine: EngineId
	targetType: TaskTargetType
	targetId: string
	payload?: unknown

	/**
	 * Orchestrator requires a `mediaId` even for non-media tasks.
	 * For channel sync we currently pass channel.id; for thread renders we pass thread.id.
	 */
	mediaId: string

	purpose?: string
	title?: string | null
	options?: Record<string, unknown>

	/**
	 * If omitted, enqueue will generate a stable id (`job_${createId()}`) so the manifest can
	 * be written before calling the orchestrator.
	 */
	jobId?: string
	taskId?: string

	buildManifest: (args: { jobId: string }) => Promise<JobManifest> | JobManifest
	now?: Date
}): Promise<{ taskId: string; jobId: string }> {
	const db = input.db ?? (await getDb())
	const now = input.now ?? new Date()
	const taskId = input.taskId ?? createId()
	const jobId = input.jobId ?? `job_${createId()}`

	const activeStatuses = [
		'queued',
		'fetching_metadata',
		'preparing',
		'running',
		'uploading',
	] as const

	try {
		const existing = await db.query.tasks.findMany({
			where: and(
				input.userId === null
					? isNull(schema.tasks.userId)
					: eq(schema.tasks.userId, input.userId),
				eq(schema.tasks.kind, input.kind),
				eq(schema.tasks.targetType, input.targetType),
				eq(schema.tasks.targetId, input.targetId),
				isNull(schema.tasks.finishedAt),
				inArray(schema.tasks.status, activeStatuses as any),
			),
			limit: 10,
			orderBy: (t, { desc }) => [desc(t.createdAt)],
		})

		for (const prev of existing) {
			await db
				.update(schema.tasks)
				.set({
					status: 'canceled',
					error: 'superseded by a newer task',
					finishedAt: now,
					updatedAt: now,
				})
				.where(eq(schema.tasks.id, prev.id))

			if (prev.jobId) {
				try {
					await cancelCloudJob({
						jobId: prev.jobId,
						reason: 'superseded by a newer task',
					})
				} catch (err) {
					logger.warn(
						'api',
						`[enqueueCloudTask] cancelCloudJob failed job=${prev.jobId} err=${
							err instanceof Error ? err.message : String(err)
						}`,
					)
				}
			}
		}
	} catch (err) {
		logger.warn(
			'api',
			`[enqueueCloudTask] cancel previous tasks skipped: ${
				err instanceof Error ? err.message : String(err)
			}`,
		)
	}

	await db.insert(schema.tasks).values({
		id: taskId,
		userId: input.userId,
		kind: input.kind,
		engine: input.engine as any,
		targetType: input.targetType,
		targetId: input.targetId,
		status: 'queued',
		progress: 0,
		payload: (input.payload ?? null) as any,
		createdAt: now,
		updatedAt: now,
	})

	try {
		const manifest: JobManifest = await input.buildManifest({ jobId })
		await putJobManifest(jobId, manifest)

		const job = await startCloudJob({
			jobId,
			mediaId: input.mediaId,
			engine: input.engine,
			purpose: input.purpose ?? String(input.kind),
			title: input.title ?? undefined,
			options: input.options ?? {},
		})

		await db
			.update(schema.tasks)
			.set({
				jobId: job.jobId,
				startedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(schema.tasks.id, taskId))

		return { taskId, jobId: job.jobId }
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Failed to start cloud task'
		logger.warn(
			'api',
			`[enqueueCloudTask] failed kind=${input.kind} job=${jobId} ${message}`,
		)
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
}
