import { spawn } from 'node:child_process'
import path from 'node:path'
import { ProxyAgent, fetch as undiciFetch } from 'undici'
import { Innertube, UniversalCache } from 'youtubei.js'
import { randomUUID } from 'node:crypto'

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

/**
 * Download a video using yt-dlp (binary if available; fallback to yt-dlp-wrap).
 * @param {string} url
 * @param {('1080p'|'720p')} quality
 * @param {string} outputPath absolute path ending with .mp4
 * @param {{ proxy?: string }} [options]
 */
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

  if (await hasBinary('yt-dlp')) {
    const { stdout } = await run('yt-dlp', argsWithJson)
    if (!capture) return { rawMetadata: undefined }
    // Try parse last JSON object from stdout
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

  // Fallback to yt-dlp-wrap if the binary is not on PATH
  let YTDlpWrap
  try {
    const mod = await import('yt-dlp-wrap')
    YTDlpWrap = mod.default || mod
  } catch (e) {
    throw new Error('yt-dlp not found on PATH and yt-dlp-wrap is not installed')
  }
  const ytdlp = new YTDlpWrap()
  const stdout = await ytdlp.execPromise([url, '-f', format, '--merge-output-format', 'mp4', '-o', outputPath, ...(capture ? ['--print-json', '--no-playlist'] : [])])
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

/**
 * Extract audio (mp3, 16kHz) using ffmpeg
 * @param {string} videoPath
 * @param {string} audioPath
 */
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

/**
 * Minimal, environment-agnostic download pipeline that delegates to injected tools.
 * @param {{ url: string, quality: '1080p'|'720p' }} req
 * @param {{
 *  ensureDir: (dir: string) => Promise<void>,
 *  resolvePaths: () => Promise<{ videoPath: string, audioPath: string, metadataPath?: string }>,
 *  downloader?: (url: string, quality: '1080p'|'720p', out: string) => Promise<void>,
 *  audioExtractor?: (videoPath: string, audioPath: string) => Promise<void>,
 *  persistRawMetadata?: (data: unknown) => Promise<void>,
 * }} env
 * @param {(e: { stage: string, progress: number, message?: string }) => void} [progress]
 */
export async function runDownloadPipeline(req, env, progress) {
  const report = (e) => { try { progress && progress(e) } catch {} }
  report({ stage: 'preparing', progress: 0.05 })

  const { videoPath, audioPath, metadataPath } = await env.resolvePaths()
  if (env.ensureDir) await env.ensureDir(path.dirname(videoPath))

  const dl = env.downloader || ((u, q, out) => downloadVideo(u, q, out, { captureJson: true }))
  report({ stage: 'downloading', progress: 0.4 })
  const dlRes = await dl(req.url, req.quality, videoPath)
  if (dlRes && dlRes.rawMetadata && env.persistRawMetadata) {
    try { await env.persistRawMetadata(dlRes.rawMetadata) } catch {}
  }

  const ex = env.audioExtractor || ((v, a) => extractAudio(v, a))
  report({ stage: 'extracting_audio', progress: 0.7 })
  await ex(videoPath, audioPath)

  // Optional uploads via injected artifact store
  if (env.artifactStore) {
    report({ stage: 'uploading', progress: 0.9 })
    if (env.artifactStore.uploadMetadata && (dlRes && dlRes.rawMetadata)) {
      try { await env.artifactStore.uploadMetadata(dlRes.rawMetadata) } catch {}
    }
    if (env.artifactStore.uploadVideo) {
      try { await env.artifactStore.uploadVideo(videoPath) } catch {}
    }
    if (env.artifactStore.uploadAudio) {
      try { await env.artifactStore.uploadAudio(audioPath) } catch {}
    }
    report({ stage: 'uploading', progress: 0.95 })
  }

  report({ stage: 'completed', progress: 1 })
  return { videoPath, audioPath, metadataPath, rawMetadata: dlRes && dlRes.rawMetadata }
}

export default {
  downloadVideo,
  extractAudio,
  runDownloadPipeline,
}

// ---- Comments helpers (inlined to avoid subpath resolution issues) ----
function makeFetchWithProxy(proxyUrl) {
  const agent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined
  return async (input, init = {}) => {
    try {
      let url
      const opts = { ...(init || {}) }
      if (typeof input === 'string') {
        url = input
      } else if (input instanceof URL) {
        url = input.toString()
      } else if (input && typeof input === 'object') {
        const maybeUrl = input.url || input.href || input.toString?.()
        url = typeof maybeUrl === 'string' ? maybeUrl : String(maybeUrl)
        if (input.method && !opts.method) opts.method = input.method
        if (input.headers && !opts.headers) opts.headers = input.headers
        if (input.body && !opts.body) opts.body = input.body
      } else {
        url = String(input)
      }
      if (agent) opts.dispatcher = agent
      return await undiciFetch(url, opts)
    } catch (e) {
      // Fallback to raw dispatch if normalization fails
      const opts = { ...(init || {}) }
      if (agent) opts.dispatcher = agent
      return await undiciFetch(input, opts)
    }
  }
}

export function extractVideoId(url) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace(/^\//, '') || null
    }
    if (u.searchParams.get('v')) return u.searchParams.get('v')
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] === 'shorts' && parts[1]) return parts[1]
    return null
  } catch {
    return null
  }
}

async function getYouTubeClientForCore(proxyUrl) {
  const cache = new UniversalCache(true)
  const fetchWithProxy = makeFetchWithProxy(proxyUrl)
  return Innertube.create({ cache, fetch: fetchWithProxy })
}

function mapYoutubeComment(item) {
  const c = item?.comment || item || {}
  return {
    id: c.id || (randomUUID ? randomUUID() : Math.random().toString(36).slice(2)),
    content: (c.content && c.content.text) || '',
    author: (c.author && c.author.name) || '',
    likes: Number(c.like_count || 0) || 0,
    authorThumbnail: (c.author && c.author.thumbnails && c.author.thumbnails[0]?.url) || '',
    replyCount: c.reply_count || 0,
    translatedContent: '',
  }
}

export async function downloadYoutubeComments({ url, pages = 3, proxy }) {
  const youtube = await getYouTubeClientForCore(proxy)
  const videoId = extractVideoId(url)
  if (!videoId) return []
  const commentsRoot = await youtube.getComments(videoId)
  const initial = commentsRoot?.contents || []
  if (!initial.length) return []
  let comments = initial.map(mapYoutubeComment)
  let current = commentsRoot
  let page = 1
  while (current.has_continuation && page < pages) {
    const next = await current.getContinuation()
    const list = next?.contents || []
    if (!list.length) break
    comments = comments.concat(list.map(mapYoutubeComment))
    current = next
    page++
  }
  return comments
}

async function resolveAwemeIdViaTikwm(url, proxyUrl) {
  try {
    const _fetch = makeFetchWithProxy(proxyUrl)
    const endpoint = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`
    const r = await _fetch(endpoint, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
        Accept: 'application/json',
      },
    })
    if (!r.ok) return null
    const json = await r.json()
    const data = (json && json.data) || {}
    return data.aweme_id || data.awemeId || null
  } catch {
    return null
  }
}

async function fetchTikwmComments(awemeId, cursor, proxyUrl) {
  const _fetch = makeFetchWithProxy(proxyUrl)
  const endpoint = `https://www.tikwm.com/api/comment/list/?aweme_id=${encodeURIComponent(awemeId)}&count=50&cursor=${cursor}`
  const r = await _fetch(endpoint, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
      Accept: 'application/json',
      Referer: 'https://www.tikwm.com/',
    },
  })
  try {
    return await r.json()
  } catch {
    return {}
  }
}

export async function downloadTikTokCommentsByUrl({ url, pages = 3, proxy }) {
  const awemeId = await resolveAwemeIdViaTikwm(url, proxy)
  if (!awemeId) return []
  const results = []
  let cursor = 0
  for (let i = 0; i < pages; i++) {
    const data = await fetchTikwmComments(awemeId, cursor, proxy)
    const list = Array.isArray(data?.data?.comments) ? data.data.comments : []
    for (const c of list) {
      const id = String(c?.cid ?? c?.comment_id ?? c?.id ?? '')
      if (!id) continue
      const user = (c?.user || c?.user_info || {})
      const author = user?.nickname || user?.unique_id || user?.nick_name || 'Unknown'
      let avatarThumb
      if (user?.avatar_thumb && typeof user.avatar_thumb === 'object') {
        avatarThumb = user.avatar_thumb.url_list?.[0]
      } else if (typeof user?.avatar_thumb === 'string') {
        avatarThumb = user.avatar_thumb
      } else if (typeof user?.avatar === 'string') {
        avatarThumb = user.avatar
      }
      const content = String(c?.text ?? c?.content ?? '')
      const likes = Number.parseInt(String(c?.digg_count ?? c?.like_count ?? 0), 10) || 0
      const replyCount = Number.parseInt(String(c?.reply_comment_total ?? c?.reply_count ?? 0), 10) || 0
      results.push({ id, author, authorThumbnail: avatarThumb, content, likes, replyCount, translatedContent: '' })
    }
    const hasMore = Boolean(data?.data?.has_more)
    const nextCursor = Number.parseInt(String(data?.data?.cursor ?? 0), 10) || 0
    if (hasMore) cursor = nextCursor
    else break
  }
  return results
}

export async function runCommentsPipeline(req, env = {}, progress) {
  const report = (e) => { try { progress && progress(e) } catch {} }
  const { url, source, pages = 3, proxy } = req
  report({ stage: 'preparing', progress: 0.05 })
  report({ stage: 'fetching_metadata', progress: 0.1 })
  let comments = []
  if (String(source).toLowerCase() === 'youtube') {
    comments = await downloadYoutubeComments({ url, pages, proxy })
  } else if (String(source).toLowerCase() === 'tiktok') {
    comments = await downloadTikTokCommentsByUrl({ url, pages, proxy })
  } else {
    comments = []
  }
  report({ stage: 'downloading', progress: 0.6 })
  if (env.artifactStore && env.artifactStore.uploadMetadata) {
    report({ stage: 'uploading', progress: 0.9 })
    try { await env.artifactStore.uploadMetadata(comments) } catch {}
    report({ stage: 'uploading', progress: 0.95 })
  }
  report({ stage: 'completed', progress: 1 })
  return { count: comments.length, comments }
}
