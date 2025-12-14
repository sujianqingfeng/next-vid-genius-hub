import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { makeStatusCallback } from '@app/job-callbacks'
import { sendJson, startJsonServer } from './shared.mjs'
import { transcodeToTargetSize } from '@app/media-node'

const PORT = process.env.PORT || 8080

// sendJson imported from shared

async function handleRender(req, res) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  const payload = JSON.parse(raw)
  const jobId = payload?.jobId || `job_${Math.random().toString(36).slice(2, 10)}`
  const { inputAudioUrl, outputAudioPutUrl, callbackUrl, engineOptions = {} } = payload
  sendJson(res, 202, { jobId })

  const secret = process.env.JOB_CALLBACK_HMAC_SECRET
  if (!secret) {
    throw new Error('JOB_CALLBACK_HMAC_SECRET is required')
  }
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
  let lastPhase
  let lastProgress
  const post = async (status, fields = {}) => {
    if (fields?.phase != null) lastPhase = fields.phase
    if (fields?.progress != null) lastProgress = fields.progress
    return postUpdate(status, fields)
  }

  if (!inputAudioUrl || !outputAudioPutUrl) {
    console.error('[audio-transcoder] missing input/output URL')
    await postUpdate('failed', { error: 'missing inputAudioUrl/outputAudioPutUrl' })
    return
  }

  try {
    await post('preparing', { phase: 'preparing', progress: 0.05 })
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

    await post('running', { phase: 'running', progress: 0.2 })
    const { size, bitrate: usedBitrate } = await transcodeToTargetSize(inFile, outFile, {
      maxBytes,
      bitrates,
      sampleRate,
      onPass: ({ pass, total, bitrate }) => {
        console.log(`[audio-transcoder] ${jobId} ffmpeg pass ${pass}/${total}: ${bitrate}kbps/${sampleRate}Hz`)
      },
    })

    await post('uploading', { phase: 'uploading', progress: 0.95 })
    const outBuf = readFileSync(outFile)
    const headers = { 'content-type': 'audio/mpeg', 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' }
    const up = await fetch(outputAudioPutUrl, { method: 'PUT', headers, body: outBuf })
    if (!up.ok) {
      const errorText = await up.text().catch(() => '')
      throw new Error(`upload failed: ${up.status} ${errorText}`)
    }
    console.log(
      `[audio-transcoder] ${jobId} uploaded processed audio: ${size} bytes @${usedBitrate}kbps (<= ${maxBytes} target: ${size <= maxBytes})`,
    )
    try { unlinkSync(inFile) } catch {}
    try { unlinkSync(outFile) } catch {}
    await postUpdate('completed', { outputs: { audio: {} } })
  } catch (e) {
    console.error('[audio-transcoder] failed', e)
    await postUpdate('failed', {
      phase: lastPhase,
      progress: lastProgress,
      error: e?.message || 'unknown error',
    })
  }
}

startJsonServer(PORT, handleRender, 'audio-transcoder')
