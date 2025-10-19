import { spawn } from 'node:child_process'

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr })
      const err = new Error(`${command} exited with code ${code}: ${stderr || stdout}`)
      // @ts-ignore
      err.code = code
      return reject(err)
    })
  })
}

async function hasBinary(cmd) {
  try {
    await run(cmd, ['--version'])
    return true
  } catch {
    return false
  }
}

export async function downloadVideo(url, quality, outputPath, options = {}) {
  const format = quality === '720p'
    ? 'bestvideo[height<=720]+bestaudio/best'
    : 'bestvideo[height<=1080]+bestaudio/best'

  const args = [
    url,
    '-f', format,
    '--merge-output-format', 'mp4',
    '-o', outputPath,
  ]
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
      const obj = JSON.parse(lines[i])
      return { rawMetadata: obj }
    } catch {}
  }
  return { rawMetadata: undefined }
}

export async function extractAudio(videoPath, audioPath) {
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', videoPath,
    '-vn',
    '-acodec', 'libmp3lame',
    '-b:a', '128k',
    '-ar', '16000',
    audioPath,
  ]
  await run('ffmpeg', args)
}

export default { downloadVideo, extractAudio }
