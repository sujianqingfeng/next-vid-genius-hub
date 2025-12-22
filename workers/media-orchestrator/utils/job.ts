import type { Env } from '../types'

export function jobStub(env: Env, jobId: string) {
	if (!env.RENDER_JOB_DO) return null
	const id = env.RENDER_JOB_DO.idFromName(jobId)
	return env.RENDER_JOB_DO.get(id)
}

