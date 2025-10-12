import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHmac } from 'node:crypto'
import { spawn } from 'node:child_process'
import net from 'node:net'
import { readFileSync, unlinkSync } from 'node:fs'
import { promises as fsPromises } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import YAML from 'yaml'
import { ProxyAgent } from 'undici'
import { Innertube, UniversalCache } from 'youtubei.js'

const PORT = process.env.PORT || 8080
const CALLBACK_SECRET = process.env.JOB_CALLBACK_HMAC_SECRET || 'dev-secret'
const MIHOMO_BIN = process.env.MIHOMO_BIN || '/usr/local/bin/mihomo'
const MIHOMO_CONFIG_DIR = process.env.MIHOMO_CONFIG_DIR || '/app/clash'
const MIHOMO_PROVIDER_DIR = join(MIHOMO_CONFIG_DIR, 'providers')
const MIHOMO_PORT = Number.parseInt(process.env.MIHOMO_PORT || '7890', 10)
const MIHOMO_SOCKS_PORT = Number.parseInt(process.env.MIHOMO_SOCKS_PORT || '7891', 10)
const CLASH_MODE = process.env.CLASH_MODE || 'Rule'
const CLASH_SUBSCRIPTION_URL = process.env.CLASH_SUBSCRIPTION_URL?.trim()
const CLASH_RAW_CONFIG = process.env.CLASH_RAW_CONFIG

const FORWARD_PROXY_PROTOCOLS = new Set(['http', 'https', 'socks4', 'socks5'])

function parseBooleanFlag(value) {
	if (value === null || value === undefined) return undefined
	const normalized = value.toString().trim().toLowerCase()
	if (!normalized) return undefined
	return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function ensureLeadingSlash(path) {
	if (!path) return '/'
	return path.startsWith('/') ? path : `/${path}`
}

function parseNumber(value, fallback) {
	if (!value) return fallback
	const parsed = Number.parseInt(value, 10)
	return Number.isNaN(parsed) ? fallback : parsed
}

async function ensureDirExists(dir) {
	try {
		await fsPromises.mkdir(dir, { recursive: true })
	} catch (error) {
		if (error.code !== 'EEXIST') throw error
	}
}

function decodeBase64Url(input = '') {
	let normalized = input.replace(/-/g, '+').replace(/_/g, '/')
	const pad = normalized.length % 4
	if (pad === 2) normalized += '=='
	else if (pad === 3) normalized += '='
	else if (pad !== 0) normalized += '=='
	return Buffer.from(normalized, 'base64').toString('utf8')
}

function parseSsrUrl(ssrUrl) {
	if (!ssrUrl || !ssrUrl.startsWith('ssr://')) return null
	try {
		const decoded = decodeBase64Url(ssrUrl.slice(6))
		const [main, paramSegment] = decoded.split('/?')
		const [server, port, protocol, method, obfs, passwordEncoded] = main.split(':')
		const password = decodeBase64Url(passwordEncoded)
		const params = {}
		if (paramSegment) {
			for (const segment of paramSegment.split('&')) {
				if (!segment) continue
				const [key, value = ''] = segment.split('=')
				params[key] = value ? decodeBase64Url(value) : ''
			}
		}

		return {
			server,
			port: Number.parseInt(port, 10),
			protocol,
			method,
			obfs,
			password,
			obfsParam: params.obfsparam,
			protocolParam: params.protoparam,
			remarks: params.remarks,
			group: params.group,
		}
	} catch (error) {
		console.error('[media-downloader] Failed to parse SSR URL', error)
		return null
	}
}

function createClashProxyFromDb(proxy) {
	if (!proxy) return null
	const baseName = proxy.name || proxy.server || 'remote-node'

	const nodeUrl = proxy.nodeUrl
	if (nodeUrl && nodeUrl.startsWith('ssr://')) {
		const parsed = parseSsrUrl(nodeUrl)
		if (!parsed) return null
		return {
			name: baseName,
			type: 'ssr',
			server: parsed.server,
			port: parsed.port,
			cipher: parsed.method,
			password: parsed.password,
			protocol: parsed.protocol,
			'protocol-param': parsed.protocolParam,
			obfs: parsed.obfs,
			'obfs-param': parsed.obfsParam,
			'udp-relay': true,
			'skip-cert-verify': true,
		}
	}

	if (nodeUrl && /^trojan:\/\//i.test(nodeUrl)) {
		try {
			const url = new URL(nodeUrl)
			const params = url.searchParams
			const password = decodeURIComponent(url.password || url.username || '')
			const finalPassword = password || proxy.password || proxy.username
			if (!finalPassword) {
			console.warn('[media-downloader] Trojan node missing password, skipping', baseName)
				return null
			}

			const sni = params.get('sni') || params.get('peer') || params.get('host') || url.hostname
			const allowInsecure =
				parseBooleanFlag(params.get('allowinsecure') || params.get('allowInsecure') || params.get('insecure')) ?? true
			const alpnParam = params.get('alpn')
			const alpn = alpnParam ? alpnParam.split(',').map((v) => v.trim()).filter(Boolean) : undefined
			const network = (params.get('type') || params.get('network') || '').toLowerCase()
			const mux = parseBooleanFlag(params.get('mux'))

			const proxyConfig = {
				name: baseName,
				type: 'trojan',
				server: url.hostname,
				port: parseNumber(url.port, 443),
				password: finalPassword,
				udp: true,
				'skip-cert-verify': allowInsecure,
			}

			if (sni) proxyConfig.sni = sni
			if (alpn?.length) proxyConfig.alpn = alpn
			if (mux !== undefined) proxyConfig.mux = mux

			if (network === 'ws' || network === 'websocket') {
				proxyConfig.network = 'ws'
				const wsOpts = {}
				const path = params.get('path')
				const host = params.get('host') || params.get('authority') || sni
				if (path) wsOpts.path = ensureLeadingSlash(path)
				if (host) wsOpts.headers = { Host: host }
				if (Object.keys(wsOpts).length) proxyConfig['ws-opts'] = wsOpts
			} else if (network === 'grpc') {
				proxyConfig.network = 'grpc'
				const grpcOpts = {}
				const serviceName = params.get('servicename') || params.get('serviceName')
				const mode = params.get('mode')
				if (serviceName) grpcOpts['grpc-service-name'] = serviceName
				if (mode) grpcOpts['grpc-mode'] = mode
				if (Object.keys(grpcOpts).length) proxyConfig['grpc-opts'] = grpcOpts
			}

			return proxyConfig
		} catch (error) {
		console.error('[media-downloader] Failed to parse Trojan node', error)
			return null
		}
	}

	if (nodeUrl && /^vless:\/\//i.test(nodeUrl)) {
		try {
			const url = new URL(nodeUrl)
			const params = url.searchParams
			const uuid = decodeURIComponent(url.username || '')
			if (!uuid) {
			console.warn('[media-downloader] VLESS node missing UUID, skipping', baseName)
				return null
			}

			const security = (params.get('security') || '').toLowerCase()
			const network = (params.get('type') || params.get('network') || 'tcp').toLowerCase()
			const sni = params.get('sni') || params.get('host') || url.hostname
			const fingerprint = params.get('fp') || params.get('fingerprint')
			const flow = params.get('flow')
			const alpnParam = params.get('alpn')
			const alpn = alpnParam ? alpnParam.split(',').map((v) => v.trim()).filter(Boolean) : undefined
			const allowInsecure = parseBooleanFlag(params.get('allowinsecure') || params.get('allowInsecure') || params.get('insecure'))
			const encryption = params.get('encryption')

			const proxyConfig = {
				name: baseName,
				type: 'vless',
				server: url.hostname,
				port: parseNumber(url.port, security === 'tls' || security === 'reality' ? 443 : 80),
				uuid,
				udp: true,
				'skip-cert-verify': allowInsecure ?? true,
			}

			if (fingerprint) proxyConfig['client-fingerprint'] = fingerprint
			if (flow) proxyConfig.flow = flow
			if (alpn?.length) proxyConfig.alpn = alpn
			if (encryption && encryption !== 'none') proxyConfig['packet-encoding'] = encryption

			if (security === 'tls' || security === 'reality') {
				proxyConfig.tls = true
				proxyConfig.servername = sni
				if (security === 'reality') {
					const realityOpts = {}
					const publicKey = params.get('pbk') || params.get('publickey') || params.get('public-key')
					const shortId = params.get('sid') || params.get('shortid') || params.get('short-id')
					const spiderX = params.get('spx') || params.get('spiderx') || params.get('spider-x')
					if (publicKey) realityOpts['public-key'] = publicKey
					if (shortId) realityOpts['short-id'] = shortId
					if (spiderX) realityOpts['spider-x'] = spiderX
					if (Object.keys(realityOpts).length) proxyConfig['reality-opts'] = realityOpts
				}
			} else if (sni) {
				proxyConfig.servername = sni
			}

			if (network !== 'tcp') {
				proxyConfig.network = network
			}

			if (network === 'ws') {
				const wsOpts = {}
				const wsPath = params.get('path')
				const hostHeader = params.get('host') || params.get('authority')
				const earlyData = params.get('ed') || params.get('maxearlydata') || params.get('earlydata')
				const earlyHeader = params.get('edh') || params.get('earlydataheader') || params.get('earlydataheadername')

				wsOpts.path = ensureLeadingSlash(wsPath || '/')
				const headers = {}
				if (hostHeader) headers.Host = hostHeader
				if (Object.keys(headers).length) wsOpts.headers = headers
				if (earlyData) {
					const earlyValue = Number.parseInt(earlyData, 10)
					if (!Number.isNaN(earlyValue)) wsOpts['max-early-data'] = earlyValue
				}
				if (earlyHeader) wsOpts['early-data-header-name'] = earlyHeader
				proxyConfig['ws-opts'] = wsOpts
			} else if (network === 'grpc') {
				const grpcOpts = {}
				const serviceName = params.get('servicename') || params.get('serviceName')
				const mode = params.get('mode')
				if (serviceName) grpcOpts['grpc-service-name'] = serviceName
				if (mode) grpcOpts['grpc-mode'] = mode
				if (Object.keys(grpcOpts).length) proxyConfig['grpc-opts'] = grpcOpts
			} else if (network === 'h2' || network === 'http') {
				proxyConfig.network = 'http'
				const httpOpts = {}
				const path = params.get('path')
				const host = params.get('host')
				if (path) {
					const normalizedPaths = path
						.split(',')
						.map((p) => ensureLeadingSlash(p.trim()))
						.filter(Boolean)
					if (normalizedPaths.length) httpOpts.path = normalizedPaths
				}
				if (host) {
					httpOpts.headers = { Host: host }
				}
				if (Object.keys(httpOpts).length) proxyConfig['http-opts'] = httpOpts
			}

			return proxyConfig
		} catch (error) {
		console.error('[media-downloader] Failed to parse VLESS node', error)
			return null
		}
	}

	if (proxy.server && proxy.port && proxy.protocol) {
		const port = Number.parseInt(proxy.port, 10)
		const sharedBase = {
			name: baseName,
			server: proxy.server,
			port,
			'udp-relay': true,
			'skip-cert-verify': true,
		}
		if (proxy.protocol === 'http' || proxy.protocol === 'https') {
			const httpProxy = {
				...sharedBase,
				type: 'http',
				tls: proxy.protocol === 'https',
			}
			if (proxy.username && proxy.password) {
				httpProxy.username = proxy.username
				httpProxy.password = proxy.password
			}
			return httpProxy
		}
		if (proxy.protocol === 'socks4' || proxy.protocol === 'socks5') {
			const socksProxy = {
				...sharedBase,
				type: 'socks5',
			}
			if (proxy.username && proxy.password) {
				socksProxy.username = proxy.username
				socksProxy.password = proxy.password
			}
			return socksProxy
		}
		if (proxy.protocol === 'trojan') {
			const finalPassword = proxy.password || proxy.username
			if (!finalPassword) {
			console.warn('[media-downloader] Trojan proxy missing password; cannot configure Clash', baseName)
				return null
			}
			const trojanBase = {
				name: baseName,
				type: 'trojan',
				server: proxy.server,
				port,
				password: finalPassword,
				udp: true,
				'skip-cert-verify': true,
			}
			return trojanBase
		}
	}
	return null
}

function buildClashConfig(engineOptions = {}) {
	if (CLASH_RAW_CONFIG) {
		return CLASH_RAW_CONFIG
	}

	const proxies = []
	const providerGroups = []
	const dbProxy = createClashProxyFromDb(engineOptions.proxy)
	if (dbProxy) proxies.push(dbProxy)

	const hasSubscription = Boolean(CLASH_SUBSCRIPTION_URL)

	if (!proxies.length && !hasSubscription) {
		const proxyDebug = engineOptions?.proxy
			? {
					hasNodeUrl: Boolean(engineOptions.proxy.nodeUrl),
					protocol: engineOptions.proxy.protocol,
					server: engineOptions.proxy.server,
					port: engineOptions.proxy.port,
				}
			: null
	console.log('[media-downloader] skipping mihomo (no proxy config available)', {
			hasSubscription,
			proxyDebug,
		})
		return null
	}

	const config = {
		port: MIHOMO_PORT,
		'socks-port': MIHOMO_SOCKS_PORT,
		'allow-lan': true,
		mode: CLASH_MODE,
		'log-level': 'info',
		'ipv6': true,
		rules: ['MATCH,Proxy'],
	}

	if (proxies.length) {
		config.proxies = proxies
	}

	const mainGroup = {
		name: 'Proxy',
		type: 'select',
		proxies: proxies.map((p) => p.name),
	}

	if (hasSubscription) {
		config['proxy-providers'] = {
			subscription: {
				type: 'http',
				url: CLASH_SUBSCRIPTION_URL,
				path: './providers/subscription.yaml',
				interval: 3600,
				healthcheck: {
					enable: true,
					url: 'http://www.gstatic.com/generate_204',
					interval: 300,
				},
			},
		}
		providerGroups.push('subscription')
	}

	mainGroup.proxies.push('DIRECT')
	if (providerGroups.length) {
		mainGroup.use = providerGroups
	}

	config['proxy-groups'] = [mainGroup]

	return YAML.stringify(config)
}

function waitForPort(port, host = '127.0.0.1', maxAttempts = 20, intervalMs = 500) {
	return new Promise((resolve, reject) => {
		let attempts = 0
		const attempt = () => {
			const socket = net.createConnection({ port, host }, () => {
				socket.end()
				resolve()
			})
			socket.on('error', (error) => {
				socket.destroy()
				attempts += 1
				if (attempts >= maxAttempts) {
					reject(new Error(`Clash proxy not ready on ${host}:${port}: ${error.message}`))
				} else {
					setTimeout(attempt, intervalMs)
				}
			})
		}
		attempt()
	})
}

async function startMihomo(engineOptions) {
	const configText = buildClashConfig(engineOptions)
	if (!configText) return null

	await ensureDirExists(MIHOMO_CONFIG_DIR)
	await ensureDirExists(MIHOMO_PROVIDER_DIR)

	const configPath = join(MIHOMO_CONFIG_DIR, 'config.yaml')
	await fsPromises.writeFile(configPath, configText, 'utf8')

	console.log('[media-downloader] starting mihomo', {
		configPath,
		port: MIHOMO_PORT,
		socksPort: MIHOMO_SOCKS_PORT,
		mode: CLASH_MODE,
	})

	let child
	try {
		child = spawn(MIHOMO_BIN, ['-d', MIHOMO_CONFIG_DIR], {
			stdio: ['ignore', 'inherit', 'inherit'],
		})
	} catch (error) {
		console.error('[media-downloader] Failed to spawn mihomo', error)
		return null
	}

	try {
		await waitForPort(MIHOMO_PORT)
	console.log('[media-downloader] mihomo ready', { httpPort: MIHOMO_PORT })
		return {
			proxyUrl: `http://127.0.0.1:${MIHOMO_PORT}`,
			async cleanup() {
				if (!child.killed) {
					child.kill('SIGTERM')
					await delay(200)
				}
			},
		}
	} catch (error) {
		child.kill('SIGTERM')
		console.error('[media-downloader] Clash proxy failed to start', error)
		return null
	}
}

function sendJson(res, status, data) {
	res.writeHead(status, { 'content-type': 'application/json' })
	res.end(JSON.stringify(data))
}

function hmacHex(secret, payload) {
	return createHmac('sha256', secret).update(payload).digest('hex')
}

function randomNonce() {
	return randomUUID()
}

function runCommand(bin, args, { cwd, env } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
		let stdout = ''
		let stderr = ''
		child.stdout.on('data', (chunk) => {
			stdout += chunk.toString()
		})
		child.stderr.on('data', (chunk) => {
			stderr += chunk.toString()
		})
		child.on('error', reject)
		child.on('close', (code) => {
			if (code === 0) resolve({ stdout, stderr })
			else reject(new Error(stderr || stdout || `${bin} exited with code ${code}`))
		})
	})
}

async function downloadVideoWithYtDlp({ url, quality, outputPath, proxy }) {
	const format =
		quality === '720p'
			? 'bestvideo[height<=720]+bestaudio/best'
			: 'bestvideo[height<=1080]+bestaudio/best'
	const args = [
		url,
		'-f',
		format,
		'--merge-output-format',
		'mp4',
		'-o',
		outputPath,
		'--print-json',
		'--no-playlist',
	]
	if (proxy) {
		args.push('--proxy', proxy)
	}
	const { stdout } = await runCommand('yt-dlp', args)
	// yt-dlp may output progress lines; metadata JSON is usually the last JSON object
	const lines = stdout
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
	let metadata = null
	for (let i = lines.length - 1; i >= 0; i--) {
		try {
			metadata = JSON.parse(lines[i])
			break
		} catch {
			// continue searching
		}
	}
	return metadata
}

async function downloadCommentsWithYtDlp({ url, outDir, proxy, source, maxComments }) {
  await ensureDirExists(outDir)
  const template = join(outDir, '%(id)s')
  const args = [
    url,
    '--skip-download',
    '--write-info-json',
    '--write-comments',
    '-o',
    template,
  ]
  // Limit comment count for YouTube if requested
  if (maxComments && source && String(source).toLowerCase() === 'youtube') {
    const max = Math.max(1, Number.parseInt(String(maxComments), 10) || 0)
    args.push('--extractor-args', `youtube:max_comments=${max}`)
  }
  if (proxy) args.push('--proxy', proxy)
  await runCommand('yt-dlp', args)

  // Find generated *.comments.json and *.info.json
  const files = await fsPromises.readdir(outDir).catch(() => [])
  const commentsFile = files.find((f) => f.endsWith('.comments.json'))
  let comments = []
  if (commentsFile) {
    try {
      const raw = await fsPromises.readFile(join(outDir, commentsFile), 'utf8')
      const parsed = JSON.parse(raw)
      const list = Array.isArray(parsed) ? parsed : (parsed.comments || [])
      for (const c of list) {
        const id = String(c?.id || c?.cid || c?.comment_id || randomUUID())
        const author = c?.author?.name || c?.author || ''
        const authorThumb = c?.author_thumbnail || c?.author?.thumbnails?.[0]?.url || undefined
        const content = typeof c?.text === 'string' ? c.text : (c?.content?.text || '')
        const likes = Number.parseInt(String(c?.like_count ?? c?.likes ?? 0), 10) || 0
        const replyCount = Number.parseInt(String(c?.reply_count ?? c?.reply_comment_total ?? 0), 10) || 0
        comments.push({ id, author, authorThumbnail: authorThumb, content, likes, replyCount, translatedContent: '' })
      }
    } catch (err) {
      console.error('[media-downloader] failed to parse comments json', err)
    }
  }

  // As a fallback, build a minimal payload
  return { comments }
}

// ------------ YouTube (youtubei.js) comments downloader to match local semantics ------------
function extractVideoId(url) {
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

function buildFetchWithProxy(proxyUrl) {
  const agent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined
  return async (input, init = {}) => {
    try {
      let url
      let opts = { ...(init || {}) }
      if (typeof input === 'string') {
        url = input
      } else if (input instanceof URL) {
        url = input.toString()
      } else if (input && typeof input === 'object') {
        // Request-like object normalization (youtubei.js may pass its own Request)
        const maybeUrl = input.url || input.href || input.toString?.()
        url = typeof maybeUrl === 'string' ? maybeUrl : String(maybeUrl)
        // Merge basic fields if present
        if (input.method && !opts.method) opts.method = input.method
        if (input.headers && !opts.headers) opts.headers = input.headers
        if (input.body && !opts.body) opts.body = input.body
      } else {
        url = String(input)
      }
      if (agent) opts.dispatcher = agent
      return await globalThis.fetch(url, opts)
    } catch (e) {
      // fallback raw
      return await globalThis.fetch(input, init)
    }
  }
}

async function getYouTubeClientForContainer(proxyUrl) {
  const cache = new UniversalCache(true)
  const fetchWithProxy = buildFetchWithProxy(proxyUrl)
  return Innertube.create({ cache, fetch: fetchWithProxy })
}

function mapYoutubeComment(item) {
  const c = item?.comment || item || {}
  return {
    id: c.id || randomUUID(),
    content: (c.content && c.content.text) || '',
    author: (c.author && c.author.name) || '',
    likes: Number(c.like_count || 0) || 0,
    authorThumbnail: (c.author && c.author.thumbnails && c.author.thumbnails[0]?.url) || '',
    replyCount: c.reply_count || 0,
    translatedContent: '',
  }
}

async function downloadYoutubeCommentsWithInnertube({ url, pages = 3, proxy }) {
  console.log('[media-downloader] yt: build client (proxy=', Boolean(proxy), ')')
  const youtube = await getYouTubeClientForContainer(proxy)
  const videoId = extractVideoId(url)
  if (!videoId) throw new Error('Could not extract video ID from URL')
  console.log('[media-downloader] yt: getComments for', videoId)
  const commentsRoot = await youtube.getComments(videoId)
  const initialCount = commentsRoot?.contents?.length || 0
  console.log('[media-downloader] yt: initial contents =', initialCount)
  if (!initialCount) return []
  let comments = commentsRoot.contents.map(mapYoutubeComment)
  let current = commentsRoot
  let page = 1
  while (current.has_continuation && page < pages) {
    await delay(1000)
    const next = await current.getContinuation()
    const pageCount = next?.contents?.length || 0
    console.log('[media-downloader] yt: page', page + 1, 'contents =', pageCount, 'has_continuation=', Boolean(next?.has_continuation))
    if (!pageCount) break
    comments = comments.concat(next.contents.map(mapYoutubeComment))
    current = next
    page++
  }
  console.log('[media-downloader] yt: total comments collected =', comments.length)
  return comments
}

function makeFetchWithProxy(proxyUrl) {
  return buildFetchWithProxy(proxyUrl)
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

async function downloadTikTokCommentsByUrlWithProxy({ url, pages = 3, proxy }) {
  console.log('[media-downloader] tiktok: resolve awemeId')
  const awemeId = await resolveAwemeIdViaTikwm(url, proxy)
  if (!awemeId) return []
  const results = []
  let cursor = 0
  for (let i = 0; i < pages; i++) {
    try {
      const data = await fetchTikwmComments(awemeId, cursor, proxy)
      const list = Array.isArray(data?.data?.comments) ? data.data.comments : []
      console.log('[media-downloader] tiktok: page', i + 1, 'items =', list.length)
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
    } catch {
      break
    }
  }
  return results
}

async function extractAudioWithFfmpeg(videoPath, audioPath) {
	await runCommand('ffmpeg', [
		'-y',
		'-i',
		videoPath,
		'-vn',
		'-acodec',
		'libmp3lame',
		'-b:a',
		'192k',
		audioPath,
	])
}

function mapMetadata(raw, fallback = {}) {
	if (!raw) return fallback
	return {
		title: raw.title ?? fallback.title,
		author: raw.uploader ?? raw.channel ?? fallback.author,
		thumbnail: raw.thumbnail ?? fallback.thumbnail,
		viewCount: raw.view_count ?? fallback.viewCount,
		likeCount: raw.like_count ?? fallback.likeCount,
		duration: raw.duration ?? fallback.duration,
	}
}

async function postUpdate(callbackUrl, body) {
	if (!callbackUrl) return
	const payload = JSON.stringify(body)
	const signature = hmacHex(CALLBACK_SECRET, payload)
	await fetch(callbackUrl, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-signature': signature,
		},
		body: payload,
	}).catch(() => {})
}

async function resolveForwardProxy(engineOptions) {
	const { proxy, defaultProxyUrl } = engineOptions || {}
	if (proxy && proxy.server && proxy.port && proxy.protocol) {
		if (!FORWARD_PROXY_PROTOCOLS.has(proxy.protocol)) {
			console.warn(
			`[media-downloader] Unsupported proxy protocol "${proxy.protocol}" for direct usage; falling back to default proxy.`,
			)
		} else {
		console.log('[media-downloader] using direct forward proxy from engineOptions', {
				server: proxy.server,
				port: proxy.port,
				protocol: proxy.protocol,
				hasCredentials: Boolean(proxy.username && proxy.password),
			})
			let auth = ''
			if (proxy.username && proxy.password) {
				auth = `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
			}
			return `${proxy.protocol}://${auth}${proxy.server}:${proxy.port}`
		}
	}
	if (defaultProxyUrl) {
	console.log('[media-downloader] falling back to defaultProxyUrl')
	}
	return defaultProxyUrl
}

async function uploadArtifact(url, buffer, contentType = 'application/octet-stream') {
	if (!url) return
	const requestOptions = {
		method: 'PUT',
		headers: {
			'content-type': contentType,
			'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
		},
		body: buffer,
	}
	const res = await fetch(url, requestOptions)
	if (!res.ok) {
		const errorText = await res.text()
		throw new Error(`upload failed: ${res.status} ${errorText}`)
	}
}

async function handleRender(req, res) {
	let body = ''
	for await (const chunk of req) body += chunk
	const payload = JSON.parse(body)
  const {
    jobId = `job_${Math.random().toString(36).slice(2, 10)}`,
    mediaId,
    engineOptions = {},
    outputVideoPutUrl,
  outputAudioPutUrl,
  outputMetadataPutUrl,
  outputVideoKey,
  outputAudioKey,
  outputMetadataKey,
  callbackUrl,
} = payload

	const safeEngineOptions = {
		url: engineOptions?.url,
		quality: engineOptions?.quality,
		source: engineOptions?.source,
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
	console.log('[media-downloader] received render request', { jobId, engineOptions: safeEngineOptions })

	sendJson(res, 202, { jobId })

  const url = engineOptions.url
  const quality = engineOptions.quality || '1080p'
  const task = (engineOptions.task || '').toString().toLowerCase()
  const isCommentsOnly = task === 'comments'

  if (!url || (!isCommentsOnly && !outputVideoPutUrl) || (isCommentsOnly && !outputMetadataPutUrl)) {
    await postUpdate(callbackUrl, {
      jobId,
      status: 'failed',
      error: isCommentsOnly ? 'missing url or outputMetadataPutUrl' : 'missing url or outputVideoPutUrl',
      ts: Date.now(),
      nonce: randomNonce(),
    })
    return
  }

	let clashController = null
	try {
		clashController = await startMihomo(engineOptions)
	} catch (error) {
		console.error('[media-downloader] Failed to start Clash/Mihomo', error)
	}

  const proxy = clashController
    ? clashController.proxyUrl
    : await resolveForwardProxy(engineOptions)
  console.log('[media-downloader] resolved proxy', { jobId, viaMihomo: Boolean(clashController), proxy })
  const tmpDir = tmpdir()
  const basePath = join(tmpDir, `${jobId}`)
  const videoPath = `${basePath}.mp4`
  const audioPath = `${basePath}.mp3`
  const commentsDir = join(tmpDir, `${jobId}-comments`)

	const progress = async (phase, pct) => {
		await postUpdate(callbackUrl, {
			jobId,
			status: phase === 'uploading' ? 'uploading' : 'running',
			phase,
			progress: pct,
			ts: Date.now(),
			nonce: randomNonce(),
		})
	}

  try {
    await progress('preparing', 0.05)
    await delay(100)
    await progress('fetching_metadata', 0.1)

    if (isCommentsOnly) {
      const maxPages = parseNumber(engineOptions?.commentsPages, 3)
      console.log('[media-downloader] comments-only: start fetch', { source: engineOptions?.source, pages: maxPages, viaMihomo: Boolean(clashController), proxy })
      let comments = []
      const source = (engineOptions?.source || '').toLowerCase()
      if (source === 'youtube') {
        comments = await downloadYoutubeCommentsWithInnertube({ url, pages: maxPages, proxy })
      } else if (source === 'tiktok') {
        comments = await downloadTikTokCommentsByUrlWithProxy({ url, pages: maxPages, proxy })
      } else {
        comments = []
      }
      console.log('[media-downloader] comments-only: fetched', comments.length, 'comments')
      await progress('downloading', 0.6)
      const metadataBuffer = Buffer.from(JSON.stringify({ comments }, null, 2), 'utf8')
      console.log('[media-downloader] comments-only: uploading metadata bytes', metadataBuffer.length)
      await progress('uploading', 0.9)
      await uploadArtifact(outputMetadataPutUrl, metadataBuffer, 'application/json')
      await progress('uploading', 0.95)

      const outputs = {}
      if (outputMetadataKey) outputs.metadata = { key: outputMetadataKey }
      await postUpdate(callbackUrl, {
        jobId,
        status: 'completed',
        phase: 'completed',
        progress: 1,
        ts: Date.now(),
        nonce: randomNonce(),
        outputMetadataKey,
        outputs,
        metadata: {
          source: engineOptions.source || 'youtube',
        },
      })
      console.log('[media-downloader] job completed', jobId, 'comments=', comments.length)
    } else {
      const metadata = await downloadVideoWithYtDlp({ url, quality, outputPath: videoPath, proxy })
      await progress('downloading', 0.6)

      const metadataBuffer = metadata ? Buffer.from(JSON.stringify(metadata, null, 2), 'utf8') : null

      let audioBuffer = null
      if (outputAudioPutUrl) {
        await extractAudioWithFfmpeg(videoPath, audioPath)
        audioBuffer = readFileSync(audioPath)
        await progress('extracting_audio', 0.8)
      }

      const videoBuffer = readFileSync(videoPath)
      await progress('uploading', 0.9)
      if (outputMetadataPutUrl && metadataBuffer) {
        await uploadArtifact(outputMetadataPutUrl, metadataBuffer, 'application/json')
      }
      await progress('uploading', 0.95)

      await uploadArtifact(outputVideoPutUrl, videoBuffer, 'video/mp4')
      if (outputAudioPutUrl && audioBuffer) {
        await uploadArtifact(outputAudioPutUrl, audioBuffer, 'audio/mpeg')
      }

      const finalMetadata = mapMetadata(metadata, { quality })
      const outputs = {
        video: { key: outputVideoKey },
      }
      if (outputAudioKey) outputs.audio = { key: outputAudioKey }
      if (outputMetadataKey && metadataBuffer) outputs.metadata = { key: outputMetadataKey }
      await postUpdate(callbackUrl, {
        jobId,
        status: 'completed',
        phase: 'completed',
        progress: 1,
        ts: Date.now(),
        nonce: randomNonce(),
        outputKey: outputVideoKey,
        outputAudioKey,
        outputMetadataKey,
        outputs,
        metadata: {
          ...finalMetadata,
          quality,
          source: engineOptions.source || 'youtube',
        },
      })
    }
  } catch (error) {
		console.error('[media-downloader] job failed', jobId, error)
		await postUpdate(callbackUrl, {
			jobId,
			status: 'failed',
			error: error instanceof Error ? error.message : 'unknown error',
			ts: Date.now(),
			nonce: randomNonce(),
		})
  } finally {
    try {
      await clashController?.cleanup()
    } catch (error) {
      console.error('[media-downloader] Failed to shutdown Clash cleanly', error)
    }
    try {
      unlinkSync(videoPath)
    } catch {}
    try {
      unlinkSync(audioPath)
    } catch {}
    try {
      // cleanup comments dir
      await fsPromises.rm(commentsDir, { recursive: true, force: true })
    } catch {}
  }
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, `http://localhost:${PORT}`)
	if (req.method === 'POST' && url.pathname === '/render') return handleRender(req, res)
	sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, () => {
console.log(`[media-downloader] listening on ${PORT}`)
})
