import { execa } from 'execa'
import { promises as fs } from 'fs'
import * as path from 'path'

async function getVideoDuration(inputPath) {
  try {
    const { stdout } = await execa('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ])
    const d = parseFloat(String(stdout).trim())
    return Number.isFinite(d) && d > 0 ? d : null
  } catch {
    return null
  }
}

async function runFfmpeg(args, opts = {}) {
  const { inputForProgress, totalDurationSeconds, onProgress } = opts
  if (!onProgress) {
    await execa('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args])
    return
  }
  // With progress reporting
  const ffArgs = ['-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:2', ...args]
  const proc = execa('ffmpeg', ffArgs, { stderr: 'pipe' })
  let lastPct = -1
  let duration = totalDurationSeconds || null
  if (!duration && inputForProgress) {
    duration = await getVideoDuration(inputForProgress)
  }
  const parseProgress = (chunk) => {
    try {
      const lines = String(chunk || '').split(/\r?\n/)
      for (const line of lines) {
        const m = line.match(/^out_time_ms=(\d+)/)
        if (m) {
          const outMs = parseInt(m[1], 10)
          if (duration && duration > 0) {
            const pct = Math.max(
              0,
              Math.min(100, Math.round((outMs / 1000) / duration * 100)),
            )
            if (pct > lastPct) {
              lastPct = pct
              onProgress(pct / 100)
            }
          } else {
            // If duration unknown, emit coarse heartbeats on progress markers
            const coarse = Math.min(100, (lastPct + 1) || 0)
            lastPct = coarse
            onProgress(coarse / 100)
          }
        }
      }
    } catch {}
  }
  if (proc.stderr) proc.stderr.on('data', parseProgress)
  await proc
  if (typeof onProgress === 'function' && lastPct < 100) {
    try { onProgress(1) } catch {}
  }
}

export async function getVideoResolution(videoPath) {
  try {
    const { stdout } = await execa('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'csv=p=0',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      videoPath,
    ])
    const [width, height] = stdout.split(',').map((n) => Number(n))
    if (!width || !height || Number.isNaN(width) || Number.isNaN(height)) {
      return { width: 1920, height: 1080 }
    }
    return { width, height }
  } catch {
    return { width: 1920, height: 1080 }
  }
}

export function escapeForFFmpegFilterPath(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/')
  return normalizedPath.replace(/:/g, '\\:').replace(/\\/g, '\\\\')
}

function toAssBackColourHex(hex, opacity) {
  // Returns &HAABBGGRR
  let normalized = String(hex || '#000000').trim().replace('#', '')
  if (normalized.length === 3) normalized = normalized.split('').map((c) => c + c).join('')
  const int = Number.parseInt(normalized, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  const a = Math.round((1 - Math.min(Math.max(opacity ?? 1, 0), 1)) * 255)
  return `&H${a.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${r.toString(16).padStart(2, '0')}`
}

function buildSubtitleFilter({ assPath, fontSize, backgroundColor, backgroundOpacity }) {
  const useSubtitles = process.env.SUB_USE_SUBTITLES_FILTER === '1'
  if (!useSubtitles) return `ass=${assPath}`
  // Fallback path: use subtitles filter with force_style to guarantee box background
  const boxPad = Math.max(2, Math.round(fontSize * 0.12))
  const back = toAssBackColourHex(backgroundColor, backgroundOpacity)
  const force = `BorderStyle=3,Outline=${boxPad},Shadow=0,BackColour=${back}`
  return `subtitles=${assPath}:force_style='${force}'`
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

function convertHexToFfmpegColor(hex) {
  let normalized = String(hex || '#ffffff').trim().replace('#', '')
  if (normalized.length === 3) normalized = normalized.split('').map((c) => c + c).join('')
  const int = Number.parseInt(normalized, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `0x${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function toAssColor(hex, opacity) {
  let normalized = String(hex || '#ffffff').trim().replace('#', '')
  if (normalized.length === 3) normalized = normalized.split('').map((c) => c + c).join('')
  const int = Number.parseInt(normalized, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  const a = Math.round((1 - Math.min(Math.max(opacity ?? 1, 0), 1)) * 255)
  return `&H${a.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${r.toString(16).padStart(2, '0')}`
}

export async function renderVideoWithSubtitles(
  videoPath,
  subtitleContent,
  outputPath,
  subtitleConfig = defaultSubtitleRenderConfig,
  options = {},
) {
  const { height } = await getVideoResolution(videoPath)
  const scaleFactor = height / 1080
  const scaledFontSize = Math.round((subtitleConfig.fontSize ?? 18) * scaleFactor)
  const normalizedConfig = {
    fontSize: Math.min(Math.max(scaledFontSize, 12), 72),
    textColor: subtitleConfig.textColor ?? defaultSubtitleRenderConfig.textColor,
    backgroundColor: subtitleConfig.backgroundColor ?? defaultSubtitleRenderConfig.backgroundColor,
    backgroundOpacity: Math.min(Math.max(subtitleConfig.backgroundOpacity ?? defaultSubtitleRenderConfig.backgroundOpacity, 0), 1),
    outlineColor: subtitleConfig.outlineColor ?? defaultSubtitleRenderConfig.outlineColor,
    timeSegmentEffects: Array.isArray(subtitleConfig.timeSegmentEffects) ? subtitleConfig.timeSegmentEffects : [],
    hintTextConfig: subtitleConfig.hintTextConfig ?? defaultSubtitleRenderConfig.hintTextConfig,
  }

  const tempDir = path.dirname(outputPath)
  const assContent = await convertWebVttToAss(subtitleContent, {
    fontSize: normalizedConfig.fontSize,
    textColor: normalizedConfig.textColor,
    backgroundColor: normalizedConfig.backgroundColor,
    backgroundOpacity: normalizedConfig.backgroundOpacity,
    outlineColor: normalizedConfig.outlineColor,
  })
  const tempAssPath = path.join(tempDir, `temp_${Date.now()}.ass`)
  await fs.writeFile(tempAssPath, assContent, 'utf8')
  const escapedAssPath = escapeForFFmpegFilterPath(tempAssPath)
  const totalDuration = await getVideoDuration(videoPath)
  const emit = typeof options.onProgress === 'function' ? options.onProgress : () => {}
  const range = (start, end) => (p) => emit(start + (end - start) * Math.max(0, Math.min(1, p)))

  try {
    const effects = normalizedConfig.timeSegmentEffects
    if (!effects || effects.length === 0) {
      await runFfmpeg(
        ['-i', videoPath, '-vf', buildSubtitleFilter({ assPath: escapedAssPath, fontSize: normalizedConfig.fontSize, backgroundColor: normalizedConfig.backgroundColor, backgroundOpacity: normalizedConfig.backgroundOpacity }), outputPath],
        { inputForProgress: videoPath, totalDurationSeconds: totalDuration, onProgress: range(0, 1) },
      )
      return
    }
    await renderVideoWithEffects(
      videoPath,
      escapedAssPath,
      effects,
      outputPath,
      normalizedConfig.hintTextConfig,
      { totalDuration, onProgress: emit },
    )
  } finally {
    try { await fs.unlink(tempAssPath) } catch {}
  }
}

async function renderVideoWithEffects(videoPath, assPath, timeSegmentEffects, outputPath, hintTextConfig, opts = {}) {
  const hasBlackScreen = timeSegmentEffects.some((e) => e && e.blackScreen)
  const hasMuteAudio = timeSegmentEffects.some((e) => e && e.muteAudio)
  const totalDuration = opts.totalDuration || null
  const emit = typeof opts.onProgress === 'function' ? opts.onProgress : () => {}
  const range = (start, end) => (p) => emit(start + (end - start) * Math.max(0, Math.min(1, p)))

  if (!hasBlackScreen && !hasMuteAudio) {
    await runFfmpeg(
      ['-i', videoPath, '-vf', buildSubtitleFilter({ assPath, fontSize: (opts.fontSize || 18), backgroundColor: defaultSubtitleRenderConfig.backgroundColor, backgroundOpacity: defaultSubtitleRenderConfig.backgroundOpacity }), '-c:v', 'libx264', '-c:a', 'aac', '-y', outputPath],
      { inputForProgress: videoPath, totalDurationSeconds: totalDuration, onProgress: range(0, 1) },
    )
    return
  }

  const tempVideoPath = outputPath.replace(/(\.[^.]+)$/, '_temp_video$1')
  const tempAudioPath = outputPath.replace(/(\.[^.]+)$/, '_temp_audio$1')

  try {
    if (hasBlackScreen) {
      // Video rendering is the heaviest step → 70%
      await renderVideoWithBlackScreen(
        videoPath,
        assPath,
        timeSegmentEffects,
        tempVideoPath,
        hintTextConfig,
        { totalDuration, onProgress: range(0, 0.7) },
      )
    } else {
      await runFfmpeg(
        ['-i', videoPath, '-vf', buildSubtitleFilter({ assPath, fontSize: (opts.fontSize || 18), backgroundColor: defaultSubtitleRenderConfig.backgroundColor, backgroundOpacity: defaultSubtitleRenderConfig.backgroundOpacity }), '-c:v', 'libx264', '-an', '-y', tempVideoPath],
        { inputForProgress: videoPath, totalDurationSeconds: totalDuration, onProgress: range(0, 0.7) },
      )
    }

    if (hasMuteAudio) {
      // Audio processing → 25%
      await processAudioWithMute(videoPath, timeSegmentEffects, tempAudioPath, { onProgress: range(0.7, 0.95) })
    } else {
      await runFfmpeg(
        ['-i', videoPath, '-vn', '-c:a', 'aac', '-y', tempAudioPath],
        { inputForProgress: videoPath, totalDurationSeconds: totalDuration, onProgress: range(0.7, 0.95) },
      )
    }

    // Final mux is quick → last 5%
    await runFfmpeg(
      ['-i', tempVideoPath, '-i', tempAudioPath, '-c:v', 'copy', '-c:a', 'aac', '-y', outputPath],
      { inputForProgress: videoPath, totalDurationSeconds: totalDuration, onProgress: range(0.95, 1) },
    )
  } finally {
    try { await fs.unlink(tempVideoPath) } catch {}
    try { await fs.unlink(tempAudioPath) } catch {}
  }
}

async function renderVideoWithBlackScreen(videoPath, assPath, timeSegmentEffects, outputPath, hintTextConfig, opts = {}) {
  const segs = (timeSegmentEffects || []).filter((e) => e && e.blackScreen)
  if (!segs.length) {
    await runFfmpeg(
      ['-i', videoPath, '-vf', buildSubtitleFilter({ assPath, fontSize: (opts.fontSize || 18), backgroundColor: defaultSubtitleRenderConfig.backgroundColor, backgroundOpacity: defaultSubtitleRenderConfig.backgroundOpacity }), '-c:v', 'libx264', '-an', '-y', outputPath],
      { inputForProgress: videoPath, totalDurationSeconds: opts.totalDuration, onProgress: opts.onProgress },
    )
    return
  }
  const startTime = segs[0].startTime
  const endTime = segs[0].endTime

  if (!hintTextConfig?.enabled || !String(hintTextConfig.text || '').trim()) {
    await runFfmpeg([
      '-i', videoPath,
      '-filter_complex', `[0:v]${buildSubtitleFilter({ assPath, fontSize: (opts.fontSize || 18), backgroundColor: defaultSubtitleRenderConfig.backgroundColor, backgroundOpacity: defaultSubtitleRenderConfig.backgroundOpacity })}[subt];[subt]colorchannelmixer=rr=0:gg=0:bb=0:enable='between(t,${startTime},${endTime})'[v]`,
      '-map', '[v]',
      '-c:v', 'libx264', '-an', '-y', outputPath,
    ], { inputForProgress: videoPath, totalDurationSeconds: opts.totalDuration, onProgress: opts.onProgress })
    return
  }

  const { height } = await getVideoResolution(videoPath)
  const scaleFactor = height / 1080
  const fsPx = Math.round((hintTextConfig.fontSize ?? 24) * scaleFactor)
  const pos = getTextPosition(hintTextConfig.position || 'center')
  const textColor = convertHexToFfmpegColor(hintTextConfig.textColor || '#ffffff')
  const drawtext = `drawtext=text='${String(hintTextConfig.text || '').replace(/'/g, "\\'")}':fontsize=${fsPx}:fontcolor=${textColor}:x=${pos.x}:y=${pos.y}:enable='between(t,${startTime},${endTime})'`
  await runFfmpeg([
    '-i', videoPath,
    '-filter_complex', `[0:v]${buildSubtitleFilter({ assPath, fontSize: (opts.fontSize || 18), backgroundColor: defaultSubtitleRenderConfig.backgroundColor, backgroundOpacity: defaultSubtitleRenderConfig.backgroundOpacity })}[subt];[subt]colorchannelmixer=rr=0:gg=0:bb=0:enable='between(t,${startTime},${endTime})'[blk];[blk]${drawtext}[v]`,
    '-map', '[v]',
    '-c:v', 'libx264', '-an', '-y', outputPath,
  ], { inputForProgress: videoPath, totalDurationSeconds: opts.totalDuration, onProgress: opts.onProgress })
}

async function processAudioWithMute(videoPath, timeSegmentEffects, outputPath, opts = {}) {
  const muteSegments = (timeSegmentEffects || []).filter((e) => e && e.muteAudio)
  if (!muteSegments.length) {
    await runFfmpeg(
      ['-i', videoPath, '-vn', '-c:a', 'aac', '-y', outputPath],
      { inputForProgress: videoPath, onProgress: opts.onProgress },
    )
    return
  }
  if (muteSegments.length === 1) {
    const seg = muteSegments[0]
    await runFfmpeg(
      ['-i', videoPath, '-af', `volume=enable='between(t,${seg.startTime},${seg.endTime})':volume=0`, '-vn', '-c:a', 'aac', '-y', outputPath],
      { inputForProgress: videoPath, onProgress: opts.onProgress },
    )
  } else {
    const expr = muteSegments.map((s) => `between(t,${s.startTime},${s.endTime})`).join('+')
    await runFfmpeg(
      ['-i', videoPath, '-af', `volume=enable='${expr}':volume=0`, '-vn', '-c:a', 'aac', '-y', outputPath],
      { inputForProgress: videoPath, onProgress: opts.onProgress },
    )
  }
}

export async function convertWebVttToAss(vttContent, config) {
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

  const lines = String(vttContent || '').split(/\r?\n/)
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

  const primaryColor = toAssColor(config?.textColor ?? '#ffffff', 1)
  const secondaryColor = primaryColor
  const outlineColor = toAssColor(config?.outlineColor ?? '#000000', 0.9)
  const backgroundColor = toAssColor(config?.backgroundColor ?? '#000000', config?.backgroundOpacity ?? 0.65)
  const fontSize = Math.max(12, Math.min(72, Math.round(config?.fontSize ?? 18)))
  const engFontSize = Math.max(12, Math.min(72, Math.round(fontSize * 0.65)))
  const verticalMargin = Math.round(fontSize)
  // For BorderStyle=3 (opaque box), the Outline field defines box padding.
  // Provide a sensible padding proportional to font size so background is visible.
  const boxPadZh = Math.max(2, Math.round(fontSize * 0.12))
  const boxPadEn = Math.max(2, Math.round(engFontSize * 0.12))

  const hdr = [
    '[Script Info]',
    'Title: Generated Subtitles',
    'ScriptType: v4.00+',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Use BorderStyle=3 (opaque box) so BackColour renders as a box background.
    // Set Outline=0 and Shadow=0 for a clean box matching the configured opacity/color.
    `Style: English,Arial,${engFontSize},${primaryColor},${secondaryColor},${outlineColor},${backgroundColor},0,0,0,0,100,100,0,0,3,${boxPadEn},0,2,0,0,${verticalMargin},1`,
    `Style: Chinese,Arial,${fontSize},${primaryColor},${secondaryColor},${outlineColor},${backgroundColor},0,0,0,0,100,100,0,0,3,${boxPadZh},0,2,0,0,${verticalMargin},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]

  const body = events.flatMap((e) => {
    const lines = []
    if (e.zh) lines.push(`Dialogue: 0,${e.start},${e.end},Chinese,,0,0,0,,${e.zh}`)
    if (e.eng) lines.push(`Dialogue: 0,${e.start},${e.end},English,,0,0,0,,${e.eng}`)
    return lines
  })

  return [...hdr, ...body].join('\n')
}

export const defaultSubtitleRenderConfig = {
  fontSize: 18,
  textColor: '#ffffff',
  backgroundColor: '#000000',
  backgroundOpacity: 0.65,
  outlineColor: '#000000',
  timeSegmentEffects: [],
  hintTextConfig: {
    enabled: false,
    text: 'Please wait...',
    fontSize: 24,
    textColor: '#ffffff',
    backgroundColor: '#000000',
    backgroundOpacity: 0.8,
    outlineColor: '#000000',
    position: 'center',
    animation: 'fade-in',
  },
}

export default {
  renderVideoWithSubtitles,
  convertWebVttToAss,
  getVideoResolution,
  escapeForFFmpegFilterPath,
  defaultSubtitleRenderConfig,
}
