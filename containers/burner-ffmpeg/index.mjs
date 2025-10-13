import http from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import crypto from 'node:crypto'
import { renderVideoWithSubtitles } from '@app/media-subtitles'

const PORT = process.env.PORT || 8080

function sendJson(res, code, data) {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(data))
}

function hmacHex(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex')
}

function randomNonce() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

async function handleRender(req, res) {
  let body = ''
  for await (const chunk of req) body += chunk
  const payload = JSON.parse(body)
  const jobId = payload?.jobId || `job_${Math.random().toString(36).slice(2, 10)}`
  console.log(`[render] job=${jobId} engineOptions=${JSON.stringify(payload.engineOptions || {})}`)
  sendJson(res, 202, { jobId })

  const { inputVideoUrl, inputVttUrl, outputPutUrl, engineOptions = {}, callbackUrl } = payload
  if (!inputVideoUrl || !inputVttUrl || !outputPutUrl) {
    console.error('[render] missing required URLs in payload')
    return
  }

  const secret = process.env.JOB_CALLBACK_HMAC_SECRET || 'dev-secret'
  const progress = async (phase, pct) => {
    if (!callbackUrl) return
    const p = { jobId, status: phase === 'uploading' ? 'uploading' : 'running', phase, progress: pct, ts: Date.now(), nonce: randomNonce() }
    const sig = hmacHex(secret, JSON.stringify(p))
    try { await fetch(callbackUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': sig }, body: JSON.stringify(p) }) } catch {}
  }

  try {
    console.log(`[render] ${jobId} preparing: downloading inputs`)
    await progress('preparing', 0.05)

    const inFile = join(tmpdir(), `${jobId}_source.mp4`)
    const subVtt = join(tmpdir(), `${jobId}.vtt`)
    const outFile = join(tmpdir(), `${jobId}_out.mp4`)

    // Download video
    {
      const r = await fetch(inputVideoUrl)
      if (!r.ok) throw new Error(`download source failed: ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      writeFileSync(inFile, buf)
    }
    // Download subtitles (VTT)
    let vttText = ''
    {
      const r = await fetch(inputVttUrl)
      if (!r.ok) throw new Error(`download subtitles failed: ${r.status}`)
      vttText = await r.text()
      writeFileSync(subVtt, vttText)
    }

    console.log(`[render] ${jobId} inputs ready, start ffmpeg`)
    await progress('running', 0.2)
    await renderVideoWithSubtitles(inFile, vttText, outFile, engineOptions.subtitleConfig || {})

    console.log(`[render] ${jobId} ffmpeg done, uploading artifact`)
    await progress('uploading', 0.95)

    // Upload artifact
    const buf = readFileSync(outFile)
    const headers = { 'content-type': 'video/mp4', 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' }
    const up = await fetch(outputPutUrl, { method: 'PUT', headers, body: buf })
    if (!up.ok) {
      const errorText = await up.text().catch(() => '')
      throw new Error(`upload failed: ${up.status} ${errorText}`)
    }
    console.log(`[render] ${jobId} completed`)
  } catch (e) {
    console.error(`[render] ${jobId} failed:`, e)
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (req.method === 'POST' && url.pathname === '/render') return handleRender(req, res)
  sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, () => console.log(`burner-ffmpeg stub listening on ${PORT}`))

