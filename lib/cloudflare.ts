import { CF_ORCHESTRATOR_URL, JOB_CALLBACK_HMAC_SECRET } from '~/lib/config/app.config'
import { postSignedJson } from '@app/callback-utils'
import { bucketPaths } from '~/lib/storage/bucket-paths'

type EngineId = 'burner-ffmpeg' | 'renderer-remotion' | 'media-downloader' | 'audio-transcoder' | 'asr-pipeline'

export interface StartJobInput extends Record<string, unknown> {
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

function requireJobCallbackSecret(): string {
  if (!JOB_CALLBACK_HMAC_SECRET) {
    throw new Error('JOB_CALLBACK_HMAC_SECRET is not configured')
  }
  return JOB_CALLBACK_HMAC_SECRET
}

export async function startCloudJob(input: StartJobInput): Promise<StartJobResponse> {
  const base = requireOrchestratorUrl()
  const url = `${base.replace(/\/$/, '')}/jobs`
  const secret = requireJobCallbackSecret()
  const res = await postSignedJson(url, secret, input)
  if (!res.ok) {
    // Body may have been read already by postSignedJson for logging; use clone() defensively.
    let msg = ''
    try { msg = await res.clone().text() } catch {}
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
export async function deleteCloudArtifacts(input: { keys?: string[]; artifactJobIds?: string[]; prefixes?: string[] }): Promise<void> {
  const base = requireOrchestratorUrl()
  const keys = (input.keys ?? []).filter(Boolean)
  const jobIds = (input.artifactJobIds ?? []).filter(Boolean)
  const prefixes = (input.prefixes ?? []).filter(Boolean)

  // 1) Batch delete objects by key (if any)
  if (keys.length > 0) {
    const url = `${base.replace(/\/$/, '')}/debug/delete`
    const secret = requireJobCallbackSecret()
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

  // 3) Delete by prefixes (list + bulk delete)
  if (prefixes.length > 0) {
    const url = `${base.replace(/\/$/, '')}/debug/delete-prefixes`
    const secret = requireJobCallbackSecret()
    const res = await postSignedJson(url, secret, { prefixes })
    if (!res.ok) throw new Error(`deleteCloudArtifacts: delete prefixes failed: ${res.status} ${await res.text()}`)
  }
}

// Request both PUT/GET presigned URLs for an arbitrary key
export async function presignPutAndGetByKey(key: string, contentType: string): Promise<{ putUrl: string; getUrl: string }> {
  const base = requireOrchestratorUrl()
  const url = `${base.replace(/\/$/, '')}/debug/presign?key=${encodeURIComponent(key)}&contentType=${encodeURIComponent(contentType)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`presignPutAndGetByKey failed: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { putUrl?: string; getUrl?: string }
  if (!body?.putUrl || !body?.getUrl) throw new Error('presignPutAndGetByKey: missing URLs in response')
  return { putUrl: body.putUrl, getUrl: body.getUrl }
}

// Upload small object via presigned PUT
export async function putObjectByKey(key: string, contentType: string, body: string | Uint8Array | Buffer): Promise<void> {
  const { putUrl } = await presignPutAndGetByKey(key, contentType)
  const payload: BodyInit = typeof body === 'string' ? body : (body as unknown as BodyInit)
  const init: RequestInit = {
    method: 'PUT',
    headers: {
      'content-type': contentType,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    },
    body: payload,
  }
  const res = await fetch(putUrl, init)
  if (!res.ok) throw new Error(`putObjectByKey failed: ${res.status} ${await res.text()}`)
}

// Upsert bucket manifest for media
export interface MediaManifestPatch {
  remoteVideoKey?: string | null
  remoteAudioKey?: string | null
  remoteMetadataKey?: string | null
  vttKey?: string | null
  commentsKey?: string | null
  renderedSubtitlesJobId?: string | null
  renderedInfoJobId?: string | null
}

export async function upsertMediaManifest(mediaId: string, patch: MediaManifestPatch): Promise<void> {
  const key = bucketPaths.manifests.media(mediaId)
  const base = requireOrchestratorUrl()
  const presignUrl = `${base.replace(/\/$/, '')}/debug/presign?key=${encodeURIComponent(key)}&contentType=${encodeURIComponent('application/json')}`
  const presignResp = await fetch(presignUrl)
  if (!presignResp.ok) throw new Error(`manifest presign failed: ${presignResp.status}`)
  const { putUrl, getUrl } = (await presignResp.json()) as { putUrl?: string; getUrl?: string }
  if (!putUrl || !getUrl) throw new Error('manifest presign: missing URLs')

  // Try read existing manifest
  let current: Record<string, unknown> = {}
  try {
    const r = await fetch(getUrl)
    if (r.ok) current = (await r.json()) as Record<string, unknown>
  } catch {}
  const next = {
    mediaId,
    ...current,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
  }
  const putResp = await fetch(putUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
    body: JSON.stringify(next),
  })
  if (!putResp.ok) throw new Error(`manifest put failed: ${putResp.status} ${await putResp.text()}`)
}
