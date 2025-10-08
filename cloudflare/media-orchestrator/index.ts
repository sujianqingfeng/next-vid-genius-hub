export interface Env {
  JOBS: KVNamespace
  RENDER_BUCKET?: R2Bucket
  JOB_TTL_SECONDS?: string
  CONTAINER_BASE_URL?: string
  NEXT_BASE_URL?: string
  JOB_CALLBACK_HMAC_SECRET?: string
  # Generic S3-compatible config (R2/MinIO)
  S3_ENDPOINT?: string
  S3_ACCESS_KEY_ID?: string
  S3_SECRET_ACCESS_KEY?: string
  S3_BUCKET_NAME?: string
  S3_STYLE?: 'vhost' | 'path'
  S3_REGION?: string
}

type EngineId = 'burner-ffmpeg' | 'renderer-remotion'

type JobStatus =
  | 'queued'
  | 'preparing'
  | 'running'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'canceled'

interface StartBody {
  mediaId: string
  engine: EngineId
  options?: Record<string, unknown>
}

interface StatusDoc {
  jobId: string
  status: JobStatus
  phase?: 'preparing' | 'running' | 'uploading'
  progress?: number
  outputKey?: string
  error?: string
  ts: number
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function uid() {
  // Simple uid for demo
  return 'job_' + Math.random().toString(36).slice(2, 10)
}

// ========= R2 S3 Pre-sign (SigV4) =========
async function presignS3(env: Env, method: 'GET'|'PUT'|'HEAD', bucket: string, key: string, expiresSec: number, contentType?: string): Promise<string> {
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error('S3 credentials not configured')
  }
  const endpointHost = env.S3_ENDPOINT.replace(/^https?:\/\//, '')
  const style = (env.S3_STYLE || 'vhost') as 'vhost'|'path'
  const region = env.S3_REGION || 'auto'
  const host = style === 'vhost' ? `${bucket}.${endpointHost}` : endpointHost
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\..*/g, '') + 'Z' // YYYYMMDDTHHMMSSZ
  const date = amzDate.slice(0, 8)
  const service = 's3'
  const algorithm = 'AWS4-HMAC-SHA256'
  const credential = `${env.S3_ACCESS_KEY_ID}/${date}/${region}/${service}/aws4_request`
  const signedHeaders = 'host'
  const keyPart = `/${encodeURIComponent(key).replace(/%2F/g, '/')}`
  const canonicalUri = style === 'vhost' ? keyPart : `/${bucket}${keyPart}`
  const canonicalQuery = new URLSearchParams({
    'X-Amz-Algorithm': algorithm,
    'X-Amz-Credential': encodeURIComponent(credential),
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSec),
    'X-Amz-SignedHeaders': signedHeaders,
  })
  const canonicalHeaders = `host:${host}\n`
  const payloadHash = 'UNSIGNED-PAYLOAD'
  const canonicalRequest = [method, canonicalUri, canonicalQuery.toString(), canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const hash = await sha256Hex(canonicalRequest)
  const stringToSign = [algorithm, amzDate, `${date}/${region}/${service}/aws4_request`, hash].join('\n')
  const signingKey = await getSigningKey(env.S3_SECRET_ACCESS_KEY!, date, region, service)
  const signature = await hmacHexRaw(signingKey, stringToSign)
  const scheme = env.S3_ENDPOINT.startsWith('http://') ? 'http' : 'https'
  const url = `${scheme}://${host}${canonicalUri}?${canonicalQuery.toString()}&X-Amz-Signature=${signature}`
  return url
}

async function sha256Hex(data: string): Promise<string> {
  const enc = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(data))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmacRaw(key: CryptoKey, data: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder()
  return crypto.subtle.sign('HMAC', key, enc.encode(data))
}

async function importKey(raw: ArrayBuffer | Uint8Array) {
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

async function hmacHexRaw(key: CryptoKey, data: string): Promise<string> {
  const sig = await hmacRaw(key, data)
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function getSigningKey(secret: string, date: string, region: string, service: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  let kDate = await importKey(enc.encode('AWS4' + secret))
  kDate = await importKey(await hmacRaw(kDate, date))
  let kRegion = await importKey(await hmacRaw(kDate, region))
  let kService = await importKey(await hmacRaw(kRegion, service))
  let kSigning = await importKey(await hmacRaw(kService, 'aws4_request'))
  return kSigning
}

async function handleStart(env: Env, req: Request) {
  const raw = await req.text()
  const sig = req.headers.get('x-signature') || ''
  if (!(await verifyHmac(env.JOB_CALLBACK_HMAC_SECRET || 'dev-secret', raw, sig))) {
    return json({ error: 'unauthorized' }, { status: 401 })
  }
  const body = JSON.parse(raw) as StartBody
  if (!body?.mediaId || !body?.engine) return json({ error: 'bad request' }, { status: 400 })
  const jobId = uid()
  const now = Date.now()
  const baseNext = (env.NEXT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
  const containerBase = (env.CONTAINER_BASE_URL || 'http://localhost:8080').replace(/\/$/, '')

  const doc: StatusDoc = { jobId, status: 'queued', ts: now } as StatusDoc & { mediaId?: string }
  ;(doc as any).mediaId = body.mediaId
  await env.JOBS.put(jobId, JSON.stringify(doc), { expirationTtl: Number(env.JOB_TTL_SECONDS || 86400) })

  // Prepare payload for container
  // Ensure inputs exist in R2 (Worker fetches from Next, container不会访问Next)
  const bucketName = env.S3_BUCKET_NAME || 'vidgen-render'
  const inputVideoKey = `inputs/videos/${body.mediaId}.mp4`
  const inputVttKey = `inputs/subtitles/${body.mediaId}.vtt`
  const outputKey = `outputs/${jobId}/video.mp4`

  // Mirror inputs to S3-compatible storage (R2/MinIO) via presigned PUT if needed
  const videoExists = await s3Head(env, bucketName, inputVideoKey)
  if (!videoExists) {
    const src = await fetch(`${baseNext}/api/media/${body.mediaId}/source`)
    if (!src.ok || !src.body) return json({ error: 'fetch source failed' }, { status: 502 })
    await s3Put(env, bucketName, inputVideoKey, 'video/mp4', src.body as ReadableStream)
  }
  const vttExists = await s3Head(env, bucketName, inputVttKey)
  if (!vttExists) {
    const sub = await fetch(`${baseNext}/api/media/${body.mediaId}/subtitles`)
    if (!sub.ok) return json({ error: 'fetch subtitles failed' }, { status: 502 })
    const text = await sub.text()
    await s3Put(env, bucketName, inputVttKey, 'text/vtt', text)
  }

  // Generate URLs for container: prefer direct R2 signed URLs; fallback到 Worker endpoints（本地dev）
  const inputVideoUrl = await presignS3(env, 'GET', bucketName, inputVideoKey, 600)
  const inputVttUrl = await presignS3(env, 'GET', bucketName, inputVttKey, 600)
  const outputPutUrl = await presignS3(env, 'PUT', bucketName, outputKey, 600, 'video/mp4')

  const payload = {
    jobId,
    mediaId: body.mediaId,
    engine: body.engine,
    // R2 presigned URLs (container无需访问Next/Worker)
    inputVideoUrl,
    inputVttUrl,
    outputPutUrl,
    // 仅使用 S3 直连，容器无需访问 Next/Worker
    engineOptions: body.options || {},
  }

  // Fire-and-forget container call (no await required, but keep for error surfacing)
  const res = await fetch(`${containerBase}/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  console.log('[orchestrator] start job', jobId, 'container=', containerBase, 'status=', res.status)
  if (!res.ok) {
    await env.JOBS.put(jobId, JSON.stringify({ ...doc, status: 'failed', error: `container ${res.status}` }), { expirationTtl: Number(env.JOB_TTL_SECONDS || 86400) })
    return json({ jobId, error: 'container_start_failed' }, { status: 502 })
  }

  // Seed KV with outputKey for后续检测
  await env.JOBS.put(jobId, JSON.stringify({ ...doc, status: 'running', outputKey, mediaId: body.mediaId }), { expirationTtl: Number(env.JOB_TTL_SECONDS || 86400) })
  return json({ jobId })
}

async function handleGetStatus(env: Env, jobId: string) {
  if (!jobId) return json({ error: 'jobId required' }, { status: 400 })
  const raw = await env.JOBS.get(jobId)
  if (!raw) return json({ error: 'not found' }, { status: 404 })
  let doc = JSON.parse(raw) as StatusDoc & { mediaId?: string }
  // 如果未完成且已知 outputKey，检查 R2 是否存在；存在则标记完成并通知 Next（容器无需回调）
  if (doc.status !== 'completed' && doc.outputKey) {
    const head = await s3Head(env, env.S3_BUCKET_NAME || 'vidgen-render', doc.outputKey)
    if (head) {
      doc = { ...doc, status: 'completed', ts: Date.now() }
      await env.JOBS.put(jobId, JSON.stringify(doc), { expirationTtl: Number(env.JOB_TTL_SECONDS || 86400) })
      // 通知 Next（使用对 Next 友好的访问地址）
      const nextBase = (env.NEXT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
      const cbUrl = `${nextBase}/api/render/cf-callback`
      const outputUrl = await presignS3(env, 'GET', env.S3_BUCKETNAME || env.S3_BUCKET_NAME || 'vidgen-render', doc.outputKey, 600)
      const payload = { jobId, mediaId: (doc as any).mediaId || 'unknown', status: 'completed', outputUrl }
      const secret = env.JOB_CALLBACK_HMAC_SECRET || 'dev-secret'
      const signature = await hmacHex(secret, JSON.stringify(payload))
      await fetch(cbUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': signature }, body: JSON.stringify(payload) }).catch(() => {})
    }
  }
  return json(doc)
}

async function handleContainerCallback(env: Env, req: Request) {
  const raw = await req.text()
  const sig = req.headers.get('x-signature') || ''
  if (!(await verifyHmac(env.JOB_CALLBACK_HMAC_SECRET || 'dev-secret', raw, sig))) {
    return json({ error: 'unauthorized' }, { status: 401 })
  }
  const body = JSON.parse(raw) as (Partial<StatusDoc> & { mediaId?: string; nonce?: string; ts?: number })
  // Basic replay guard on nonce
  if (body.nonce) {
    const nonceKey = `nonce:${body.nonce}`
    const exists = await env.JOBS.get(nonceKey)
    if (exists) return json({ ok: true })
    await env.JOBS.put(nonceKey, '1', { expirationTtl: 600 })
  }
  if (!body.jobId || !body.status) return json({ error: 'bad request' }, { status: 400 })
  const existing = await env.JOBS.get(body.jobId)
  const prior = existing ? (JSON.parse(existing) as StatusDoc & { mediaId?: string }) : undefined
  const doc: StatusDoc = {
    jobId: body.jobId,
    status: body.status as JobStatus,
    phase: (body.phase as any) || prior?.phase,
    progress: (body.progress as any) ?? prior?.progress,
    outputKey: body.outputKey || prior?.outputKey,
    error: body.error,
    ts: Date.now(),
  }
  await env.JOBS.put(body.jobId, JSON.stringify({ ...doc, mediaId: prior?.mediaId }), { expirationTtl: Number(env.JOB_TTL_SECONDS || 86400) })
  console.log('[orchestrator] callback', body.jobId, body.status, 'phase=', body.phase, 'progress=', body.progress)

  // On terminal status, notify Next to persist
  if (body.status === 'completed' || body.status === 'failed' || body.status === 'canceled') {
    const baseForNext = (env.ORCHESTRATOR_BASE_URL_NEXT || new URL(req.url).origin).replace(/\/$/, '')
    const outputUrl = `${baseForNext}/artifacts/${body.jobId}`
    const nextBase = (env.NEXT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
    const cbUrl = `${nextBase}/api/render/cf-callback`

    const payload = {
      jobId: body.jobId,
      mediaId: prior?.mediaId || 'unknown',
      status: body.status,
      outputUrl,
    }
    const secret = env.JOB_CALLBACK_HMAC_SECRET || 'dev-secret'
    const signature = await hmacHex(secret, JSON.stringify(payload))
    await fetch(cbUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-signature': signature },
      body: JSON.stringify(payload),
    }).catch(() => {})
    console.log('[orchestrator] notified next', payload.jobId, payload.status)
  }
  return json({ ok: true })
}

async function handleUpload(env: Env, req: Request, jobId: string) {
  // Persist artifact into R2
  const key = `outputs/${jobId}/video.mp4`
  await env.RENDER_BUCKET.put(key, req.body as ReadableStream, {
    httpMetadata: { contentType: 'video/mp4' },
  })
  // Update KV with outputKey
  const existing = await env.JOBS.get(jobId)
  const prior = existing ? (JSON.parse(existing) as StatusDoc & { mediaId?: string }) : undefined
  const doc: StatusDoc = {
    jobId,
    status: prior?.status || 'uploading',
    phase: 'uploading',
    progress: 1,
    outputKey: key,
    ts: Date.now(),
  }
  await env.JOBS.put(jobId, JSON.stringify({ ...doc, mediaId: prior?.mediaId }), { expirationTtl: Number(env.JOB_TTL_SECONDS || 86400) })
  return json({ ok: true, outputKey: key, outputUrl: `/artifacts/${jobId}` })
}

async function handleArtifactGet(env: Env, jobId: string) {
  const key = `outputs/${jobId}/video.mp4`
  const obj = await env.RENDER_BUCKET.get(key)
  if (!obj) return new Response('not found', { status: 404 })
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream' } })
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function verifyHmac(secret: string, data: string, signature: string): Promise<boolean> {
  const expected = await hmacHex(secret, data)
  if (expected.length !== signature.length) return false
  // timing-safe compare
  let ok = 0
  for (let i = 0; i < expected.length; i++) ok |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return ok === 0
}

// --- S3 helpers ---
async function s3Head(env: Env, bucket: string, key: string): Promise<boolean> {
  try {
    const url = await presignS3(env, 'HEAD', bucket, key, 60)
    const r = await fetch(url, { method: 'HEAD' })
    return r.ok
  } catch {
    return false
  }
}

async function s3Put(env: Env, bucket: string, key: string, contentType: string, body: ReadableStream | string): Promise<void> {
  const url = await presignS3(env, 'PUT', bucket, key, 600, contentType)
  const init: RequestInit = { method: 'PUT', headers: { 'content-type': contentType } }
  if (typeof body === 'string') init.body = body
  else init.body = body as ReadableStream
  const r = await fetch(url, init)
  if (!r.ok) throw new Error(`s3Put failed: ${r.status}`)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const { pathname } = url
    // Proxy inputs for fallback mode: /inputs/:mediaId/video|subtitles
    if (req.method === 'GET' && pathname.startsWith('/inputs/')) {
      const parts = pathname.split('/').filter(Boolean) // ['', 'inputs', ':mediaId', 'kind']
      const mediaId = parts[1]
      const kind = parts[2]
      if (!mediaId || !kind) return json({ error: 'bad request' }, { status: 400 })
      const nextBase = (env.NEXT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
      const target = kind === 'video'
        ? `${nextBase}/api/media/${encodeURIComponent(mediaId)}/source`
        : `${nextBase}/api/media/${encodeURIComponent(mediaId)}/subtitles`
      const headers: Record<string,string> = {}
      const range = req.headers.get('range')
      if (range) headers['range'] = range
      const r = await fetch(target, { headers })
      const respHeaders = new Headers()
      // pass through important headers
      const copy = ['content-type','accept-ranges','content-length','content-range','cache-control','etag','last-modified']
      for (const h of copy) {
        const v = r.headers.get(h)
        if (v) respHeaders.set(h, v)
      }
      if (!respHeaders.has('cache-control')) respHeaders.set('cache-control','private, max-age=60')
      return new Response(r.body, { status: r.status, headers: respHeaders })
    }
    if (req.method === 'POST' && pathname === '/jobs') return handleStart(env, req)
    if (req.method === 'GET' && pathname.startsWith('/jobs/')) {
      const parts = pathname.split('/')
      const jobId = parts[parts.length - 1]
      return handleGetStatus(env, jobId)
    }
    if (req.method === 'POST' && pathname === '/callbacks/container') return handleContainerCallback(env, req)
    if (req.method === 'POST' && pathname.startsWith('/upload/')) {
      const jobId = pathname.split('/').pop()!
      return handleUpload(env, req, jobId)
    }
    if (req.method === 'GET' && pathname.startsWith('/artifacts/')) {
      const jobId = pathname.split('/').pop()!
      return handleArtifactGet(env, jobId)
    }
    return json({ error: 'not found' }, { status: 404 })
  },
}
