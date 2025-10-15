export interface Env {
  JOBS: KVNamespace
  RENDER_BUCKET?: R2Bucket
  JOB_TTL_SECONDS?: string
  CONTAINER_BASE_URL?: string
  CONTAINER_BASE_URL_REMOTION?: string
  CONTAINER_BASE_URL_DOWNLOADER?: string
  CONTAINER_BASE_URL_AUDIO?: string
  NEXT_BASE_URL?: string
  JOB_CALLBACK_HMAC_SECRET?: string
  // Generic S3-compatible config (R2/MinIO)
  S3_ENDPOINT?: string
  S3_INTERNAL_ENDPOINT?: string
  S3_ACCESS_KEY_ID?: string
  S3_SECRET_ACCESS_KEY?: string
  S3_BUCKET_NAME?: string
  S3_STYLE?: 'vhost' | 'path'
  S3_REGION?: string
  RENDER_JOB_DO?: DurableObjectNamespace
  // Workers AI (REST credentials) for ASR pipeline
  CF_AI_ACCOUNT_ID?: string
  CF_AI_API_TOKEN?: string
}

type EngineId = 'burner-ffmpeg' | 'renderer-remotion' | 'media-downloader' | 'audio-transcoder' | 'asr-pipeline'

type JobStatus =
  | 'queued'
  | 'fetching_metadata'
  | 'preparing'
  | 'running'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'canceled'

const TERMINAL_STATUSES: JobStatus[] = ['completed', 'failed', 'canceled']

interface StartBody {
  mediaId: string
  engine: EngineId
  options?: Record<string, unknown>
}

interface StatusDoc {
  jobId: string
  status: JobStatus
  phase?: 'fetching_metadata' | 'preparing' | 'running' | 'uploading'
  progress?: number
  outputKey?: string
  outputMetadataKey?: string
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

function jobStub(env: Env, jobId: string) {
  if (!env.RENDER_JOB_DO) return null
  const id = env.RENDER_JOB_DO.idFromName(jobId)
  return env.RENDER_JOB_DO.get(id)
}

function containerS3Endpoint(endpoint?: string, override?: string): string | undefined {
  const base = override || endpoint
  if (!base) return undefined
  try {
    const url = new URL(base)
    const host = url.hostname.toLowerCase()
    if (host === '127.0.0.1' || host === 'localhost') {
      url.hostname = 'minio'
      return url.toString()
    }
    return base
  } catch {
    return base
  }
}

// ========= R2 S3 Pre-sign (SigV4) =========
async function presignS3(
  env: Env,
  method: 'GET' | 'PUT' | 'HEAD',
  bucket: string,
  key: string | undefined,
  expiresSec: number,
  contentType?: string,
  endpointOverride?: string,
): Promise<string> {
  const endpoint = endpointOverride || env.S3_ENDPOINT
  if (!endpoint || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error('S3 credentials not configured')
  }
  const endpointHost = endpoint.replace(/^https?:\/\//, '')
  const style = (env.S3_STYLE || 'vhost') as 'vhost' | 'path'
  const region = env.S3_REGION || 'auto'
  const host = style === 'vhost' ? `${bucket}.${endpointHost}` : endpointHost
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\..*/g, '') + 'Z' // YYYYMMDDTHHMMSSZ
  const date = amzDate.slice(0, 8)
  const service = 's3'
  const algorithm = 'AWS4-HMAC-SHA256'
  const credential = `${env.S3_ACCESS_KEY_ID}/${date}/${region}/${service}/aws4_request`
  const headerEntries: Array<[string, string]> = [['host', host]]
  if (method === 'PUT') {
    if (contentType) headerEntries.push(['content-type', contentType])
    headerEntries.push(['x-amz-content-sha256', 'UNSIGNED-PAYLOAD'])
  }
  headerEntries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const signedHeaders = headerEntries.map(([name]) => name).join(';') || 'host'
  const encodeKey = (value: string) => encodeURIComponent(value).replace(/%2F/g, '/').replace(/%7E/g, '~')
  const canonicalUri = (() => {
    if (style === 'vhost') {
      if (!key) return '/'
      return `/${encodeKey(key)}`
    }
    if (!key) return `/${bucket}`
    return `/${bucket}/${encodeKey(key)}`
  })()
  const enc = (s: string) => encodeURIComponent(s).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  const qpObj: Record<string, string> = {
    'X-Amz-Algorithm': algorithm,
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSec),
    'X-Amz-SignedHeaders': signedHeaders,
  }
  const canonicalQuery = Object.keys(qpObj)
    .sort()
    .map((k) => `${enc(k)}=${enc(qpObj[k])}`)
    .join('&')
  const canonicalHeaders = headerEntries.map(([name, value]) => `${name}:${value}\n`).join('')
  const payloadHash = 'UNSIGNED-PAYLOAD'
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const hash = await sha256Hex(canonicalRequest)
  const stringToSign = [algorithm, amzDate, `${date}/${region}/${service}/aws4_request`, hash].join('\n')

  const signingKey = await getSigningKey(env.S3_SECRET_ACCESS_KEY!, date, region, service)
  const signature = await hmacHexRaw(signingKey, stringToSign)
  const scheme = endpoint.startsWith('http://') ? 'http' : 'https'
  const url = `${scheme}://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
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
  // Choose container base by engine
  let containerBase: string
  if (body.engine === 'renderer-remotion') {
    containerBase =
      (env as any).CONTAINER_BASE_URL_REMOTION ||
      env.CONTAINER_BASE_URL ||
      'http://localhost:8080'
  } else if (body.engine === 'media-downloader') {
    containerBase =
      env.CONTAINER_BASE_URL_DOWNLOADER ||
      env.CONTAINER_BASE_URL ||
      'http://localhost:8080'
  } else if (body.engine === 'audio-transcoder') {
    containerBase =
      (env as any).CONTAINER_BASE_URL_AUDIO ||
      env.CONTAINER_BASE_URL ||
      'http://localhost:8080'
  } else if (body.engine === 'asr-pipeline') {
    // Phase 2: chain audio-transcoder + Workers AI inside worker
    containerBase =
      (env as any).CONTAINER_BASE_URL_AUDIO ||
      env.CONTAINER_BASE_URL ||
      'http://localhost:8080'
  } else {
    containerBase = env.CONTAINER_BASE_URL || 'http://localhost:8080'
  }
  containerBase = containerBase.replace(/\/$/, '')
  const baseSelfForContainer = (env.ORCHESTRATOR_BASE_URL_CONTAINER || new URL(req.url).origin).replace(/\/$/, '')

  // Prepare payload for container
  // Ensure inputs exist in R2 (Worker fetches from Next, container不会访问Next)
  const bucketName = env.S3_BUCKET_NAME || 'vidgen-render'
  const isDownloader = body.engine === 'media-downloader'
  const isAudioTranscoder = body.engine === 'audio-transcoder'
  const isAsrPipeline = body.engine === 'asr-pipeline'
  const jobS3Endpoint = containerS3Endpoint(env.S3_ENDPOINT, env.S3_INTERNAL_ENDPOINT)
  const inputVideoKey = `inputs/videos/${body.mediaId}.mp4`
  const inputVttKey = `inputs/subtitles/${body.mediaId}.vtt`
  const inputDataKey = `inputs/comments/${body.mediaId}.json`
  const outputVideoKey = isDownloader
    ? `downloads/${body.mediaId}/${jobId}/video.mp4`
    : `outputs/by-media/${body.mediaId}/${jobId}/video.mp4`
  const outputAudioKey = isDownloader
    ? `downloads/${body.mediaId}/${jobId}/audio.mp3`
    : ((isAudioTranscoder || isAsrPipeline) ? `asr/processed/${body.mediaId}/${jobId}/audio.mp3` : undefined)
  const outputMetadataKey = isDownloader ? `downloads/${body.mediaId}/${jobId}/metadata.json` : undefined

  let inputVideoUrl: string | undefined
  let inputVttUrl: string | undefined
  let inputDataUrl: string | undefined
  if (!isDownloader && !isAudioTranscoder) {
    const mirrorInputs = (env.MIRROR_INPUTS || 'true').toLowerCase() !== 'false'
    if (mirrorInputs) {
      const videoExists = await s3Head(env, bucketName, inputVideoKey)
      if (!videoExists) {
        const src = await fetch(`${baseNext}/api/media/${body.mediaId}/source`)
        if (!src.ok || !src.body) return json({ error: 'fetch source failed' }, { status: 502 })
        await s3Put(env, bucketName, inputVideoKey, 'video/mp4', src.body as ReadableStream)
      }
      if (body.engine === 'burner-ffmpeg') {
        const vttExists = await s3Head(env, bucketName, inputVttKey)
        if (!vttExists) {
          const sub = await fetch(`${baseNext}/api/media/${body.mediaId}/subtitles`)
          if (!sub.ok) return json({ error: 'fetch subtitles failed' }, { status: 502 })
          const text = await sub.text()
          await s3Put(env, bucketName, inputVttKey, 'text/vtt', text)
        }
      } else if (body.engine === 'renderer-remotion') {
        const dataExists = await s3Head(env, bucketName, inputDataKey)
        if (!dataExists) {
          const r = await fetch(`${baseNext}/api/media/${body.mediaId}/comments-data`)
          if (!r.ok) return json({ error: 'fetch comments-data failed' }, { status: 502 })
          const txt = await r.text()
          await s3Put(env, bucketName, inputDataKey, 'application/json', txt)
        }
      }
      inputVideoUrl = await presignS3(env, 'GET', bucketName, inputVideoKey, 600, undefined, jobS3Endpoint)
      if (body.engine === 'burner-ffmpeg') {
        inputVttUrl = await presignS3(env, 'GET', bucketName, inputVttKey, 600, undefined, jobS3Endpoint)
      } else if (body.engine === 'renderer-remotion') {
        inputDataUrl = await presignS3(env, 'GET', bucketName, inputDataKey, 600, undefined, jobS3Endpoint)
      }
    } else {
      inputVideoUrl = `${baseSelfForContainer}/inputs/${encodeURIComponent(body.mediaId)}/video`
      if (body.engine === 'burner-ffmpeg') {
        inputVttUrl = `${baseSelfForContainer}/inputs/${encodeURIComponent(body.mediaId)}/subtitles`
      } else if (body.engine === 'renderer-remotion') {
        inputDataUrl = `${baseSelfForContainer}/inputs/${encodeURIComponent(body.mediaId)}/comments`
      }
    }
  }

  const putTtl = Number(env.PUT_EXPIRES || 600)
  const outputVideoPutUrl = (isAudioTranscoder || isAsrPipeline)
    ? undefined
    : await presignS3(env, 'PUT', bucketName, outputVideoKey, putTtl, 'video/mp4', jobS3Endpoint)
  const outputAudioPutUrl = outputAudioKey
    ? await presignS3(env, 'PUT', bucketName, outputAudioKey, putTtl, 'audio/mpeg', jobS3Endpoint)
    : undefined
  const outputMetadataPutUrl = outputMetadataKey
    ? await presignS3(env, 'PUT', bucketName, outputMetadataKey, putTtl, 'application/json', jobS3Endpoint)
    : undefined

  const doc: StatusDoc = { jobId, status: 'queued', ts: now } as StatusDoc & {
    mediaId?: string
    outputAudioKey?: string
    outputMetadataKey?: string
  }
  ;(doc as any).mediaId = body.mediaId
  ;(doc as any).outputKey = outputVideoKey
  if (outputAudioKey) (doc as any).outputAudioKey = outputAudioKey
  if (outputMetadataKey) (doc as any).outputMetadataKey = outputMetadataKey
  await env.JOBS.put(jobId, JSON.stringify(doc), { expirationTtl: Number(env.JOB_TTL_SECONDS || 86400) })

  const payload: any = {
    jobId,
    mediaId: body.mediaId,
    engine: isAsrPipeline ? 'audio-transcoder' : body.engine,
    // Use container-visible base URL so the callback reaches the Worker in dev/prod
    callbackUrl: `${baseSelfForContainer}/callbacks/container`,
    engineOptions: body.options || {},
  }

  if (isDownloader) {
    payload.outputVideoPutUrl = outputVideoPutUrl
    if (outputAudioPutUrl) payload.outputAudioPutUrl = outputAudioPutUrl
    payload.outputVideoKey = outputVideoKey
    if (outputAudioKey) payload.outputAudioKey = outputAudioKey
    if (outputMetadataPutUrl) payload.outputMetadataPutUrl = outputMetadataPutUrl
    if (outputMetadataKey) payload.outputMetadataKey = outputMetadataKey
  } else if (isAudioTranscoder) {
    // For audio transcoder, inputs: audio only; outputs: audio only
    // Inputs: prefer sourceKey -> presign GET; else options.sourceUrl
    let inputAudioUrl: string | undefined
    const opts = (body.options || {}) as any
    if (opts.sourceKey) {
      inputAudioUrl = await presignS3(env, 'GET', bucketName, String(opts.sourceKey), 600, undefined, jobS3Endpoint)
    } else if (opts.sourceUrl) {
      inputAudioUrl = String(opts.sourceUrl)
    }
    if (!inputAudioUrl || !outputAudioPutUrl) {
      return json({ error: 'audio-transcoder missing input or output URL' }, { status: 400 })
    }
    payload.inputAudioUrl = inputAudioUrl
    payload.outputAudioPutUrl = outputAudioPutUrl
  } else {
    payload.inputVideoUrl = inputVideoUrl
    if (body.engine === 'burner-ffmpeg') {
      payload.inputVttUrl = inputVttUrl
    } else if (body.engine === 'renderer-remotion') {
      payload.inputDataUrl = inputDataUrl
    }
    payload.outputPutUrl = outputVideoPutUrl
  }

  // Fire-and-forget container call (no await required, but keep for error surfacing)
  const res = await fetch(`${containerBase}/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  console.log('[orchestrator] start job', jobId, 'container=', containerBase, 'status=', res.status)
  if (!res.ok) {
    return json({ jobId, error: 'container_start_failed' }, { status: 502 })
  }

  // Initialize Durable Object
  const stub = jobStub(env, jobId)
  if (stub) {
    const initPayload: Record<string, unknown> = {
      jobId,
      mediaId: body.mediaId,
      engine: body.engine,
      status: 'running',
      outputKey: outputVideoKey,
    }
    if (outputAudioKey) initPayload.outputAudioKey = outputAudioKey
    if (outputMetadataKey) initPayload.outputMetadataKey = outputMetadataKey
    // Persist initial options for ASR pipeline (e.g., model/thresholds)
    if (isAsrPipeline) {
      initPayload['metadata'] = { ...(body.options || {}) }
    }
    await stub.fetch('https://do/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(initPayload),
    })
  } else {
    // fallback to KV (should not happen in prod)
    await env.JOBS.put(
      jobId,
      JSON.stringify({
        ...doc,
        status: 'running',
        outputKey: outputVideoKey,
        outputAudioKey,
        outputMetadataKey,
        mediaId: body.mediaId,
        engine: body.engine,
      }),
      { expirationTtl: Number(env.JOB_TTL_SECONDS || 86400) },
    )
  }
  return json({ jobId })
}

async function handleGetStatus(env: Env, jobId: string) {
  if (!jobId) return json({ error: 'jobId required' }, { status: 400 })
  const stub = jobStub(env, jobId)
  if (stub) {
    const r = await stub.fetch('https://do/')
    return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json' } })
  }
  // fallback to KV
  const raw = await env.JOBS.get(jobId)
  if (!raw) return json({ error: 'not found' }, { status: 404 })
  return new Response(raw, { headers: { 'content-type': 'application/json' } })
}

async function handleContainerCallback(env: Env, req: Request) {
  const raw = await req.text()
  const sig = req.headers.get('x-signature') || ''
  if (!(await verifyHmac(env.JOB_CALLBACK_HMAC_SECRET || 'dev-secret', raw, sig))) {
    return json({ error: 'unauthorized' }, { status: 401 })
  }
  const body = JSON.parse(raw) as (Partial<StatusDoc> & {
    mediaId?: string
    nonce?: string
    ts?: number
    outputs?: {
      video?: { key?: string }
      audio?: { key?: string }
    }
  })
  // Basic replay guard on nonce
  if (body.nonce) {
    const nonceKey = `nonce:${body.nonce}`
    const exists = await env.JOBS.get(nonceKey)
    if (exists) return json({ ok: true })
    await env.JOBS.put(nonceKey, '1', { expirationTtl: 600 })
  }
  if (!body.jobId || !body.status) return json({ error: 'bad request' }, { status: 400 })
  console.log('[orchestrator] callback', body.jobId, body.status, 'phase=', body.phase, 'progress=', body.progress)
  const stub = jobStub(env, body.jobId)
  if (stub) {
    const r = await stub.fetch('https://do/progress', { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw })
    // After progress update, if this is an ASR pipeline and audio stage is completed, trigger ASR step
    try {
      const stateResp = await stub.fetch('https://do/')
      if (stateResp.ok) {
        const doc = (await stateResp.json()) as any
        if (doc?.engine === 'asr-pipeline' && (body.status === 'completed' || body.status === 'uploading')) {
          // Guard: if VTT already exists, skip
          const hasVtt = Boolean(doc?.outputs?.vtt?.key)
          if (!hasVtt) {
            await runAsrForPipeline(env, doc)
          }
        }
      }
    } catch (e) {
      console.error('[asr-pipeline] chain error:', (e as Error)?.message || String(e))
    }
    return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json' } })
  }
  return json({ ok: true })
}

async function runAsrForPipeline(env: Env, doc: any) {
  const bucket = env.S3_BUCKET_NAME || 'vidgen-render'
  const jobId = doc.jobId
  const audioKey: string | undefined = doc.outputAudioKey || doc.outputs?.audio?.key
  if (!audioKey) throw new Error('asr-pipeline: missing outputAudioKey')
  if (!env.CF_AI_ACCOUNT_ID || !env.CF_AI_API_TOKEN) throw new Error('asr-pipeline: Workers AI credentials not configured')

  // Fetch downsampled audio bytes via presigned GET
  const audioUrl = await presignS3(env, 'GET', bucket, audioKey, 600)
  const audioResp = await fetch(audioUrl)
  if (!audioResp.ok) throw new Error(`fetch audio failed: ${audioResp.status}`)
  const audioBuf = await audioResp.arrayBuffer()

  // Decide model
  const model: string = (doc?.metadata?.model as string) || '@cf/openai/whisper-tiny-en'

  // Call Workers AI Whisper via REST
  const runUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_AI_ACCOUNT_ID}/ai/run/${encodeURIComponent(model)}`
  const r = await fetch(runUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_AI_API_TOKEN}`,
      'Content-Type': 'application/octet-stream',
      Accept: 'application/json',
    },
    body: audioBuf,
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`Workers AI ASR failed: ${r.status} ${t}`)
  }
  const result = await r.json() as any
  let vtt = ''
  let words: unknown | undefined
  if (result?.result?.vtt || result?.vtt) {
    vtt = result?.result?.vtt || result?.vtt
    words = result?.result?.words || result?.words
  } else if (result?.result?.text || result?.text) {
    const text = result?.result?.text || result?.text
    vtt = `WEBVTT\n\n00:00:00.000 --> 00:00:03.000\n${String(text).trim()}\n`
    words = result?.result?.words || result?.words
  } else {
    throw new Error('Workers AI ASR: unexpected response format')
  }

  // Store into R2
  const vttKey = `asr/results/by-media/${doc.mediaId || 'unknown'}/${jobId}/transcript.vtt`
  await s3Put(env, bucket, vttKey, 'text/vtt', String(vtt))

  let wordsKey: string | undefined
  if (words && (Array.isArray(words) ? words.length > 0 : true)) {
    wordsKey = `asr/results/by-media/${doc.mediaId || 'unknown'}/${jobId}/words.json`
    await s3Put(env, bucket, wordsKey, 'application/json', JSON.stringify(words))
  }

  // Update DO state with outputs
  const stub = jobStub(env, jobId)
  if (stub) {
    const outputs: any = { vtt: { key: vttKey } }
    if (wordsKey) outputs.words = { key: wordsKey }
    const p = {
      jobId,
      status: 'completed',
      outputs,
      ts: Date.now(),
    }
    await stub.fetch('https://do/progress', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) })
  }
}

async function handleUpload(env: Env, req: Request, jobId: string) {
  // 依据 DO/KV 中的 outputKey 决定最终存储路径（包含 mediaId）
  let outputKey = `outputs/${jobId}/video.mp4`
  try {
    const stub = jobStub(env, jobId)
    if (stub) {
      const r = await stub.fetch('https://do/')
      if (r.ok) {
        const doc = (await r.json()) as any
        if (doc?.outputKey) outputKey = doc.outputKey
      }
    } else {
      const raw = await env.JOBS.get(jobId)
      if (raw) {
        const doc = JSON.parse(raw) as any
        if (doc?.outputKey) outputKey = doc.outputKey
      }
    }
  } catch {}

  // Persist artifact into R2
  await env.RENDER_BUCKET.put(outputKey, req.body as ReadableStream, {
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
    outputKey,
    ts: Date.now(),
  }
  await env.JOBS.put(jobId, JSON.stringify({ ...doc, mediaId: prior?.mediaId }), { expirationTtl: Number(env.JOB_TTL_SECONDS || 86400) })
  return json({ ok: true, outputKey, outputUrl: `/artifacts/${jobId}` })
}

async function handleArtifactGet(env: Env, req: Request, jobId: string) {
  // 优先从 DO/KV 获取 outputKey（包含 mediaId 的归属路径）
  let key = `outputs/${jobId}/video.mp4`
  try {
    const stub = jobStub(env, jobId)
    if (stub) {
      const r = await stub.fetch('https://do/')
      if (r.ok) {
        const doc = (await r.json()) as any
        if (doc?.outputKey) key = doc.outputKey
      }
    } else {
      const raw = await env.JOBS.get(jobId)
      if (raw) {
        const doc = JSON.parse(raw) as any
        if (doc?.outputKey) key = doc.outputKey
      }
    }
  } catch {}
  const range = req.headers.get('range')

  // 首选：若配置了 S3_ENDPOINT（R2 S3 或 MinIO），通过 S3 预签名直读，适配开发场景
  if (env.S3_ENDPOINT && env.S3_BUCKET_NAME) {
    const url = await presignS3(env, 'GET', env.S3_BUCKET_NAME, key, 600)
    const headers: Record<string, string> = {}
    if (range) headers['range'] = range
    const r = await fetch(url, { headers })
    const respHeaders = new Headers()
    const copy = ['content-type','accept-ranges','content-length','content-range','cache-control','etag','last-modified']
    for (const h of copy) {
      const v = r.headers.get(h)
      if (v) respHeaders.set(h, v)
    }
    if (!respHeaders.has('cache-control')) respHeaders.set('cache-control','private, max-age=60')
    return new Response(r.body, { status: r.status, headers: respHeaders })
  }

  // 其次：R2 绑定直读（生产常见路径）
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/)
    if (!m) return json({ error: 'invalid range' }, { status: 400 })
    const startStr = m[1]
    const endStr = m[2]
    const head = await env.RENDER_BUCKET!.head(key)
    if (!head) return new Response('not found', { status: 404 })
    const size = head.size
    let start: number
    let end: number
    if (startStr === '' && endStr) {
      const suffix = parseInt(endStr, 10)
      start = Math.max(size - suffix, 0)
      end = size - 1
    } else {
      start = parseInt(startStr, 10)
      end = endStr ? parseInt(endStr, 10) : size - 1
    }
    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start) {
      return json({ error: 'invalid range' }, { status: 416 })
    }
    if (end >= size) end = size - 1
    const len = end - start + 1
    const part = await env.RENDER_BUCKET!.get(key, { range: { offset: start, length: len } })
    if (!part) return new Response('not found', { status: 404 })
    const h = new Headers()
    h.set('content-type', part.httpMetadata?.contentType || 'video/mp4')
    h.set('accept-ranges', 'bytes')
    h.set('content-length', String(len))
    h.set('content-range', `bytes ${start}-${end}/${size}`)
    return new Response(part.body, { status: 206, headers: h })
  }
  const obj = await env.RENDER_BUCKET!.get(key)
  if (!obj) return new Response('not found', { status: 404 })
  const h = new Headers()
  h.set('content-type', obj.httpMetadata?.contentType || 'video/mp4')
  h.set('accept-ranges', 'bytes')
  return new Response(obj.body, { headers: h })
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
  const headers: Record<string, string> = {
    'content-type': contentType,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD'
  }
  const init: RequestInit = { method: 'PUT', headers }
  if (typeof body === 'string') {
    init.body = body
  } else {
    // Miniflare/wrangler 对 ReadableStream 直传可能存在兼容问题，这里转 ArrayBuffer 以提高兼容性
    try {
      init.body = await new Response(body).arrayBuffer()
    } catch {
      // 兜底转文本
      init.body = await new Response(body).text()
    }
  }
  const r = await fetch(url, init)
  if (!r.ok) {
    let msg = ''
    try { msg = await r.text() } catch {}
    console.error('[s3Put] PUT', url.split('?')[0], r.status, msg)
    throw new Error(`s3Put failed: ${r.status}`)
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const { pathname } = url
    if (req.method === 'GET' && pathname === '/debug/presign') {
      const key = url.searchParams.get('key') || `debug/${Date.now()}.txt`
      const contentType = url.searchParams.get('contentType') || 'text/plain'
      try {
        const putUrl = await presignS3(env, 'PUT', env.S3_BUCKET_NAME || 'vidgen-render', key, 600, contentType)
        const getUrl = await presignS3(env, 'GET', env.S3_BUCKET_NAME || 'vidgen-render', key, 600)
        return json({
          key,
          style: env.S3_STYLE || 'vhost',
          region: env.S3_REGION || 'us-east-1',
          endpoint: env.S3_ENDPOINT,
          putUrl,
          getUrl,
          curlPut: `curl -v -X PUT '${putUrl}' --data-binary 'hello'`,
        })
      } catch (e) {
        return json({ error: (e as Error).message }, { status: 500 })
      }
    }
    // Proxy inputs for fallback mode: /inputs/:mediaId/video|subtitles
    if (req.method === 'GET' && pathname.startsWith('/inputs/')) {
      const parts = pathname.split('/').filter(Boolean) // ['', 'inputs', ':mediaId', 'kind']
      const mediaId = parts[1]
      const kind = parts[2]
      if (!mediaId || !kind) return json({ error: 'bad request' }, { status: 400 })
      const nextBase = (env.NEXT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
      const target = kind === 'video'
        ? `${nextBase}/api/media/${encodeURIComponent(mediaId)}/source`
        : kind === 'subtitles'
          ? `${nextBase}/api/media/${encodeURIComponent(mediaId)}/subtitles`
          : kind === 'comments'
            ? `${nextBase}/api/media/${encodeURIComponent(mediaId)}/comments-data`
            : ''
      if (!target) return json({ error: 'bad request' }, { status: 400 })
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
      return handleArtifactGet(env, req, jobId)
    }
    return json({ error: 'not found' }, { status: 404 })
  },
}

// ---------------- Durable Object for strong-consistent job state ----------------
export class RenderJobDO {
  state: DurableObjectState
  env: Env
  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  async fetch(req: Request) : Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname
    if (req.method === 'POST' && path.endsWith('/init')) {
      const body = await req.json() as any
      const doc = {
        jobId: body.jobId,
        mediaId: body.mediaId,
        engine: body.engine,
        status: body.status || 'queued',
        outputKey: body.outputKey,
        outputAudioKey: body.outputAudioKey,
        outputMetadataKey: body.outputMetadataKey,
        metadata: body.metadata,
        ts: Date.now(),
      }
      await this.state.storage.put('job', doc)
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
    }
    if (req.method === 'POST' && path.endsWith('/progress')) {
      const body = await req.json() as any
      const doc = (await this.state.storage.get('job')) as any || {}
      const next = {
        ...doc,
        jobId: body.jobId || doc.jobId,
        status: body.status || doc.status,
        phase: body.phase ?? doc.phase,
        progress: body.progress ?? doc.progress,
        error: body.error ?? doc.error,
        outputKey: body.outputKey ?? doc.outputKey,
        outputAudioKey: body.outputAudioKey ?? doc.outputAudioKey,
        outputMetadataKey: body.outputMetadataKey ?? doc.outputMetadataKey,
        outputs: body.outputs ?? doc.outputs,
        metadata: body.metadata ?? doc.metadata,
        ts: Date.now(),
      }
      await this.state.storage.put('job', next)
      const shouldNotify =
        TERMINAL_STATUSES.includes(next.status) &&
        !next.nextNotified &&
        (next.status !== 'completed' || Boolean(next.outputKey))
      if (shouldNotify) {
        await this.notifyNext(next)
        next.nextNotified = true
        await this.state.storage.put('job', next)
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
    }
  if (req.method === 'GET') {
      let doc = (await this.state.storage.get('job')) as any
      if (!doc) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } })
      // Auto-complete if expected outputs exist in S3
      if (doc.status !== 'completed') {
        const bucket = this.env.S3_BUCKET_NAME || 'vidgen-render'
        let shouldComplete = false

        // 1) Standard video output
        if (doc.outputKey) {
          const exists = await s3Head(this.env, bucket, doc.outputKey)
          if (exists) shouldComplete = true
        }

        // 2) Comments-only (media-downloader) metadata output
        if (!shouldComplete && doc.engine === 'media-downloader' && doc.outputMetadataKey) {
          const metaExists = await s3Head(this.env, bucket, doc.outputMetadataKey)
          if (metaExists) {
            shouldComplete = true
            // Populate outputs with presigned URLs so clients can finalize without waiting for callbacks
            doc.outputs = doc.outputs || {}
            doc.outputs.metadata = {
              key: doc.outputMetadataKey,
              url: await presignS3(this.env, 'GET', bucket, doc.outputMetadataKey, 600),
            }
            if (doc.outputAudioKey) {
              const audioExists = await s3Head(this.env, bucket, doc.outputAudioKey)
              if (audioExists) {
                doc.outputs.audio = {
                  key: doc.outputAudioKey,
                  url: await presignS3(this.env, 'GET', bucket, doc.outputAudioKey, 600),
                }
              }
            }
          }
        }

        if (shouldComplete) {
          // Mark job as fully completed and normalize state
          doc.status = 'completed'
          doc.phase = undefined
          doc.progress = 1
          doc.ts = Date.now()
          await this.state.storage.put('job', doc)

          // Mirror progress handler gating: only notify Next on completed when a video output exists
          const shouldNotify =
            TERMINAL_STATUSES.includes(doc.status) &&
            !doc.nextNotified &&
            (doc.status !== 'completed' || Boolean(doc.outputKey))

          if (shouldNotify) {
            await this.notifyNext(doc)
            doc.nextNotified = true
            await this.state.storage.put('job', doc)
          }
        }
      }
      // If job is already completed but retained a stale phase/progress from earlier stages,
      // normalize the response so clients display a final 100% without an active phase.
      if (doc.status === 'completed') {
        if (doc.phase) delete doc.phase
        if (doc.progress !== 1) doc.progress = 1
      }
      // Enrich outputs with presigned URLs for asr-pipeline artifacts
      try {
        const bucket = this.env.S3_BUCKET_NAME || 'vidgen-render'
        if (doc.engine === 'asr-pipeline') {
          if (doc.outputs?.vtt?.key) {
            doc.outputs.vtt.url = await presignS3(this.env, 'GET', bucket, doc.outputs.vtt.key, 600)
          }
          if (doc.outputs?.words?.key) {
            doc.outputs.words.url = await presignS3(this.env, 'GET', bucket, doc.outputs.words.key, 600)
          }
          if (!doc.outputs?.audio && doc.outputAudioKey) {
            // Provide audio presigned URL for debugging if needed
            doc.outputs = doc.outputs || {}
            doc.outputs.audio = { key: doc.outputAudioKey, url: await presignS3(this.env, 'GET', bucket, doc.outputAudioKey, 600) }
          }
        }
      } catch {}
      return new Response(JSON.stringify(doc), { headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } })
  }

  private async notifyNext(doc: any) {
    const nextBase = (this.env.NEXT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
    const cbUrl = `${nextBase}/api/render/cf-callback`
    const bucket = this.env.S3_BUCKET_NAME || 'vidgen-render'
    const payload: Record<string, unknown> = {
      jobId: doc.jobId,
      mediaId: doc.mediaId || 'unknown',
      engine: doc.engine,
      status: doc.status || 'completed',
    }

    if (doc.error) {
      payload.error = doc.error
    }

    if (doc.engine === 'media-downloader') {
      const outputs: Record<string, unknown> = {}
      // Only include video output if the container actually sent it
      // Comments-only: outputs.video will be absent; video download: outputs.video exists
      const hasVideoInOutputs = doc.outputs && 'video' in doc.outputs
      if (hasVideoInOutputs && doc.outputKey) {
        outputs.video = {
          key: doc.outputKey,
          url: await presignS3(this.env, 'GET', bucket, doc.outputKey, 600),
        }
      }
      const audioKey = doc.outputAudioKey || doc.outputs?.audio?.key
      if (audioKey) {
        outputs.audio = {
          key: audioKey,
          url: await presignS3(this.env, 'GET', bucket, audioKey, 600),
        }
      }
      const metadataKey = doc.outputMetadataKey || doc.outputs?.metadata?.key
      if (metadataKey) {
        outputs.metadata = {
          key: metadataKey,
          url: await presignS3(this.env, 'GET', bucket, metadataKey, 600),
        }
      }
      payload.outputs = outputs
      if (doc.metadata) payload.metadata = doc.metadata
    } else if (doc.outputKey) {
      payload.outputKey = doc.outputKey
      payload.outputUrl = await presignS3(this.env, 'GET', bucket, doc.outputKey, 600)
    }

    const secret = this.env.JOB_CALLBACK_HMAC_SECRET || 'dev-secret'
    const signature = await hmacHex(secret, JSON.stringify(payload))
    await fetch(cbUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': signature }, body: JSON.stringify(payload) }).catch(() => {})
  }
}
