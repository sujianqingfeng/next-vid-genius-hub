import { spawn, type SpawnOptions } from 'node:child_process'
import { promises as fs } from 'node:fs'

type RunResult = { stdout: string; stderr: string }

function run(command: string, args: string[], opts: SpawnOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString()
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

export async function downloadVideo(
  url: string,
  quality: '720p' | '1080p',
  outputPath: string,
  options: { proxy?: string; captureJson?: boolean } = {},
): Promise<{ rawMetadata: unknown | undefined }> {
  const format =
    quality === '720p'
      ? 'bestvideo[height<=720]+bestaudio/best'
      : 'bestvideo[height<=1080]+bestaudio/best'

  const args = [url, '-f', format, '--merge-output-format', 'mp4', '-o', outputPath]
  if (options.proxy) {
    args.push('--proxy', options.proxy)
  }

  const capture = Boolean(options.captureJson)
  const argsWithJson = capture ? [...args, '--print-json', '--no-playlist'] : args

  if (!(await hasBinary('yt-dlp'))) {
    throw new Error('yt-dlp binary not found on PATH')
  }
  const { stdout } = await run('yt-dlp', argsWithJson)
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
  const args = [url, '--skip-download', '--print-json', '--no-playlist']
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
