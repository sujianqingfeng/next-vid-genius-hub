import http from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeStatusCallback } from '@app/callback-utils'
import { renderVideoWithSubtitles } from '@app/media-subtitles'

const PORT = process.env.PORT || 8080

// No default subtitle debug logs; can be enabled via environment when needed

function sendJson(res, code, data) {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(data))
}

async function handleRender(req, res) {
  let body = ''
  for await (const chunk of req) body += chunk
  const payload = JSON.parse(body)
  const jobId = payload?.jobId || `job_${Math.random().toString(36).slice(2, 10)}`
  console.log(`[render] job=${jobId} engineOptions=${JSON.stringify(payload.engineOptions || {})}`)
  sendJson(res, 202, { jobId })

  const { inputVideoUrl, inputVttUrl, outputPutUrl, engineOptions = {}, callbackUrl } = payload
  const secret = process.env.JOB_CALLBACK_HMAC_SECRET || 'dev-secret'
  const postUpdate = makeStatusCallback({ callbackUrl, secret, baseFields: { jobId } })

  if (!inputVideoUrl || !inputVttUrl || !outputPutUrl) {
    console.error('[render] missing required URLs in payload')
    await postUpdate('failed', { error: 'missing required URLs (inputVideoUrl/inputVttUrl/outputPutUrl)' })
    return
  }

  const progress = async (phase, pct) => {
    if (!callbackUrl) return
    const status = phase === 'uploading' ? 'uploading' : 'running'
    try { await postUpdate(status, { phase, progress: pct }) } catch {}
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
    let currentPct = 20
    let lastLogPct = 20
    let lastBeat = Date.now()
    const heartbeatMs = Number(process.env.RENDER_HEARTBEAT_MS || 30000)
    const hb = heartbeatMs > 0 ? setInterval(() => {
      const now = Date.now()
      if (now - lastBeat >= heartbeatMs - 50) {
        console.log(`[render] ${jobId} running… ${Math.max(20, Math.min(99, Math.round(currentPct)))}%`)
        lastBeat = now
      }
    }, heartbeatMs) : null
    try {
      await renderVideoWithSubtitles(
        inFile,
        vttText,
        outFile,
        engineOptions.subtitleConfig || {},
        {
          onProgress: async (p) => {
            const pct = Math.max(0, Math.min(99, Math.round(p * 100)))
            currentPct = Math.max(currentPct, Math.max(20, pct))
            // Emit callback updates (fine-grained) but keep logs at 10% steps
            try { await progress('running', currentPct / 100) } catch {}
            if (currentPct - lastLogPct >= 10) {
              lastLogPct = currentPct
              console.log(`[render] ${jobId} ${lastLogPct}%`)
            }
          },
        },
      )
    } finally {
      if (hb) clearInterval(hb)
    }

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
    await postUpdate('failed', { error: e?.message || 'unknown error' })
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (req.method === 'POST' && url.pathname === '/render') return handleRender(req, res)
  sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, () => console.log(`burner-ffmpeg stub listening on ${PORT}`))
