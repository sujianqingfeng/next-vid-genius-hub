import http from 'node:http'
import { promises as fs } from 'node:fs'
import { Transform } from 'node:stream'
import { makeStatusCallback } from '@app/job-callbacks'

export function sendJson(res, code, data) {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(data))
}

function createSerialQueue() {
  let tail = Promise.resolve()
  return (fn) => {
    const run = async () => fn()
    // Never break the chain on failures; log and keep going.
    tail = tail.then(run, run).catch((e) => {
      console.error('[callbacks] queued task failed:', e?.message || String(e))
    })
    return tail
  }
}

export async function readJson(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return JSON.parse(raw || '{}')
}

export function makeJobId(prefix = 'job') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function sanitizeEngineOptions(engineOptions = {}) {
  const eo = engineOptions || {}
  const safe = {
    url: eo.url,
    quality: eo.quality,
    source: eo.source,
    templateId: eo.templateId,
    hasTemplateConfig: Boolean(eo.templateConfig),
    hasDefaultProxy: Boolean(eo.defaultProxyUrl),
    proxy: eo.proxy
      ? {
          id: eo.proxy.id,
          protocol: eo.proxy.protocol,
          server: eo.proxy.server,
          port: eo.proxy.port,
          hasNodeUrl: Boolean(eo.proxy.nodeUrl),
          hasCredentials: Boolean(eo.proxy.username && eo.proxy.password),
        }
      : null,
  }
  if (eo.limit != null) safe.limit = eo.limit
  if (eo.channelUrlOrId != null) safe.channelUrlOrId = eo.channelUrlOrId
  return safe
}

export function createStatusHelpers({ callbackUrl, secret, jobId, fetchImpl } = {}) {
  const basePostUpdate = makeStatusCallback({
    callbackUrl,
    secret,
    baseFields: { jobId },
    fetchImpl,
  })
  const enqueue = createSerialQueue()
  const terminalStatuses = new Set(['completed', 'failed', 'canceled'])
  let terminal = false
  let lastProgress = -1
  let lastPhase = null

  const postUpdate = async (status, extra = {}) => {
    if (!callbackUrl) return
    if (terminal && !terminalStatuses.has(status)) return
    return enqueue(async () => {
      if (terminal && !terminalStatuses.has(status)) return
      await basePostUpdate(status, extra)
      if (terminalStatuses.has(status)) terminal = true
    })
  }

  const statusFromPhase = (phase) => {
    // Only use recognized job statuses; otherwise fall back to generic 'running'.
    if (phase === 'fetching_metadata') return 'fetching_metadata'
    if (phase === 'preparing') return 'preparing'
    if (phase === 'uploading') return 'uploading'
    return 'running'
  }

  async function progress(phase, pct) {
    if (!callbackUrl) return
    const p = Math.max(0, Math.min(1, Number(pct) || 0))
    // Keep progress monotonic across phase transitions; avoid regressions like 100% -> 95%.
    if (p < lastProgress) return
    if (p === lastProgress && phase === lastPhase) return
    lastProgress = p
    lastPhase = phase
    const status = statusFromPhase(phase)
    await postUpdate(status, { phase, progress: p })
  }
  return { postUpdate, progress }
}

export async function ensureDirExists(dir) {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch (e) {
    if (e && e.code !== 'EEXIST') throw e
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shouldSetDuplexHalf(body) {
  if (!body) return false
  if (typeof body === 'string') return false
  // Buffer/typed arrays are fine without duplex.
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) return false
  if (body instanceof ArrayBuffer) return false
  if (body instanceof Uint8Array) return false
  // AsyncIterable/streams require duplex in Node fetch.
  return (
    typeof body.getReader === 'function' ||
    typeof body.pipe === 'function' ||
    typeof body[Symbol.asyncIterator] === 'function'
  )
}

function isRetryableUploadStatus(status) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599)
}

export async function uploadArtifact(
  url,
  bodyOrFactory,
  contentType = 'application/octet-stream',
  headers = {},
  options = {},
) {
  if (!url) return
  const maxAttempts =
    Number.isFinite(options?.maxAttempts) && options.maxAttempts > 0
      ? Math.floor(options.maxAttempts)
      : 3
  const baseDelayMs =
    Number.isFinite(options?.baseDelayMs) && options.baseDelayMs > 0
      ? Math.floor(options.baseDelayMs)
      : 1000
  const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null
  const progressIntervalMs =
    Number.isFinite(options?.progressIntervalMs) && options.progressIntervalMs > 0
      ? Math.floor(options.progressIntervalMs)
      : 250

  const parseContentLength = (h) => {
    if (!h) return null
    const v = h['content-length'] ?? h['Content-Length'] ?? h['CONTENT-LENGTH']
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const totalBytesFromBody = (body) => {
    if (!body) return null
    if (typeof body === 'string') return Buffer.byteLength(body)
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) return body.length
    if (body instanceof ArrayBuffer) return body.byteLength
    if (body instanceof Uint8Array) return body.byteLength
    return null
  }
  const isNodeStreamLike = (body) => body && typeof body.pipe === 'function'

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const body = typeof bodyOrFactory === 'function' ? bodyOrFactory() : bodyOrFactory
    try {
      const totalBytes =
        parseContentLength(headers) ??
        totalBytesFromBody(body) ??
        (Number.isFinite(options?.totalBytes) && options.totalBytes > 0
          ? Math.floor(options.totalBytes)
          : null)

      let wrappedBody = body
      if (onProgress && totalBytes != null) {
        if (isNodeStreamLike(body)) {
          let sentBytes = 0
          let lastEmitAt = 0
          const counter = new Transform({
            transform(chunk, _enc, cb) {
              try {
                sentBytes += chunk?.length || 0
                const now = Date.now()
                if (sentBytes >= totalBytes || now - lastEmitAt >= progressIntervalMs) {
                  lastEmitAt = now
                  try {
                    onProgress({ sentBytes, totalBytes })
                  } catch {}
                }
              } catch {}
              cb(null, chunk)
            },
          })
          wrappedBody = body.pipe(counter)
        } else {
          // Best-effort for non-stream bodies.
          try {
            onProgress({ sentBytes: 0, totalBytes })
          } catch {}
        }
      }

      const init = {
        method: 'PUT',
        headers: {
          'content-type': contentType,
          'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
          ...headers,
        },
        body: wrappedBody,
      }
      if (shouldSetDuplexHalf(wrappedBody)) init.duplex = 'half'

      const res = await fetch(url, init)
      if (res.ok) {
        if (onProgress && totalBytes != null && !isNodeStreamLike(body)) {
          try {
            onProgress({ sentBytes: totalBytes, totalBytes })
          } catch {}
        }
        return
      }

      let msg = ''
      try {
        msg = await res.text()
      } catch {}

      if (attempt < maxAttempts && isRetryableUploadStatus(res.status)) {
        const delayMs = Math.min(30_000, baseDelayMs * 2 ** (attempt - 1))
        console.warn(
          `[upload] retrying attempt=${attempt + 1}/${maxAttempts} status=${res.status} delayMs=${delayMs}`,
        )
        await sleep(delayMs)
        continue
      }

      throw new Error(`upload failed: ${res.status} ${msg}`)
    } catch (error) {
      const msg = error?.message || String(error)
      if (attempt < maxAttempts) {
        const delayMs = Math.min(30_000, baseDelayMs * 2 ** (attempt - 1))
        console.warn(
          `[upload] retrying attempt=${attempt + 1}/${maxAttempts} error=${msg} delayMs=${delayMs}`,
        )
        await sleep(delayMs)
        continue
      }
      throw error
    }
  }
}

export function startJsonServer(port, handler, label = 'service') {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${port}`)
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
        return sendJson(res, 200, { ok: true, service: label })
      }
      if (req.method === 'POST' && url.pathname === '/render') return handler(req, res)
      return sendJson(res, 404, { error: 'not found' })
    } catch (e) {
      return sendJson(res, 500, { error: 'internal_error', message: e?.message || String(e) })
    }
  })
  server.listen(port, () => console.log(`[${label}] listening on ${port}`))
  return server
}
