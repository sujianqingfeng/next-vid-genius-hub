import { spawn, type SpawnOptions } from 'node:child_process'
import { promises as fs } from 'node:fs'

type RunResult = { stdout: string; stderr: string }

function run(
  command: string,
  args: string[],
  opts: SpawnOptions & {
    onStdoutChunk?: (chunk: Buffer) => void
    onStderrChunk?: (chunk: Buffer) => void
  } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const { onStdoutChunk, onStderrChunk, ...spawnOpts } = opts as any
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...spawnOpts })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString()
      try { onStdoutChunk?.(d) } catch {}
    })
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString()
      try { onStderrChunk?.(d) } catch {}
    })
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr })
      const err: any = new Error(`${command} exited with code ${code}: ${stderr || stdout}`)
      err.code = code
      return reject(err)
    })
  })
}

async function hasBinary(cmd: string): Promise<boolean> {
  try {
    await run(cmd, ['--version'])
    return true
  } catch {
    return false
  }
}

type YtDlpProgressEvent = {
  percent?: number
  downloadedBytes?: number
  totalBytes?: number
  speedBytesPerSecond?: number
  etaSeconds?: number
  rawLine?: string
}

function parseBytesWithUnit(input: string): number | undefined {
  const m = String(input || '').trim().match(/^([0-9.]+)\s*([a-zA-Z]+)$/)
  if (!m) return undefined
  const value = Number(m[1])
  const unit = String(m[2]).trim()
  if (!Number.isFinite(value)) return undefined

  const binary = unit.includes('i')
  const u = unit.replace(/i/g, '').toUpperCase()
  const base = binary ? 1024 : 1000
  const pow =
    u === 'B'
      ? 0
      : u === 'KB'
        ? 1
        : u === 'MB'
          ? 2
          : u === 'GB'
            ? 3
            : u === 'TB'
              ? 4
              : u === 'PB'
                ? 5
                : null
  if (pow == null) return undefined
  return Math.round(value * base ** pow)
}

function parseHhMmSs(input: string): number | undefined {
  const parts = String(input || '').trim().split(':').map((p) => Number(p))
  if (parts.some((n) => !Number.isFinite(n))) return undefined
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  return undefined
}

function parseYtDlpProgressLine(line: string): YtDlpProgressEvent | null {
  const s = String(line || '').trim()
  if (!s.startsWith('[download]')) return null
  if (!s.includes('%')) return null

  // Typical:
  // [download]  12.3% of ~10.00MiB at  1.20MiB/s ETA 00:08
  // [download] 100% of 10.00MiB in 00:08
  const m =
    s.match(
      /^\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?([0-9.]+)\s*([KMGTP]?i?B)(?:\s+at\s+([0-9.]+)\s*([KMGTP]?i?B)\/s\s+ETA\s+([0-9:]+))?/i,
    ) || null
  if (!m) return { rawLine: s }

  const pct = Number(m[1])
  const total = parseBytesWithUnit(`${m[2]}${m[3]}`)
  const speed = m[4] && m[5] ? parseBytesWithUnit(`${m[4]}${m[5]}`) : undefined
  const eta = m[6] ? parseHhMmSs(m[6]) : undefined

  return {
    percent: Number.isFinite(pct) ? Math.max(0, Math.min(1, pct / 100)) : undefined,
    totalBytes: total,
    speedBytesPerSecond: speed,
    etaSeconds: eta,
    rawLine: s,
  }
}

export async function downloadVideo(
  url: string,
  quality: '720p' | '1080p',
  outputPath: string,
  options: { proxy?: string; captureJson?: boolean; onProgress?: (e: YtDlpProgressEvent) => void } = {},
): Promise<{ rawMetadata: unknown | undefined }> {
  const format =
    quality === '720p'
      ? 'bestvideo[height<=720]+bestaudio/best'
      : 'bestvideo[height<=1080]+bestaudio/best'

  const args = [url, '-f', format, '--merge-output-format', 'mp4', '-o', outputPath, '--newline']
  if (options.proxy) {
    args.push('--proxy', options.proxy)
  }

  const capture = Boolean(options.captureJson)
  const argsWithJson = capture ? [...args, '--print-json', '--no-playlist'] : args

  if (!(await hasBinary('yt-dlp'))) {
    throw new Error('yt-dlp binary not found on PATH')
  }

  let stderrBuf = ''
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null
  const { stdout } = await run('yt-dlp', argsWithJson, {
    onStderrChunk: (chunk) => {
      if (!onProgress) return
      stderrBuf += chunk.toString()
      let idx: number
      while ((idx = stderrBuf.indexOf('\n')) !== -1) {
        const line = stderrBuf.slice(0, idx).trim()
        stderrBuf = stderrBuf.slice(idx + 1)
        if (!line) continue
        const parsed = parseYtDlpProgressLine(line)
        if (parsed) {
          try {
            onProgress(parsed)
          } catch {}
        }
      }
    },
  })
  if (!capture) return { rawMetadata: undefined }
  const lines = String(stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]!)
      return { rawMetadata: obj }
    } catch {}
  }
  return { rawMetadata: undefined }
}

export async function fetchVideoMetadata(
  url: string,
  options: { proxy?: string } = {},
): Promise<unknown | undefined> {
  const args = [url, '--skip-download', '--print-json', '--no-playlist', '--newline']
  if (options.proxy) {
    args.push('--proxy', options.proxy)
  }

  if (!(await hasBinary('yt-dlp'))) {
    throw new Error('yt-dlp binary not found on PATH')
  }

  const { stdout } = await run('yt-dlp', args)
  const lines = String(stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]!)
    } catch {}
  }

  return undefined
}

export async function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  // Processed audio: 16kHz mono WAV (PCM S16LE) for downstream ASR workflows.
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    videoPath,
    '-vn',
    '-ar',
    '16000',
    '-ac',
    '1',
    '-c:a',
    'pcm_s16le',
    audioPath,
  ]
  await run('ffmpeg', args)
}

export async function extractAudioSource(videoPath: string, audioPath: string): Promise<void> {
  // Lossless stream copy from the downloaded MP4.
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    videoPath,
    '-vn',
    // Matroska audio container supports common codecs (AAC/Opus/etc) for -c:a copy.
    '-f',
    'matroska',
    '-c:a',
    'copy',
    audioPath,
  ]
  await run('ffmpeg', args)
}

export async function transcodeAudioToWav(
  inputPath: string,
  outputPath: string,
  options: { sampleRate?: number; channels?: number } = {},
): Promise<void> {
  const sampleRate = Number(options.sampleRate ?? 16000)
  const channels = Number(options.channels ?? 1)
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-ar',
    String(sampleRate),
    '-ac',
    String(channels),
    '-c:a',
    'pcm_s16le',
    outputPath,
  ]
  await run('ffmpeg', args)
}

export async function transcodeToTargetSize(
  inputPath: string,
  outputPath: string,
  options: {
    maxBytes?: number
    bitrates?: Array<number>
    sampleRate?: number
    ffmpegBin?: string
    onPass?: (info: { pass: number; total: number; bitrate: number }) => void
  } = {},
): Promise<{ size: number; bitrate: number }> {
  const maxBytes = options.maxBytes ?? 4 * 1024 * 1024
  const sampleRate = Number(options.sampleRate ?? 16000)
  const ffmpegBin = options.ffmpegBin || 'ffmpeg'
  const bitrates = (options.bitrates && options.bitrates.length ? options.bitrates : [48, 24]).map((b) => {
    const n = Number(b) || 48
    return Math.max(16, Math.min(256, n))
  })

  let lastSize = 0
  let lastBr = bitrates[bitrates.length - 1] || 48

  for (let i = 0; i < bitrates.length; i++) {
    const br = bitrates[i]!
    options.onPass?.({ pass: i + 1, total: bitrates.length, bitrate: br })

    const args = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      String(sampleRate),
      '-b:a',
      `${br}k`,
      outputPath,
    ]
    await run(ffmpegBin, args)

    const stat = await fs.stat(outputPath)
    lastSize = stat.size
    lastBr = br
    if (lastSize <= maxBytes || i === bitrates.length - 1) {
      break
    }
  }

  return { size: lastSize, bitrate: lastBr }
}

export default {
  downloadVideo,
  fetchVideoMetadata,
  extractAudio,
  extractAudioSource,
  transcodeAudioToWav,
  transcodeToTargetSize,
}
