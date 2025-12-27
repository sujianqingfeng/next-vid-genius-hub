import type { EngineId } from '@app/media-domain'
import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import type { TaskKindId } from '~/lib/job/task'
import { createId } from '~/lib/utils/id'
import { putJobManifest, startCloudJob, type JobManifest } from '~/lib/cloudflare'

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
			.where((t, { eq }) => eq(t.id, taskId))

		return { taskId, jobId: job.jobId }
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Failed to start cloud task'
		logger.warn('api', `[enqueueCloudTask] failed kind=${input.kind} job=${jobId} ${message}`)
		await db
			.update(schema.tasks)
			.set({
				status: 'failed',
				error: message,
				finishedAt: new Date(),
				updatedAt: new Date(),
			})
			.where((t, { eq }) => eq(t.id, taskId))
		throw error
	}
}
