import { spawn, type SpawnOptions } from 'node:child_process'

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

export async function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    videoPath,
    '-vn',
    '-acodec',
    'libmp3lame',
    '-b:a',
    '128k',
    '-ar',
    '16000',
    audioPath,
  ]
  await run('ffmpeg', args)
}

export default { downloadVideo, extractAudio }

