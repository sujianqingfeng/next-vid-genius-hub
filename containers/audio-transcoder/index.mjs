import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync, writeFileSync, statSync, unlinkSync } from 'node:fs'
import { execa } from 'execa'
import { makeStatusCallback } from '@app/callback-utils'
import { sendJson, startJsonServer } from '../shared.mjs'

const PORT = process.env.PORT || 8080

// sendJson imported from shared

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

  // Log effective transcode plan (without leaking presigned URLs)
  console.log(
    `[audio-transcoder] accepted job ${jobId} with plan: maxBytes=${maxBytes} bytes, bitrates=[${bitrates.join(',')}], sampleRate=${sampleRate}`,
  )

  const postUpdate = makeStatusCallback({ callbackUrl, secret, baseFields: { jobId } })

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
    console.log(
      `[audio-transcoder] ${jobId} downloaded source audio: ${buf.length} bytes (~${(buf.length / 1048576).toFixed(2)} MB)`,
    )
    writeFileSync(inFile, buf)

    let done = false
    for (let i = 0; i < bitrates.length; i++) {
      const br = Math.max(16, Math.min(256, Number(bitrates[i]) || 48))
      console.log(`[audio-transcoder] ${jobId} ffmpeg pass ${i + 1}: ${br}kbps/${sampleRate}Hz`)
      await postUpdate('running', { phase: 'running', progress: 0.2 + i * 0.3 })
      const args = [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', inFile,
        '-vn', '-ac', '1', '-ar', String(sampleRate), '-b:a', `${br}k`, outFile,
      ]
      console.log('[audio-transcoder] ffmpeg command:', 'ffmpeg', args.join(' '))
      await execa('ffmpeg', args)
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
        console.log(
          `[audio-transcoder] ${jobId} uploaded processed audio: ${size} bytes (<= ${maxBytes} target: ${size <= maxBytes})`,
        )
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

startJsonServer(PORT, handleRender, 'audio-transcoder')
