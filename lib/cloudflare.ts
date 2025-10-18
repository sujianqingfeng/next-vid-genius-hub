import { CF_ORCHESTRATOR_URL, JOB_CALLBACK_HMAC_SECRET } from '~/lib/config/app.config'
import { postSignedJson } from '@app/callback-utils'

type EngineId = 'burner-ffmpeg' | 'renderer-remotion' | 'media-downloader' | 'audio-transcoder' | 'asr-pipeline'

export interface StartJobInput {
  mediaId: string
  engine: EngineId
  options?: Record<string, unknown>
}

export interface StartJobResponse { jobId: string }

export interface JobStatusResponse {
  jobId: string
  status: 'queued' | 'fetching_metadata' | 'preparing' | 'running' | 'uploading' | 'completed' | 'failed' | 'canceled'
  phase?: 'fetching_metadata' | 'preparing' | 'running' | 'uploading'
  progress?: number
  outputKey?: string
  outputAudioKey?: string
  outputMetadataKey?: string
  message?: string
  outputs?: {
    video?: { key?: string; url?: string }
    audio?: { key?: string; url?: string }
    metadata?: { key?: string; url?: string }
    vtt?: { key?: string; url?: string }
    words?: { key?: string; url?: string }
  }
  metadata?: Record<string, unknown>
}

function requireOrchestratorUrl(): string {
  if (!CF_ORCHESTRATOR_URL) throw new Error('CF_ORCHESTRATOR_URL is not configured')
  return CF_ORCHESTRATOR_URL
}

export async function startCloudJob(input: StartJobInput): Promise<StartJobResponse> {
  const base = requireOrchestratorUrl()
  const url = `${base.replace(/\/$/, '')}/jobs`
  const secret = JOB_CALLBACK_HMAC_SECRET || 'dev-secret'
  const res = await postSignedJson(url, secret, input)
  if (!res.ok) throw new Error(`startCloudJob failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as StartJobResponse
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const base = requireOrchestratorUrl()
  const url = `${base.replace(/\/$/, '')}/jobs/${encodeURIComponent(jobId)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`getJobStatus failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as JobStatusResponse
}

// Presign a GET URL for an arbitrary bucket key via orchestrator helper
// Note: relies on orchestrator's debug presign endpoint; suitable for fallback flows
export async function presignGetByKey(key: string): Promise<string> {
  const base = requireOrchestratorUrl()
  const url = `${base.replace(/\/$/, '')}/debug/presign?key=${encodeURIComponent(key)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`presignGetByKey failed: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { getUrl?: string }
  if (!body?.getUrl) throw new Error('presignGetByKey: missing getUrl in response')
  return body.getUrl
}

// Best-effort deletion of remote artifacts via orchestrator helper endpoints.
// - keys: R2 object keys to delete
// - artifactJobIds: orchestrator artifact job ids to purge
export async function deleteCloudArtifacts(input: { keys?: string[]; artifactJobIds?: string[] }): Promise<void> {
  const base = requireOrchestratorUrl()
  const keys = (input.keys ?? []).filter(Boolean)
  const jobIds = (input.artifactJobIds ?? []).filter(Boolean)

  // 1) Batch delete objects by key (if any)
  if (keys.length > 0) {
    const url = `${base.replace(/\/$/, '')}/debug/delete`
    const secret = JOB_CALLBACK_HMAC_SECRET || 'dev-secret'
    const res = await postSignedJson(url, secret, { keys })
    if (!res.ok) throw new Error(`deleteCloudArtifacts: delete keys failed: ${res.status} ${await res.text()}`)
  }

  // 2) Delete orchestrator artifacts by job id (if any)
  for (const id of jobIds) {
    const url = `${base.replace(/\/$/, '')}/artifacts/${encodeURIComponent(id)}`
    const r = await fetch(url, { method: 'DELETE' })
    if (!r.ok && r.status !== 404) {
      throw new Error(`deleteCloudArtifacts: delete artifact ${id} failed: ${r.status} ${await r.text()}`)
    }
  }
}
