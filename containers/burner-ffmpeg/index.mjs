import http from 'node:http'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'

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

function toAssColor(hex, opacity = 1) {
  let h = String(hex || '#ffffff').trim().replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const int = parseInt(h, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  const a = Math.round((1 - Math.max(0, Math.min(1, opacity))) * 255)
  return `&H${a.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${r.toString(16).padStart(2, '0')}`
}

function toFfmpegColor(hex) {
  let normalized = String(hex || '#ffffff').trim().replace('#', '')
  if (normalized.length === 3) normalized = normalized.split('').map((c) => c + c).join('')
  const int = parseInt(normalized, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `0x${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function escapeForFFmpegFilterPath(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/')
  return normalizedPath.replace(/:/g, '\\:').replace(/\\/g, '\\\\')
}

function getTextPosition(position) {
  switch (position) {
    case 'center':
      return { x: `(w-text_w)/2`, y: `(h-text_h)/2` }
    case 'top':
      return { x: `(w-text_w)/2`, y: `h*0.1` }
    case 'bottom':
      return { x: `(w-text_w)/2`, y: `h*0.85` }
    default:
      return { x: `(w-text_w)/2`, y: `(h-text_h)/2` }
  }
}

async function getVideoResolution(videoPath) {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', ['-v', 'quiet', '-print_format', 'csv=p=0', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', videoPath])
    let out = ''
    p.stdout.on('data', (d) => (out += d.toString()))
    p.on('close', () => {
      const [w, h] = out.trim().split(',').map((n) => parseInt(n, 10))
      if (!w || !h) return resolve({ width: 1920, height: 1080 })
      resolve({ width: w, height: h })
    })
  })
}

function convertWebVttToAss(vttContent, config, videoHeight = 1080) {
  const toAssTime = (t) => {
    let m = t.match(/(\d+):(\d+):(\d+)\.(\d{1,3})/)
    if (m) {
      const [, hh, mm, ss, ms] = m
      const cs = String(Math.round(parseInt(ms, 10) / 10)).padStart(2, '0')
      return `${parseInt(hh, 10)}:${mm}:${ss}.${cs}`
    }
    m = t.match(/(\d+):(\d+)\.(\d{1,3})/)
    if (m) {
      const [, mm, ss, ms] = m
      const cs = String(Math.round(parseInt(ms, 10) / 10)).padStart(2, '0')
      return `0:${mm}:${ss}.${cs}`
    }
    return '0:00:00.00'
  }
  const lines = vttContent.split(/\r?\n/)
  const events = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\d{1,2}:\d{2}(?::\d{2})?\.\d{3}) --> (\d{1,2}:\d{2}(?::\d{2})?\.\d{3})/)
    if (m) {
      const [, start, end] = m
      const engLine = lines[i + 1]?.trim() || ''
      const zhLine = (lines[i + 2]?.trim() || '').replace(/^-\s*/, '')
      events.push({ start: toAssTime(start), end: toAssTime(end), eng: engLine, zh: zhLine })
      i += 2
    }
  }
  const scaleFactor = videoHeight / 1080
  const scaled = Math.round((config?.fontSize ?? 36) * scaleFactor)
  const fontSize = Math.max(12, Math.min(72, scaled))
  const primaryColor = toAssColor(config?.textColor ?? '#ffffff', 1)
  const secondaryColor = primaryColor
  const outlineColor = toAssColor(config?.outlineColor ?? '#000000', 0.9)
  const backgroundColor = toAssColor(config?.backgroundColor ?? '#000000', config?.backgroundOpacity ?? 0.5)
  const marginV = Math.round(fontSize)
  const fontName = 'Noto Sans CJK SC'
  const ass = [
    '[Script Info]',
    'Title: Generated Subtitles',
    'ScriptType: v4.00+',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: English,${fontName},${Math.round(fontSize * 0.65)},${primaryColor},${secondaryColor},${outlineColor},${backgroundColor},0,0,0,0,100,100,0,0,1,1,0,2,0,0,${marginV},1`,
    `Style: Chinese,${fontName},${fontSize},${primaryColor},${secondaryColor},${outlineColor},${backgroundColor},0,0,0,0,100,100,0,0,1,1,0,2,0,0,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]
  for (const e of events) {
    if (e.zh) ass.push(`Dialogue: 0,${e.start},${e.end},Chinese,,0,0,0,,${e.zh}`)
    if (e.eng) ass.push(`Dialogue: 0,${e.start},${e.end},English,,0,0,0,,${e.eng}`)
  }
  return ass.join('\n')
}

async function processAudioWithMute(videoPath, timeSegmentEffects, outputPath) {
  const muteSegments = (timeSegmentEffects || []).filter((e) => e && e.muteAudio)
  if (!muteSegments.length) {
    await execFFmpeg(['-i', videoPath, '-vn', '-c:a', 'aac', '-b:a', '160k', '-y', outputPath])
    return
  }
  if (muteSegments.length === 1) {
    const seg = muteSegments[0]
    await execFFmpeg(['-i', videoPath, '-af', `volume=enable='between(t,${seg.startTime},${seg.endTime})':volume=0`, '-vn', '-c:a', 'aac', '-b:a', '160k', '-y', outputPath])
  } else {
    const expr = muteSegments.map((s) => `between(t,${s.startTime},${s.endTime})`).join('+')
    await execFFmpeg(['-i', videoPath, '-af', `volume=enable='${expr}':volume=0`, '-vn', '-c:a', 'aac', '-b:a', '160k', '-y', outputPath])
  }
}

async function renderVideoWithBlackScreen(videoPath, assPath, timeSegmentEffects, outputPath, hintTextConfig) {
  const blackSegs = (timeSegmentEffects || []).filter((e) => e && e.blackScreen)
  if (!blackSegs.length) {
    await execFFmpeg(['-i', videoPath, '-vf', `subtitles=${assPath}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-an', '-y', outputPath])
    return
  }
  const startTime = blackSegs[0].startTime
  const endTime = blackSegs[0].endTime
  if (!hintTextConfig?.enabled || !String(hintTextConfig.text || '').trim()) {
    await execFFmpeg([
      '-i', videoPath,
      '-filter_complex', `[0:v]subtitles=${assPath}[subt];[subt]colorchannelmixer=rr=0:gg=0:bb=0:enable='between(t,${startTime},${endTime})'[v]`,
      '-map', '[v]',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-an', '-y', outputPath,
    ])
    return
  }
  const { width, height } = await getVideoResolution(videoPath)
  const scaleFactor = height / 1080
  const fs = Math.round((hintTextConfig.fontSize ?? 24) * scaleFactor)
  const pos = getTextPosition(hintTextConfig.position || 'center')
  const textColor = toFfmpegColor(hintTextConfig.textColor || '#ffffff')
  const drawtext = `drawtext=text='${String(hintTextConfig.text || '').replace(/'/g, "\\'")}':fontsize=${fs}:fontcolor=${textColor}:x=${pos.x}:y=${pos.y}:enable='between(t,${startTime},${endTime})'`
  await execFFmpeg([
    '-i', videoPath,
    '-filter_complex', `[0:v]subtitles=${assPath}[subt];[subt]colorchannelmixer=rr=0:gg=0:bb=0:enable='between(t,${startTime},${endTime})'[blk];[blk]${drawtext}[v]`,
    '-map', '[v]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-an', '-y', outputPath,
  ])
}

async function renderWithEffects(videoPath, assPath, timeSegmentEffects, outputPath, hintTextConfig) {
  const hasBlack = (timeSegmentEffects || []).some((e) => e && e.blackScreen)
  const hasMute = (timeSegmentEffects || []).some((e) => e && e.muteAudio)
  if (!hasBlack && !hasMute) {
    await execFFmpeg(['-i', videoPath, '-vf', `subtitles=${assPath}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-y', outputPath])
    return
  }
  const tempVideo = outputPath.replace(/(\.[^.]+)$/, '_temp_video$1')
  const tempAudio = outputPath.replace(/(\.[^.]+)$/, '_temp_audio$1')
  try {
    if (hasBlack) {
      await renderVideoWithBlackScreen(videoPath, assPath, timeSegmentEffects, tempVideo, hintTextConfig)
    } else {
      await execFFmpeg(['-i', videoPath, '-vf', `subtitles=${assPath}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-an', '-y', tempVideo])
    }
    if (hasMute) {
      await processAudioWithMute(videoPath, timeSegmentEffects, tempAudio)
    } else {
      await execFFmpeg(['-i', videoPath, '-vn', '-c:a', 'aac', '-b:a', '160k', '-y', tempAudio])
    }
    await execFFmpeg(['-i', tempVideo, '-i', tempAudio, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-y', outputPath])
  } finally {
    try { unlinkSync(tempVideo) } catch {}
    try { unlinkSync(tempAudio) } catch {}
  }
}

async function handleRender(req, res) {
  let body = ''
  for await (const chunk of req) body += chunk
  const payload = JSON.parse(body)
  const jobId = payload?.jobId || `job_${Math.random().toString(36).slice(2, 10)}`
  console.log(`[render] job=${jobId} engineOptions=${JSON.stringify(payload.engineOptions||{})}`)
  sendJson(res, 202, { jobId })

  // Simulate progress and final callback
  const { inputVideoUrl, inputVttUrl, outputPutUrl, engineOptions = {}, callbackUrl } = payload
  if (!inputVideoUrl || !inputVttUrl || !outputPutUrl) {
    throw new Error('missing S3 presigned URLs (inputVideoUrl/inputVttUrl/outputPutUrl)')
  }
  const secret = process.env.JOB_CALLBACK_HMAC_SECRET || 'dev-secret'

  // send progress helper
  async function progress(phase, pct) {
    if (!callbackUrl) return
    const body = { jobId, status: phase === 'uploading' ? 'uploading' : 'running', phase, progress: pct, ts: Date.now(), nonce: randomNonce() }
    const sig = hmacHex(secret, JSON.stringify(body))
    await fetch(callbackUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': sig }, body: JSON.stringify(body) }).catch(() => {})
  }

  try {
    console.log(`[render] ${jobId} preparing: downloading inputs`)
    await progress('preparing', 0.05)
    // Download inputs
    const inFile = join(tmpdir(), `${jobId}_source.mp4`)
    const subVtt = join(tmpdir(), `${jobId}.vtt`)
    const subAss = join(tmpdir(), `${jobId}.ass`)
    const outFile = join(tmpdir(), `${jobId}_out.mp4`)
    {
      const r = await fetch(inputVideoUrl)
      if (!r.ok) throw new Error(`download source failed: ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      writeFileSync(inFile, buf)
    }
    {
      const r = await fetch(inputVttUrl)
      if (!r.ok) throw new Error(`download subtitles failed: ${r.status}`)
      const text = await r.text()
      writeFileSync(subVtt, text)
      const { height } = await getVideoResolution(inFile)
      const ass = convertWebVttToAss(text, engineOptions.subtitleConfig || {}, height)
      writeFileSync(subAss, ass)
    }
    console.log(`[render] ${jobId} inputs ready, start ffmpeg`)
    await progress('running', 0.2)
    const assEscaped = escapeForFFmpegFilterPath(subAss)
    const effects = (engineOptions.subtitleConfig && engineOptions.subtitleConfig.timeSegmentEffects) || []
    const hint = engineOptions.subtitleConfig && engineOptions.subtitleConfig.hintTextConfig
    await renderWithEffects(inFile, assEscaped, effects, outFile, hint)
    console.log(`[render] ${jobId} ffmpeg done, uploading artifact`)
    await progress('uploading', 0.95)
    // Upload artifact to Worker
    const buf = readFileSync(outFile)
    console.log(`[render] ${jobId} uploading to: ${outputPutUrl}`)
    console.log(`[render] ${jobId} file size: ${buf.length} bytes`)
    // 设置正确的headers以匹配签名
    const headers = {
      'content-type': 'video/mp4',
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD'
    }
    console.log(`[render] ${jobId} upload headers:`, headers)
    const up = await fetch(outputPutUrl, { method: 'PUT', headers, body: buf })
    console.log(`[render] ${jobId} upload response status: ${up.status}`)
    if (!up.ok) {
      const errorText = await up.text()
      console.error(`[render] ${jobId} upload error response: ${errorText}`)
      throw new Error(`upload failed: ${up.status}`)
    }
    console.log(`[render] ${jobId} completed`)
    // no callback in S3-only mode; Worker detects completion by HEAD on S3 output
  } catch (e) {
    console.error(`[render] ${jobId} failed:`, e)
    // on failure, rely on worker polling/job timeout
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (req.method === 'POST' && url.pathname === '/render') return handleRender(req, res)
  sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, () => console.log(`burner-ffmpeg stub listening on ${PORT}`))
