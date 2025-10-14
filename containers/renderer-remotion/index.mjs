import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { fetch as undiciFetch } from 'undici'
import { bundle } from '@remotion/bundler'
import { getCompositions, renderMedia } from '@remotion/renderer'
import { buildCommentTimeline, REMOTION_FPS, inlineRemoteImage as inlineRemoteImageFromPkg, buildComposeArgs } from '@app/media-comments'
import { resolveForwardProxy, startMihomo as startMihomoProxy } from '@app/media-core'

const PORT = process.env.PORT || 8090

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

async function execFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args])
    let err = ''
    p.stderr.on('data', (d) => (err += d.toString()))
    p.on('close', (code) => {
      if (code === 0) resolve(0)
      else reject(new Error(err || `ffmpeg exit ${code}`))
    })
  })
}

async function execFFmpegWithProgress(args, totalDurationSeconds) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args)
    const totalUs = Math.max(1, Math.floor((totalDurationSeconds || 0) * 1_000_000))
    let lastPct = -1
    let err = ''
    let buf = ''
    let lastTick = Date.now()
    const watchdogMs = 120000 // 2 minutes inactivity watchdog
    const timer = setInterval(() => {
      if (Date.now() - lastTick > watchdogMs) {
        console.error('[remotion] ffmpeg no-progress watchdog fired, killing process')
        try { p.kill('SIGKILL') } catch {}
      }
    }, 10000)

    p.stderr.on('data', (d) => {
      const s = d.toString()
      err += s
      buf += s
      let idx
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        // Parse -progress key=value output
        if (line.startsWith('out_time_us=')) {
          const us = parseInt(line.split('=')[1] || '0', 10)
          const ratio = Math.max(0, Math.min(1, us / totalUs))
          const pct = Math.round(ratio * 1000) / 10
          if (pct !== lastPct) {
            lastPct = pct
            lastTick = Date.now()
            console.log(`[ffmpeg] compose progress=${pct}%`) // coarse-grained compose progress
          }
        }
        if (line === 'progress=end') {
          lastTick = Date.now()
        }
      }
    })
    p.on('close', (code) => {
      clearInterval(timer)
      if (code === 0) return resolve(0)
      reject(new Error(err || `ffmpeg exit ${code}`))
    })
  })
}

async function execFFprobe(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', args)
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d.toString()))
    p.stderr.on('data', (d) => (err += d.toString()))
    p.on('close', (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(err || `ffprobe exit ${code}`))
    })
  })
}

async function getVideoResolution(videoPath) {
  try {
    const out = await execFFprobe(['-v', 'quiet', '-print_format', 'csv=p=0', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', videoPath])
    const [w, h] = String(out).trim().split(',').map((n) => parseInt(n, 10))
    if (!w || !h) return { width: 1920, height: 1080 }
    return { width: w, height: h }
  } catch {
    return { width: 1920, height: 1080 }
  }
}

// (timeline/layout helpers are provided by @app/media-comments)

async function handleRender(req, res) {
  let body = ''
  for await (const chunk of req) body += chunk
  const payload = JSON.parse(body)
  const jobId = payload?.jobId || `job_${Math.random().toString(36).slice(2, 10)}`
  const secret = process.env.JOB_CALLBACK_HMAC_SECRET || 'dev-secret'
  const cbUrl = payload?.callbackUrl
  const engineOptions = payload?.engineOptions || {}
  const safeEngineOptions = {
    hasDefaultProxy: Boolean(engineOptions?.defaultProxyUrl),
    proxy: engineOptions?.proxy
      ? {
          id: engineOptions.proxy.id,
          protocol: engineOptions.proxy.protocol,
          server: engineOptions.proxy.server,
          port: engineOptions.proxy.port,
          hasNodeUrl: Boolean(engineOptions.proxy.nodeUrl),
          hasCredentials: Boolean(engineOptions.proxy.username && engineOptions.proxy.password),
        }
      : null,
  }
  console.log(`[remotion] start job=${jobId}`)
  console.log('[remotion] engine options', { jobId, engineOptions: safeEngineOptions })
  sendJson(res, 202, { jobId })

  const baseDefaultProxyUrl = engineOptions?.defaultProxyUrl || process.env.PROXY_URL
  let clashController = null

  // Optional progress helper
  async function progress(phase, pct) {
    if (!cbUrl) return
    const data = { jobId, status: phase === 'uploading' ? 'uploading' : 'running', phase, progress: pct, ts: Date.now(), nonce: randomNonce() }
    const sig = hmacHex(secret, JSON.stringify(data))
    await undiciFetch(cbUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': sig }, body: JSON.stringify(data) }).catch(() => {})
  }

  try {
    const inputVideoUrl = payload?.inputVideoUrl
    const inputDataUrl = payload?.inputDataUrl
    const outputPutUrl = payload?.outputPutUrl
    if (!inputVideoUrl || !inputDataUrl || !outputPutUrl) {
      throw new Error('missing required URLs (inputVideoUrl/inputDataUrl/outputPutUrl)')
    }

    try {
      clashController = await startMihomoProxy(engineOptions, { logger: console })
    } catch (error) {
      console.error('[remotion] Failed to start Clash/Mihomo', error)
    }
    const forwardProxy = resolveForwardProxy({ proxy: engineOptions?.proxy, defaultProxyUrl: baseDefaultProxyUrl, logger: console })
    const effectiveProxy = clashController?.proxyUrl || forwardProxy || baseDefaultProxyUrl
    console.log('[remotion] resolved proxy', { jobId, viaMihomo: Boolean(clashController), proxy: effectiveProxy })

    await progress('preparing', 0.05)
    const inFile = join(tmpdir(), `${jobId}_source.mp4`)
    const dataJson = join(tmpdir(), `${jobId}_data.json`)
    const overlayOut = join(tmpdir(), `${jobId}_overlay.mp4`)
    const outFile = join(tmpdir(), `${jobId}_out.mp4`)

    console.log('[remotion] downloading source video from:', inputVideoUrl.split('?')[0])
    {
      const r = await undiciFetch(inputVideoUrl)
      if (!r.ok) throw new Error(`download source failed: ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      console.log(`[remotion] source video downloaded: ${(buf.length / 1024 / 1024).toFixed(2)} MB`)
      writeFileSync(inFile, buf)
    }
    console.log('[remotion] downloading comments data from:', inputDataUrl.split('?')[0])
    {
      const r = await undiciFetch(inputDataUrl)
      if (!r.ok) throw new Error(`download comments-data failed: ${r.status}`)
      const txt = await r.text()
      console.log(`[remotion] comments data downloaded: ${(txt.length / 1024).toFixed(2)} KB`)
      writeFileSync(dataJson, txt)
    }

    // Parse input data
    console.log('[remotion] parsing comments data')
    const { videoInfo, comments } = JSON.parse(readFileSync(dataJson, 'utf8'))
    console.log(`[remotion] parsed ${comments?.length || 0} comments`)

    // Inline remote images to avoid <Img> network stalls inside headless browser
    console.log(`[remotion] inlining remote images (1 video + ${comments?.length || 0} comment thumbnails)`)
    const inlineRemoteImage = (url) => inlineRemoteImageFromPkg(url, { proxyUrl: effectiveProxy || undefined, timeoutMs: 5000 })
    let inlineOk = 0, inlineFail = 0
    
    // Download video thumbnail
    const preparedVideoInfo = { ...videoInfo, thumbnail: await inlineRemoteImage(videoInfo?.thumbnail).then(v => { if (v) inlineOk++; else inlineFail++; return v }) }
    
    // Download comment thumbnails in batches of 10 concurrent requests
    const preparedComments = []
    const batchSize = 10
    for (let i = 0; i < (comments || []).length; i += batchSize) {
      const batch = comments.slice(i, i + batchSize)
      console.log(`[remotion] inlining batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(comments.length / batchSize)} (${i + 1}-${Math.min(i + batchSize, comments.length)}/${comments.length})`)
      const inlinedBatch = await Promise.all(
        batch.map(async (c) => {
          const inlined = await inlineRemoteImage(c?.authorThumbnail)
          if (inlined) inlineOk++; else inlineFail++
          return { ...c, authorThumbnail: inlined || undefined }
        })
      )
      preparedComments.push(...inlinedBatch)
    }
    const total = inlineOk + inlineFail
    const successRate = total > 0 ? ((inlineOk / total) * 100).toFixed(1) : '0.0'
    console.log(`[remotion] images inlined: ok=${inlineOk} fail=${inlineFail} (${successRate}% success)`)

    // Build overlay via Remotion
    await progress('running', 0.15)
    const tmpOut = join(tmpdir(), `${jobId}_bundle`)
    console.log('[remotion] bundling Remotion project...')
    const serveUrl = await bundle({ entryPoint: join(process.cwd(), 'remotion', 'index.ts'), outDir: tmpOut, publicDir: join(process.cwd(), 'public'), enableCaching: true })
    console.log('[remotion] bundle complete, building timeline')
    const { coverDurationInFrames, commentDurationsInFrames, totalDurationInFrames, totalDurationSeconds, coverDurationSeconds } = buildCommentTimeline(preparedComments, REMOTION_FPS)
    console.log(`[remotion] timeline: cover=${coverDurationSeconds}s total=${totalDurationSeconds}s`)
    const inputProps = { videoInfo: preparedVideoInfo, comments: preparedComments, coverDurationInFrames, commentDurationsInFrames, fps: REMOTION_FPS }
    console.log('[remotion] getting compositions...')
    const compositions = await getCompositions(serveUrl, { inputProps })
    const composition = compositions.find((c) => c.id === 'CommentsVideo')
    if (!composition) throw new Error('Remotion composition "CommentsVideo" not found')
    console.log('[remotion] composition ready. frames=', totalDurationInFrames, 'fps=', REMOTION_FPS)
    let lastRenderProgress = -1
    await renderMedia({
      composition: { ...composition, durationInFrames: totalDurationInFrames, fps: REMOTION_FPS },
      serveUrl,
      codec: 'h264',
      audioCodec: 'aac',
      outputLocation: overlayOut,
      inputProps,
      chromiumOptions: { ignoreCertificateErrors: true, gl: 'angle', enableMultiProcessOnLinux: true },
      envVariables: { REMOTION_DISABLE_CHROMIUM_PROVIDED_HEADLESS_WARNING: 'true' },
      timeoutInMilliseconds: 120000,
      onProgress: ({ progress, renderedFrames, encodedFrames }) => {
        if (typeof progress === 'number') {
          const currentProgress = Math.round(progress * 100)
          if (currentProgress !== lastRenderProgress && (currentProgress % 5 === 0 || currentProgress === 100)) {
            lastRenderProgress = currentProgress
            console.log(`[remotion] render progress=${currentProgress}% frames=${renderedFrames}/${encodedFrames}`)
          }
        }
      },
    })

    // Compose overlay with source video via FFmpeg
    await progress('running', 0.8)
    console.log('[remotion] starting FFmpeg composition...')
    const ffArgs = buildComposeArgs({
      overlayPath: overlayOut,
      sourceVideoPath: inFile,
      outputPath: outFile,
      fps: REMOTION_FPS,
      coverDurationSeconds,
      totalDurationSeconds,
      preset: 'veryfast',
    })
    await execFFmpegWithProgress(ffArgs, totalDurationSeconds)
    console.log('[remotion] FFmpeg composition complete')
    try { rmSync(tmpOut, { recursive: true, force: true }) } catch {}

    await progress('uploading', 0.95)
    const buf = readFileSync(outFile)
    console.log(`[remotion] uploading artifact size=${buf.length} bytes ->`, outputPutUrl.split('?')[0])
    const headers = { 'content-type': 'video/mp4', 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' }
    const up = await undiciFetch(outputPutUrl, { method: 'PUT', headers, body: buf })
    console.log(`[remotion] upload response status=${up.status}`)
    if (!up.ok) {
      let msg = ''
      try { msg = await up.text() } catch {}
      console.error('[remotion] upload error body:', msg)
      throw new Error(`upload failed: ${up.status}`)
    }
    console.log(`[remotion] completed job=${jobId}`)
  } catch (e) {
    console.error(`[remotion] job ${jobId} failed:`, e)
    // On failure we rely on Worker polling & timeout; optionally send failed progress
    try {
      await progress('running', 1)
    } catch {}
  } finally {
    try {
      if (clashController?.cleanup) {
        await clashController.cleanup()
      }
    } catch (cleanupError) {
      console.error('[remotion] Failed to shutdown Clash cleanly', cleanupError)
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (req.method === 'POST' && url.pathname === '/render') return handleRender(req, res)
  return sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, () => console.log(`renderer-remotion scaffold listening on ${PORT}`))
