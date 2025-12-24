import { desc } from 'drizzle-orm'
import { startCloudJob } from '~/lib/cloudflare/jobs'
import { getDb, schema } from '~/lib/db'
import { logger } from '~/lib/logger'
import { getProxyCheckSettings } from '~/lib/proxy/proxy-settings'
import { createId } from '~/lib/utils/id'
import { toProxyJobPayload } from './utils'

const RUN_BUCKET_MS = 30 * 60 * 1000

function getRunWindowStart(nowMs: number): number {
	return Math.floor(nowMs / RUN_BUCKET_MS) * RUN_BUCKET_MS
}

function makeProxyCheckRunId(windowStartMs: number): string {
	return `proxycheck_${new Date(windowStartMs).toISOString()}`
}

function makeProxyCheckJobId(windowStartMs: number, proxyId: string): string {
	// Keep jobId deterministic to reduce duplicates on scheduler retries.
	return `proxycheck_${windowStartMs}_${proxyId}`
}

async function runWithConcurrency<T>(
	items: readonly T[],
	concurrency: number,
	fn: (item: T, index: number) => Promise<void>,
) {
	const max = Math.max(1, Math.floor(concurrency))
	let next = 0

	const workers = Array.from({ length: Math.min(max, items.length) }).map(
		async () => {
			for (;;) {
				const idx = next++
				if (idx >= items.length) return
				await fn(items[idx]!, idx)
			}
		},
	)
	await Promise.all(workers)
}

export async function runScheduledProxyChecks(opts?: {
	testUrl?: string
	timeoutMs?: number
	probeBytes?: number
	concurrency?: number
}) {
	const nowMs = Date.now()
	const windowStartMs = getRunWindowStart(nowMs)
	const runId = makeProxyCheckRunId(windowStartMs)

	const db = await getDb()
	const settings = await getProxyCheckSettings(db)

	const testUrl = (opts?.testUrl ?? settings.testUrl ?? '').trim()
	if (!testUrl) {
		logger.warn(
			'proxy',
			`[proxy-check] skipped: testUrl not configured run=${runId}`,
		)
		return { ok: false as const, runId, reason: 'missing_test_url' as const }
	}

	const timeoutMs =
		typeof opts?.timeoutMs === 'number' && Number.isFinite(opts.timeoutMs)
			? Math.max(1_000, Math.trunc(opts.timeoutMs))
			: settings.timeoutMs
	const probeBytes =
		typeof opts?.probeBytes === 'number' && Number.isFinite(opts.probeBytes)
			? Math.max(1_024, Math.trunc(opts.probeBytes))
			: settings.probeBytes
	const concurrency =
		typeof opts?.concurrency === 'number' && Number.isFinite(opts.concurrency)
			? Math.max(1, Math.trunc(opts.concurrency))
			: settings.concurrency

	const proxies = await db.query.proxies.findMany({
		orderBy: [desc(schema.proxies.createdAt)],
	})

	logger.info(
		'proxy',
		`[proxy-check] dispatch start run=${runId} proxies=${proxies.length} concurrency=${concurrency}`,
	)

	let started = 0
	let failedToStart = 0

	await runWithConcurrency(proxies, concurrency, async (proxy) => {
		const proxyPayload = toProxyJobPayload(proxy)
		if (!proxyPayload) return

		const jobId = makeProxyCheckJobId(windowStartMs, proxy.id)
		try {
			await startCloudJob({
				jobId,
				mediaId: 'system-proxy-check',
				engine: 'media-downloader',
				title: 'proxy-check',
				options: {
					task: 'proxy-probe',
					url: testUrl,
					proxy: proxyPayload,
					runId,
					proxyId: proxy.id,
					timeoutMs,
					probeBytes,
				},
			})
			started++
		} catch (error) {
			failedToStart++
			logger.warn(
				'proxy',
				`[proxy-check] startCloudJob failed run=${runId} proxy=${proxy.id}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			)
		}
	})

	logger.info(
		'proxy',
		`[proxy-check] dispatch done run=${runId} started=${started} failedToStart=${failedToStart}`,
	)

	return { ok: true as const, runId, started, failedToStart }
}

export async function runProxyChecksNow(opts?: {
	runId?: string
	testUrl?: string
	timeoutMs?: number
	probeBytes?: number
	concurrency?: number
}) {
	const runId = (opts?.runId ?? `proxycheck_manual_${createId()}`).trim()

	const db = await getDb()
	const settings = await getProxyCheckSettings(db)

	const testUrl = (opts?.testUrl ?? settings.testUrl ?? '').trim()
	if (!testUrl) {
		logger.warn(
			'proxy',
			`[proxy-check] skipped: testUrl not configured run=${runId}`,
		)
		return { ok: false as const, runId, reason: 'missing_test_url' as const }
	}

	const timeoutMs =
		typeof opts?.timeoutMs === 'number' && Number.isFinite(opts.timeoutMs)
			? Math.max(1_000, Math.trunc(opts.timeoutMs))
			: settings.timeoutMs
	const probeBytes =
		typeof opts?.probeBytes === 'number' && Number.isFinite(opts.probeBytes)
			? Math.max(1_024, Math.trunc(opts.probeBytes))
			: settings.probeBytes
	const concurrency =
		typeof opts?.concurrency === 'number' && Number.isFinite(opts.concurrency)
			? Math.max(1, Math.trunc(opts.concurrency))
			: settings.concurrency

	const proxies = await db.query.proxies.findMany({
		orderBy: [desc(schema.proxies.createdAt)],
	})

	logger.info(
		'proxy',
		`[proxy-check] manual dispatch start run=${runId} proxies=${proxies.length} concurrency=${concurrency}`,
	)

	let started = 0
	let failedToStart = 0

	await runWithConcurrency(proxies, concurrency, async (proxy) => {
		const proxyPayload = toProxyJobPayload(proxy)
		if (!proxyPayload) return

		const jobId = `pchk_${runId}_${proxy.id}`
		try {
			await startCloudJob({
				jobId,
				mediaId: 'system-proxy-check',
				engine: 'media-downloader',
				title: 'proxy-check',
				options: {
					task: 'proxy-probe',
					url: testUrl,
					proxy: proxyPayload,
					runId,
					proxyId: proxy.id,
					timeoutMs,
					probeBytes,
				},
			})
			started++
		} catch (error) {
			failedToStart++
			logger.warn(
				'proxy',
				`[proxy-check] startCloudJob failed run=${runId} proxy=${proxy.id}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			)
		}
	})

	logger.info(
		'proxy',
		`[proxy-check] manual dispatch done run=${runId} started=${started} failedToStart=${failedToStart}`,
	)

	return { ok: true as const, runId, started, failedToStart }
}
