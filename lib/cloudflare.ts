import { CF_ORCHESTRATOR_URL, JOB_CALLBACK_HMAC_SECRET } from '~/lib/constants'
import { buildSignedBody } from '~/lib/security/hmac'

type EngineId = 'burner-ffmpeg' | 'renderer-remotion' | 'media-downloader'

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
  const { payload, signature } = buildSignedBody(secret, input)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature': signature,
    },
    body: payload,
  })
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
