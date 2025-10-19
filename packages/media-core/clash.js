import { promises as fsPromises } from 'node:fs'
import { join } from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import YAML from 'yaml'

const MIHOMO_BIN = process.env.MIHOMO_BIN || '/usr/local/bin/mihomo'
const MIHOMO_CONFIG_DIR = process.env.MIHOMO_CONFIG_DIR || '/app/clash'
const MIHOMO_PROVIDER_DIR = join(MIHOMO_CONFIG_DIR, 'providers')
const MIHOMO_PORT = Number.parseInt(process.env.MIHOMO_PORT || '7890', 10)
const MIHOMO_SOCKS_PORT = Number.parseInt(process.env.MIHOMO_SOCKS_PORT || '7891', 10)
const CLASH_MODE = process.env.CLASH_MODE || 'Rule'
const CLASH_SUBSCRIPTION_URL = process.env.CLASH_SUBSCRIPTION_URL?.trim()
const CLASH_RAW_CONFIG = process.env.CLASH_RAW_CONFIG

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
		console.error('[media-core/clash] Failed to parse SSR URL', error)
		return null
	}
}

export function createClashProxyFromDb(proxy) {
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
				console.warn('[media-core/clash] Trojan node missing password, skipping', baseName)
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
			console.error('[media-core/clash] Failed to parse Trojan node', error)
			return null
		}
	}

	if (nodeUrl && /^vless:\/\//i.test(nodeUrl)) {
		try {
			const url = new URL(nodeUrl)
			const params = url.searchParams
			const uuid = decodeURIComponent(url.username || '')
			if (!uuid) {
				console.warn('[media-core/clash] VLESS node missing UUID, skipping', baseName)
				return null
			}

			const security = (params.get('security') || '').toLowerCase()
			const network = (params.get('type') || params.get('network') || 'tcp').toLowerCase()
			const sni = params.get('sni') || params.get('host') || url.hostname
			const fingerprint = params.get('fp') || params.get('fingerprint')
			const flow = params.get('flow')
			const alpnParam = params.get('alpn')
			const alpn = alpnParam ? alpnParam.split(',').map((v) => v.trim()).filter(Boolean) : undefined
			const allowInsecure =
				parseBooleanFlag(params.get('allowinsecure') || params.get('allowInsecure') || params.get('insecure'))
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
			console.error('[media-core/clash] Failed to parse VLESS node', error)
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
				console.warn('[media-core/clash] Trojan proxy missing password; cannot configure Clash', baseName)
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

export function buildClashConfig(engineOptions = {}, overrides = {}) {
	const rawConfig = overrides.rawConfig ?? CLASH_RAW_CONFIG
	if (rawConfig) {
		return rawConfig
	}

	const logger = overrides.logger || console
	const proxies = []
	const providerGroups = []
	const dbProxy = createClashProxyFromDb(engineOptions.proxy)
	if (dbProxy) proxies.push(dbProxy)

	const subscriptionUrl = overrides.subscriptionUrl ?? CLASH_SUBSCRIPTION_URL

	if (!proxies.length && !subscriptionUrl) {
		const proxyDebug = engineOptions?.proxy
			? {
					hasNodeUrl: Boolean(engineOptions.proxy.nodeUrl),
					protocol: engineOptions.proxy.protocol,
					server: engineOptions.proxy.server,
					port: engineOptions.proxy.port,
				}
			: null
		logger?.log?.('[media-core/clash] skipping mihomo (no proxy config available)', {
			hasSubscription: Boolean(subscriptionUrl),
			proxyDebug,
		})
		return null
	}

	const port = overrides.port ?? MIHOMO_PORT
	const socksPort = overrides.socksPort ?? MIHOMO_SOCKS_PORT
	const mode = overrides.mode ?? CLASH_MODE

	const config = {
		port,
		'socks-port': socksPort,
		'allow-lan': true,
		mode,
		'log-level': 'info',
		ipv6: true,
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

	if (subscriptionUrl) {
		config['proxy-providers'] = {
			subscription: {
				type: 'http',
				url: subscriptionUrl,
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

export async function startMihomo(engineOptions = {}, options = {}) {
	const logger = options.logger || console
	const configText = buildClashConfig(engineOptions, {
		logger,
		subscriptionUrl: options.subscriptionUrl,
		rawConfig: options.rawConfig,
		port: options.port,
		socksPort: options.socksPort,
		mode: options.mode,
	})
	if (!configText) return null

	const configDir = options.configDir || MIHOMO_CONFIG_DIR
	const providerDir = options.providerDir || MIHOMO_PROVIDER_DIR
	const mihomoBin = options.mihomoBin || MIHOMO_BIN
	const port = options.port ?? MIHOMO_PORT
	const socksPort = options.socksPort ?? MIHOMO_SOCKS_PORT
	const mode = options.mode ?? CLASH_MODE

	await ensureDirExists(configDir)
	await ensureDirExists(providerDir)

	const configPath = join(configDir, 'config.yaml')
	await fsPromises.writeFile(configPath, configText, 'utf8')

	logger?.log?.('[media-core/clash] starting mihomo', {
		configPath,
		port,
		socksPort,
		mode,
	})

	let child
	try {
		child = spawn(mihomoBin, ['-d', configDir], {
			stdio: ['ignore', 'inherit', 'inherit'],
		})
	} catch (error) {
		logger?.error?.('[media-core/clash] Failed to spawn mihomo', error)
		return null
	}

	try {
		await waitForPort(port)
		logger?.log?.('[media-core/clash] mihomo ready', { httpPort: port })
		return {
			proxyUrl: `http://127.0.0.1:${port}`,
			async cleanup() {
				if (!child.killed) {
					child.kill('SIGTERM')
					await delay(200)
				}
			},
		}
	} catch (error) {
		child.kill('SIGTERM')
		logger?.error?.('[media-core/clash] Clash proxy failed to start', error)
		return null
	}
}

export default {
	createClashProxyFromDb,
	buildClashConfig,
	startMihomo,
}
