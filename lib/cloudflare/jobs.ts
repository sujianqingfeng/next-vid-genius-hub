import { postSignedJson } from '@app/job-callbacks'
import { requireJobCallbackSecret, requireOrchestratorUrl } from './utils'

type EngineId = 'burner-ffmpeg' | 'renderer-remotion' | 'media-downloader' | 'audio-transcoder' | 'asr-pipeline'

export interface StartJobInput extends Record<string, unknown> {
  mediaId: string
  engine: EngineId
  options?: Record<string, unknown>
}

export interface StartJobResponse {
  jobId: string
}

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
