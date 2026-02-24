import path from 'node:path'
import { buildForwardProxyUrl } from '@app/media-core'
import { ProxyAgent, fetch as undiciFetch } from 'undici'
import type { LocalJobExecutor } from '../contracts'
import { ensureDir, readJsonFile, resolveOutputPath, writeJsonFile } from '../fs-utils'

type ProxyRecordInput =
	| string
	| {
		id?: string
		name?: string
		protocol?: 'http' | 'https' | 'socks4' | 'socks5'
		server?: string
		port?: number | string
		username?: string
		password?: string
		url?: string
	}

type ProxyCheckInput = {
	testUrl: string
	proxies?: ProxyRecordInput[]
	proxiesPath?: string
	timeoutMs?: number
	probeBytes?: number
	outputDir?: string
	outputPath?: string
}

function resolveProxyUrl(proxy: ProxyRecordInput): {
	id: string
	name: string
	proxyUrl: string
} | null {
	if (typeof proxy === 'string') {
		const trimmed = proxy.trim()
		if (!trimmed) return null
		return { id: trimmed, name: trimmed, proxyUrl: trimmed }
	}

	const url = typeof proxy.url === 'string' && proxy.url.trim() ? proxy.url.trim() : ''
	if (url) {
		const id = proxy.id || proxy.name || url
		return {
			id,
			name: proxy.name || id,
			proxyUrl: url,
		}
	}

	if (proxy.protocol && proxy.server && proxy.port) {
		const proxyUrl = buildForwardProxyUrl({
			protocol: proxy.protocol,
			server: proxy.server,
			port: proxy.port,
			username: proxy.username,
			password: proxy.password,
		})
		if (!proxyUrl) return null
		const id = proxy.id || proxy.name || `${proxy.protocol}://${proxy.server}:${proxy.port}`
		return {
			id,
			name: proxy.name || id,
			proxyUrl,
		}
	}

	return null
}

async function loadProxyList(input: ProxyCheckInput): Promise<ProxyRecordInput[]> {
	if (Array.isArray(input.proxies) && input.proxies.length > 0) return input.proxies
	if (input.proxiesPath) {
		const parsed = await readJsonFile<ProxyRecordInput[]>(
			path.resolve(input.proxiesPath),
		)
		if (Array.isArray(parsed)) return parsed
	}
	return []
}

export const proxyCheckExecutor: LocalJobExecutor = async (ctx) => {
	const input = ctx.spec.input as ProxyCheckInput
	if (!input?.testUrl) throw new Error('proxy-check requires input.testUrl')

	const timeoutMs = Math.max(1_000, Number(input.timeoutMs || 20_000))
	const probeBytes = Math.max(1_024, Number(input.probeBytes || 65_536))
	const proxyCandidates = await loadProxyList(input)
	if (proxyCandidates.length === 0) {
		throw new Error('proxy-check requires input.proxies or input.proxiesPath')
	}

	const outputDir = resolveOutputPath(
		process.cwd(),
		input.outputDir || path.join('.local-jobs', 'artifacts', ctx.jobId, 'proxy-check'),
	)
	await ensureDir(outputDir)
	const outputPath = input.outputPath
		? resolveOutputPath(outputDir, input.outputPath)
		: path.join(outputDir, 'report.json')

	await ctx.emit({
		status: 'running',
		phase: 'preparing',
		progress: 0.05,
		message: `Preparing proxy checks (${proxyCandidates.length})`,
	})

	const report: Array<{
		id: string
		name: string
		proxyUrl: string
		status: 'success' | 'failed'
		responseTimeMs?: number
		statusCode?: number
		error?: string
	}> = []

	for (let i = 0; i < proxyCandidates.length; i++) {
		if (await ctx.isCanceled()) return
		const resolved = resolveProxyUrl(proxyCandidates[i]!)
		if (!resolved) continue
		await ctx.emit({
			status: 'running',
			phase: 'running',
			progress: 0.1 + (i / proxyCandidates.length) * 0.8,
			message: `Checking proxy ${i + 1}/${proxyCandidates.length}`,
		})

		const started = Date.now()
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), timeoutMs)
		try {
			const response = await undiciFetch(input.testUrl, {
				method: 'GET',
				headers: {
					Range: `bytes=0-${probeBytes - 1}`,
				},
				dispatcher: new ProxyAgent(resolved.proxyUrl),
				signal: controller.signal,
				cache: 'no-store',
			})
			const responseTimeMs = Date.now() - started
			report.push({
				id: resolved.id,
				name: resolved.name,
				proxyUrl: resolved.proxyUrl,
				status: response.ok ? 'success' : 'failed',
				responseTimeMs,
				statusCode: response.status,
				error: response.ok ? undefined : `HTTP ${response.status}`,
			})
		} catch (error) {
			report.push({
				id: resolved.id,
				name: resolved.name,
				proxyUrl: resolved.proxyUrl,
				status: 'failed',
				error: error instanceof Error ? error.message : String(error),
			})
		} finally {
			clearTimeout(timeout)
		}
	}

	await writeJsonFile(outputPath, {
		jobId: ctx.jobId,
		testUrl: input.testUrl,
		report,
		summary: {
			total: report.length,
			success: report.filter((item) => item.status === 'success').length,
			failed: report.filter((item) => item.status === 'failed').length,
		},
	})

	const failed = report.filter((item) => item.status === 'failed').length
	await ctx.emit({
		status: failed > 0 ? 'failed' : 'completed',
		phase: failed > 0 ? 'failed' : 'completed',
		progress: 1,
		message:
			failed > 0
				? `Proxy check finished with ${failed} failures`
				: 'Proxy check completed',
		outputs: {
			report: {
				path: outputPath,
				contentType: 'application/json',
			},
		},
	})
}
