import { bucketPaths } from '@app/media-domain'
import { requireOrchestratorUrl } from './utils'

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
