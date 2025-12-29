import { postSignedJson } from '@app/job-callbacks'
import type {
	OrchestratorJobStatusResponse as JobStatusResponse,
	OrchestratorStartJobInput as StartJobInput,
	OrchestratorStartJobResponse as StartJobResponse,
} from '@app/media-domain'
import { requireJobCallbackSecret, requireOrchestratorUrl } from './utils'

export type { JobStatusResponse, StartJobInput, StartJobResponse }

export async function startCloudJob(
	input: StartJobInput,
): Promise<StartJobResponse> {
	const base = requireOrchestratorUrl()
	const url = `${base.replace(/\/$/, '')}/jobs`
	const secret = requireJobCallbackSecret()
	const res = await postSignedJson(url, secret, input)
	if (!res.ok) {
		let msg = ''
		try {
			msg = await res.clone().text()
		} catch {}
		throw new Error(`startCloudJob failed: ${res.status} ${msg}`)
	}
	return (await res.json()) as StartJobResponse
}

export async function getJobStatus(
	jobId: string,
	opts?: { signal?: AbortSignal },
): Promise<JobStatusResponse> {
	const base = requireOrchestratorUrl()
	const url = `${base.replace(/\/$/, '')}/jobs/${encodeURIComponent(jobId)}`
	const res = await fetch(url, { signal: opts?.signal })
	if (!res.ok)
		throw new Error(`getJobStatus failed: ${res.status} ${await res.text()}`)
	return (await res.json()) as JobStatusResponse
}

export async function cancelCloudJob(input: {
	jobId: string
	reason?: string | null
}): Promise<{ ok: boolean; status?: string; jobId?: string }> {
	const base = requireOrchestratorUrl()
	const url = `${base.replace(/\/$/, '')}/jobs/${encodeURIComponent(input.jobId)}/cancel`
	const secret = requireJobCallbackSecret()
	const res = await postSignedJson(url, secret, {
		jobId: input.jobId,
		reason: input.reason ?? null,
	})
	if (!res.ok) {
		let msg = ''
		try {
			msg = await res.clone().text()
		} catch {}
		throw new Error(`cancelCloudJob failed: ${res.status} ${msg}`)
	}
	return (await res.json()) as { ok: boolean; status?: string; jobId?: string }
}

export async function replayAppCallback(input: {
	jobId: string
	reason?: string | null
	force?: boolean
}): Promise<{
	ok: boolean
	jobId: string
	eventSeq?: number
	eventId?: string
}> {
	const base = requireOrchestratorUrl()
	const url = `${base.replace(/\/$/, '')}/debug/replay-app-callback`
	const secret = requireJobCallbackSecret()
	const res = await postSignedJson(url, secret, {
		jobId: input.jobId,
		reason: input.reason ?? null,
		force: Boolean(input.force),
	})
	if (!res.ok) {
		let msg = ''
		try {
			msg = await res.clone().text()
		} catch {}
		throw new Error(`replayAppCallback failed: ${res.status} ${msg}`)
	}
	return (await res.json()) as {
		ok: boolean
		jobId: string
		eventSeq?: number
		eventId?: string
	}
}
