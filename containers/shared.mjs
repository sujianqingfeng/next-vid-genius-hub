import http from 'node:http'
import { promises as fs } from 'node:fs'
import { makeStatusCallback } from '@app/callback-utils'

export function sendJson(res, code, data) {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(data))
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
  const postUpdate = makeStatusCallback({ callbackUrl, secret, baseFields: { jobId }, fetchImpl })
  async function progress(phase, pct) {
    if (!callbackUrl) return
    const status = phase === 'uploading' ? 'uploading' : 'running'
    await postUpdate(status, { phase, progress: pct })
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

export async function uploadArtifact(url, bufferOrStream, contentType = 'application/octet-stream', headers = {}) {
  if (!url) return
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': contentType, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', ...headers },
    body: bufferOrStream,
  })
  if (!res.ok) {
    let msg = ''
    try { msg = await res.text() } catch {}
    throw new Error(`upload failed: ${res.status} ${msg}`)
  }
}

export function startJsonServer(port, handler, label = 'service') {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${port}`)
      if (req.method === 'POST' && url.pathname === '/render') return handler(req, res)
      return sendJson(res, 404, { error: 'not found' })
    } catch (e) {
      return sendJson(res, 500, { error: 'internal_error', message: e?.message || String(e) })
    }
  })
  server.listen(port, () => console.log(`[${label}] listening on ${port}`))
  return server
}

