import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { fetch as undiciFetch, ProxyAgent } from 'undici'
import { bundle } from '@remotion/bundler'
import { getCompositions, renderMedia } from '@remotion/renderer'

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

// --- Timeline estimation (port from lib/media/remotion/durations.ts) ---
const REMOTION_FPS = 30
const COVER_DURATION_SECONDS = 3
const MIN_COMMENT_DURATION_SECONDS = 3
const MAX_COMMENT_DURATION_SECONDS = 8
const BASE_SECONDS = 2.8
const TRANSLATION_WEIGHT = 1.2
const CHARACTER_DIVISOR = 90
const APPEAR_DISAPPEAR_BUFFER_SECONDS = 1.6
const SCROLL_CONTAINER_HEIGHT = 320
const SCROLL_SPEED_PX_PER_SEC = 30
const MIN_SCROLL_TIME_SECONDS = 1.5
const chineseCharRegex = /[\u4e00-\u9fff]/
function isChinese(text) { return Boolean(text && chineseCharRegex.test(text)) }
function estimateCommentHeight(comment) {
  const isPrimaryChinese = isChinese(comment.content)
  const isTranslationChinese = isChinese(comment.translatedContent)
  const mainFontSize = isPrimaryChinese ? 52 : 26
  const mainLineHeight = isPrimaryChinese ? 1.4 : 1.52
  const mainLineHeightPx = mainFontSize * mainLineHeight
  const mainLines = String(comment.content || '').split('\n').length
  const mainHeight = mainLines * mainLineHeightPx
  let totalHeight = mainHeight
  if (comment.translatedContent && comment.translatedContent !== comment.content) {
    const translationFontSize = isTranslationChinese ? 52 : 24
    const translationLineHeight = isTranslationChinese ? 1.4 : 1.48
    const translationLineHeightPx = translationFontSize * translationLineHeight
    const translationLines = String(comment.translatedContent || '').split('\n').length
    const translationHeight = translationLines * translationLineHeightPx
    const spacingBetweenSections = 36
    totalHeight += spacingBetweenSections + translationHeight
  }
  return totalHeight
}
function calculateScrollingDuration(contentHeight) {
  if (contentHeight <= SCROLL_CONTAINER_HEIGHT) return 0
  const scrollDistance = contentHeight - SCROLL_CONTAINER_HEIGHT
  const timeNeeded = scrollDistance / SCROLL_SPEED_PX_PER_SEC
  return Math.max(MIN_SCROLL_TIME_SECONDS, timeNeeded)
}
function estimateCommentDurationSeconds(comment) {
  const contentLength = (comment.content || '').length
  const translationLength = (comment.translatedContent || '').length
  const weightedChars = contentLength + translationLength * TRANSLATION_WEIGHT
  const readingDuration = BASE_SECONDS + weightedChars / CHARACTER_DIVISOR
  const contentHeight = estimateCommentHeight(comment)
  const scrollingDuration = calculateScrollingDuration(contentHeight)
  const total = readingDuration + scrollingDuration + APPEAR_DISAPPEAR_BUFFER_SECONDS
  return Math.min(MAX_COMMENT_DURATION_SECONDS, Math.max(MIN_COMMENT_DURATION_SECONDS, total))
}
function buildCommentTimeline(comments, fps = REMOTION_FPS) {
  const coverDurationInFrames = Math.round(COVER_DURATION_SECONDS * fps)
  const commentDurationsInFrames = comments.map((c) => Math.round(estimateCommentDurationSeconds(c) * fps))
  const totalDurationInFrames = coverDurationInFrames + commentDurationsInFrames.reduce((s, f) => s + f, 0)
  const totalDurationSeconds = totalDurationInFrames / fps
  return { coverDurationInFrames, commentDurationsInFrames, totalDurationInFrames, totalDurationSeconds, coverDurationSeconds: COVER_DURATION_SECONDS }
}

// --- Layout constants (port from remotion/layout-constants.ts) ---
const VIDEO_WIDTH = 720
const VIDEO_HEIGHT = 405
const PADDING_X = 64
const PADDING_Y = 48
const COLUMN_GAP = 24
const INFO_PANEL_WIDTH = 600
const CARD_PADDING_X = 24
const REMOTION_CANVAS_WIDTH = 1920
const containerContentWidth = REMOTION_CANVAS_WIDTH - (PADDING_X * 2)
const videoPanelWidth = CARD_PADDING_X * 2 + VIDEO_WIDTH
const gridContentWidth = INFO_PANEL_WIDTH + COLUMN_GAP + videoPanelWidth
const centerOffset = Math.max(0, (containerContentWidth - gridContentWidth) / 2)
const videoPanelX = PADDING_X + centerOffset + INFO_PANEL_WIDTH + COLUMN_GAP
const videoPanelY = PADDING_Y
const VIDEO_X = videoPanelX + CARD_PADDING_X
const VIDEO_Y = videoPanelY

function getOverlayFilter({ coverDurationSeconds, totalDurationSeconds }) {
  const actualX = Math.round(VIDEO_X)
  const actualY = Math.round(VIDEO_Y)
  const actualWidth = Math.round(VIDEO_WIDTH)
  const actualHeight = Math.round(VIDEO_HEIGHT)
  const delayMs = Math.round(coverDurationSeconds * 1000)
  const filterGraph = [
    // Scale source (Input 1) to the slot size
    `[1:v]fps=${REMOTION_FPS},setpts=PTS-STARTPTS,scale=${actualWidth}:${actualHeight}:flags=lanczos,setsar=1[scaled_src]`,
    // Composite source on top of overlay canvas (Input 0) within the time window
    `[0:v][scaled_src]overlay=${actualX}:${actualY}:enable='between(t,${coverDurationSeconds},${totalDurationSeconds})'[composited]`,
    // Delay source audio by cover duration, then trim to total duration to avoid hang
    `[1:a]adelay=${delayMs}|${delayMs},atrim=0:${totalDurationSeconds},asetpts=PTS-STARTPTS[delayed_audio]`,
  ].join(';')
  return { filterGraph, actualX, actualY, actualWidth, actualHeight }
}

async function handleRender(req, res) {
  let body = ''
  for await (const chunk of req) body += chunk
  const payload = JSON.parse(body)
  const jobId = payload?.jobId || `job_${Math.random().toString(36).slice(2, 10)}`
  const secret = process.env.JOB_CALLBACK_HMAC_SECRET || 'dev-secret'
  const cbUrl = payload?.callbackUrl
  console.log(`[remotion] start job=${jobId}`)
  sendJson(res, 202, { jobId })

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

    await progress('preparing', 0.05)
    const inFile = join(tmpdir(), `${jobId}_source.mp4`)
    const dataJson = join(tmpdir(), `${jobId}_data.json`)
    const overlayOut = join(tmpdir(), `${jobId}_overlay.mp4`)
    const outFile = join(tmpdir(), `${jobId}_out.mp4`)

    {
      const r = await undiciFetch(inputVideoUrl)
      if (!r.ok) throw new Error(`download source failed: ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      writeFileSync(inFile, buf)
    }
    {
      const r = await undiciFetch(inputDataUrl)
      if (!r.ok) throw new Error(`download comments-data failed: ${r.status}`)
      const txt = await r.text()
      writeFileSync(dataJson, txt)
    }

    // Parse input data
    const { videoInfo, comments } = JSON.parse(readFileSync(dataJson, 'utf8'))

    // Inline remote images to avoid <Img> network stalls inside headless browser
    const PROXY_URL = process.env.PROXY_URL
    const dispatcher = PROXY_URL ? new ProxyAgent(PROXY_URL) : undefined
    const inferContentTypeFromUrl = (url) => {
      try {
        const ext = (new URL(url).pathname.split('.').pop() || '').toLowerCase()
        switch (ext) {
          case 'png': return 'image/png'
          case 'webp': return 'image/webp'
          case 'gif': return 'image/gif'
          case 'bmp': return 'image/bmp'
          case 'svg': return 'image/svg+xml'
          case 'jpeg':
          case 'jpg': return 'image/jpeg'
          default: return undefined
        }
      } catch { return undefined }
    }
    async function inlineRemoteImage(url) {
      if (!url) return undefined
      const isRemote = /^https?:\/\//i.test(String(url))
      if (!isRemote) return url
      try {
        const r = await undiciFetch(url, { signal: AbortSignal.timeout(15000), dispatcher })
        if (!r.ok) throw new Error(String(r.status))
        const arrayBuffer = await r.arrayBuffer()
        const contentType = r.headers.get('content-type') || inferContentTypeFromUrl(url) || 'image/jpeg'
        const dataUrl = `data:${contentType};base64,${Buffer.from(arrayBuffer).toString('base64')}`
        return dataUrl
      } catch (e) {
        console.warn('[remotion] inline image failed:', url, e?.message || e)
        return undefined
      }
    }
    let inlineOk = 0, inlineFail = 0
    const preparedVideoInfo = { ...videoInfo, thumbnail: await inlineRemoteImage(videoInfo?.thumbnail).then(v => { if (v) inlineOk++; else inlineFail++; return v }) }
    const preparedComments = []
    for (const c of comments || []) {
      const inlined = await inlineRemoteImage(c?.authorThumbnail)
      if (inlined) inlineOk++; else inlineFail++
      preparedComments.push({ ...c, authorThumbnail: inlined || undefined })
    }
    console.log(`[remotion] images inlined ok=${inlineOk} fail=${inlineFail}`)

    // Build overlay via Remotion
    await progress('running', 0.15)
    const tmpOut = join(tmpdir(), `${jobId}_bundle`)
    const serveUrl = await bundle({ entryPoint: join(process.cwd(), 'remotion', 'index.ts'), outDir: tmpOut, publicDir: join(process.cwd(), 'public'), enableCaching: true })
    const { coverDurationInFrames, commentDurationsInFrames, totalDurationInFrames, totalDurationSeconds, coverDurationSeconds } = buildCommentTimeline(preparedComments, REMOTION_FPS)
    const inputProps = { videoInfo: preparedVideoInfo, comments: preparedComments, coverDurationInFrames, commentDurationsInFrames, fps: REMOTION_FPS }
    const compositions = await getCompositions(serveUrl, { inputProps })
    const composition = compositions.find((c) => c.id === 'CommentsVideo')
    if (!composition) throw new Error('Remotion composition "CommentsVideo" not found')
    console.log('[remotion] composition ok. frames=', totalDurationInFrames, 'fps=', REMOTION_FPS)
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
        if (typeof progress === 'number') console.log(`[remotion] render progress=${(progress*100).toFixed(1)}% frames=${renderedFrames}/${encodedFrames}`)
      },
    })

    // Compose overlay with source video via FFmpeg
    await progress('running', 0.8)
    const { filterGraph } = getOverlayFilter({ coverDurationSeconds, totalDurationSeconds })
    console.log('[remotion] ffmpeg filterGraph=', filterGraph)
    const ffArgs = [
      '-y','-hide_banner','-loglevel','error',
      '-progress','pipe:2',
      // Input 0: overlay canvas, Input 1: source video (match local render)
      '-i', overlayOut,
      '-i', inFile,
      '-filter_complex', filterGraph,
      '-map','[composited]',
      // Map delayed & trimmed source audio
      '-map','[delayed_audio]?',
      '-vsync','cfr','-r', String(REMOTION_FPS),
      '-c:v','libx264','-c:a','aac','-b:a','192k',
      '-preset','veryfast',
      '-pix_fmt','yuv420p','-movflags','+faststart','-shortest',
      outFile,
    ]
    await execFFmpegWithProgress(ffArgs, totalDurationSeconds)
    console.log('[remotion] ffmpeg compose done')
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
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (req.method === 'POST' && url.pathname === '/render') return handleRender(req, res)
  return sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, () => console.log(`renderer-remotion scaffold listening on ${PORT}`))
