import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync, writeFileSync, statSync, unlinkSync } from 'node:fs'
import crypto from 'node:crypto'
import { execa } from 'execa'

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
  let raw = ''
  for await (const chunk of req) raw += chunk
  const payload = JSON.parse(raw)
  const jobId = payload?.jobId || `job_${Math.random().toString(36).slice(2, 10)}`
  const { inputAudioUrl, outputAudioPutUrl, callbackUrl, engineOptions = {} } = payload
  sendJson(res, 202, { jobId })

  const secret = process.env.JOB_CALLBACK_HMAC_SECRET || 'dev-secret'
  const maxBytes = Number(engineOptions.maxBytes || 4 * 1024 * 1024)
  const bitrates = Array.isArray(engineOptions.targetBitrates) && engineOptions.targetBitrates.length
    ? engineOptions.targetBitrates
    : [48, 24]
  const sampleRate = Number(engineOptions.sampleRate || 16000)

  async function postUpdate(status, extra = {}) {
    if (!callbackUrl) return
    const body = { jobId, status, ts: Date.now(), nonce: randomNonce(), ...extra }
    const sig = hmacHex(secret, JSON.stringify(body))
    try {
      const r = await fetch(callbackUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': sig }, body: JSON.stringify(body) })
      if (!r.ok) {
        const msg = await r.text().catch(() => '')
        console.error('[audio-transcoder] callback non-2xx', r.status, msg)
      }
    } catch (e) {
      console.error('[audio-transcoder] callback error', e?.message || e)
    }
  }

  if (!inputAudioUrl || !outputAudioPutUrl) {
    console.error('[audio-transcoder] missing input/output URL')
    await postUpdate('failed', { error: 'missing inputAudioUrl/outputAudioPutUrl' })
    return
  }

  try {
    await postUpdate('preparing', { phase: 'preparing', progress: 0.05 })
    const inFile = join(tmpdir(), `${jobId}_in.mp3`)
    const outFile = join(tmpdir(), `${jobId}_out.mp3`)

    // Download source
    const r = await fetch(inputAudioUrl)
    if (!r.ok) throw new Error(`download failed: ${r.status}`)
    const buf = Buffer.from(await r.arrayBuffer())
    writeFileSync(inFile, buf)

    let done = false
    for (let i = 0; i < bitrates.length; i++) {
      const br = Math.max(16, Math.min(256, Number(bitrates[i]) || 48))
      console.log(`[audio-transcoder] ${jobId} ffmpeg pass ${i + 1}: ${br}kbps/${sampleRate}Hz`)
      await postUpdate('running', { phase: 'running', progress: 0.2 + i * 0.3 })
      await execa('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', inFile,
        '-vn', '-ac', '1', '-ar', String(sampleRate), '-b:a', `${br}k`, outFile,
      ])
      const size = statSync(outFile).size
      console.log(`[audio-transcoder] size after ${br}kbps: ${size} bytes`)
      if (size <= maxBytes || i === bitrates.length - 1) {
        // Upload
        await postUpdate('uploading', { phase: 'uploading', progress: 0.95 })
        const outBuf = readFileSync(outFile)
        const headers = { 'content-type': 'audio/mpeg', 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' }
        const up = await fetch(outputAudioPutUrl, { method: 'PUT', headers, body: outBuf })
        if (!up.ok) {
          const errorText = await up.text().catch(() => '')
          throw new Error(`upload failed: ${up.status} ${errorText}`)
        }
        done = true
        break
      }
    }
    try { unlinkSync(inFile) } catch {}
    try { unlinkSync(outFile) } catch {}
    if (!done) throw new Error('transcode failed to meet size limit')
    await postUpdate('completed', { outputs: { audio: {} } })
  } catch (e) {
    console.error('[audio-transcoder] failed', e)
    await postUpdate('failed', { error: e?.message || 'unknown error' })
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (req.method === 'POST' && url.pathname === '/render') return handleRender(req, res)
  sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, () => console.log(`audio-transcoder listening on ${PORT}`))

