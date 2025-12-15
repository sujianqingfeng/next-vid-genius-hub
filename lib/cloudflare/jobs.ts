import { postSignedJson } from '@app/job-callbacks'
import { requireJobCallbackSecret, requireOrchestratorUrl } from './utils'
import type { EngineId, JobStatus } from '@app/media-domain'

export interface StartJobInput extends Record<string, unknown> {
  /**
   * Globally unique job id for this async task. The caller (Next) is now
   * responsible for generating this id so it can be used consistently across
   * DB records, manifests and orchestrator/containers.
   */
  jobId: string
  mediaId: string
  engine: EngineId
  /**
   * Optional human-readable title for the media / resource.
   * Used only to build nicer R2 object keys (e.g. media/{id}-{slug}/...).
   */
  title?: string | null
  options?: Record<string, unknown>
}

export interface StartJobResponse {
  jobId: string
}

export interface JobStatusResponse {
  jobId: string
  status: JobStatus
  phase?: 'fetching_metadata' | 'preparing' | 'running' | 'uploading'
  progress?: number
  outputKey?: string
  outputAudioKey?: string
  outputMetadataKey?: string
  message?: string
  outputs?: {
    video?: { key?: string; url?: string }
    audio?: { key?: string; url?: string }
    audioSource?: { key?: string; url?: string }
    audioProcessed?: { key?: string; url?: string }
    metadata?: { key?: string; url?: string }
    vtt?: { key?: string; url?: string }
    words?: { key?: string; url?: string }
  }
  metadata?: Record<string, unknown>
}

export async function startCloudJob(input: StartJobInput): Promise<StartJobResponse> {
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

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const base = requireOrchestratorUrl()
  const url = `${base.replace(/\/$/, '')}/jobs/${encodeURIComponent(jobId)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`getJobStatus failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as JobStatusResponse
}
