import type {
	ExternalPorts,
	LocalJobEvent,
	LocalJobSpec,
	LocalRunResult,
} from './contracts'
import { resolveExecutor } from './dispatch'
import {
	cancelJob,
	emitEvent,
	getJobStatus,
	initJob,
	maybeGetJobStatus,
	ensureStateDir,
} from './state-store'

export type LocalMediaOrchestrator = {
	runJob: (spec: LocalJobSpec, ports?: ExternalPorts) => Promise<LocalRunResult>
	cancelJob: (jobId: string, reason?: string) => Promise<LocalRunResult>
	getStatus: (jobId: string) => Promise<Awaited<ReturnType<typeof getJobStatus>>>
	emitEvent: (jobId: string, event: LocalJobEvent) => Promise<Awaited<ReturnType<typeof emitEvent>>>
	stateDir: string
}

export function createLocalMediaOrchestrator(opts?: {
	stateDir?: string
	ports?: ExternalPorts
}): LocalMediaOrchestrator {
	const stateDir = opts?.stateDir || '.local-jobs'
	const defaultPorts = opts?.ports || {}

	return {
		stateDir,
		async runJob(spec, ports) {
			const resolvedStateDir = await ensureStateDir(stateDir)
			const doc = await initJob(resolvedStateDir, spec, spec.jobId)
			const jobId = doc.jobId
			const executor = resolveExecutor(spec.kind)
			const mergedPorts = { ...defaultPorts, ...(ports || {}) }

			try {
				await emitEvent(resolvedStateDir, jobId, {
					status: 'running',
					phase: 'preparing',
					progress: 0.02,
					message: `Starting ${spec.kind}`,
				})

				await executor({
					jobId,
					spec,
					stateDir: resolvedStateDir,
					ports: mergedPorts,
					emit: (event) => emitEvent(resolvedStateDir, jobId, event),
					isCanceled: async () => {
						const current = await maybeGetJobStatus(resolvedStateDir, jobId)
						return current?.status === 'canceled'
					},
				})

				const latest = await getJobStatus(resolvedStateDir, jobId)
				if (latest.status === 'queued' || latest.status === 'running') {
					const done = await emitEvent(resolvedStateDir, jobId, {
						status: 'completed',
						phase: 'completed',
						progress: 1,
						message: `${spec.kind} finished`,
					})
					return { jobId, status: done.status }
				}

				return { jobId, status: latest.status }
			} catch (error) {
				const err = error instanceof Error ? error.message : String(error)
				await emitEvent(resolvedStateDir, jobId, {
					status: 'failed',
					phase: 'failed',
					progress: 1,
					error: err,
					message: `${spec.kind} failed`,
				})
				throw error
			}
		},
		cancelJob: (jobId, reason) => cancelJob(stateDir, jobId, reason),
		getStatus: (jobId) => getJobStatus(stateDir, jobId),
		emitEvent: (jobId, event) => emitEvent(stateDir, jobId, event),
	}
}

export async function runJob(
	spec: LocalJobSpec,
	ports?: ExternalPorts,
	opts?: { stateDir?: string },
): Promise<LocalRunResult> {
	const orchestrator = createLocalMediaOrchestrator({
		stateDir: opts?.stateDir,
		ports,
	})
	return orchestrator.runJob(spec)
}

export { cancelJob as cancelLocalJob, getJobStatus, emitEvent as emitLocalEvent }
