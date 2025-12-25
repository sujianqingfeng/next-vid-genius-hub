import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
	PROXY_CHECK_PROBE_BYTES,
	PROXY_CHECK_TEST_URL,
	PROXY_CHECK_TIMEOUT_MS,
} from '~/lib/config/env'
import { getDb, schema } from '~/lib/db'

const DEFAULT_PROXY_SETTINGS_ID = 'default'

const DefaultProxyCheckSettings = {
	testUrl: (PROXY_CHECK_TEST_URL ?? '').trim(),
	timeoutMs: PROXY_CHECK_TIMEOUT_MS,
	probeBytes: PROXY_CHECK_PROBE_BYTES,
	concurrency: 5,
} as const

export type ProxyCheckSettings = {
	testUrl: string
	timeoutMs: number
	probeBytes: number
	concurrency: number
}

export const ProxyCheckSettingsInputSchema = z.object({
	testUrl: z.string(),
	timeoutMs: z.number(),
	probeBytes: z.number(),
	concurrency: z.number(),
})

export function normalizeProxyCheckSettings(
	input: ProxyCheckSettings,
): ProxyCheckSettings {
	const testUrl = String(input.testUrl ?? '').trim()

	const timeoutMs = (() => {
		const raw = Number(input.timeoutMs)
		if (!Number.isFinite(raw)) return DefaultProxyCheckSettings.timeoutMs
		return Math.max(1_000, Math.min(300_000, Math.trunc(raw)))
	})()

	const probeBytes = (() => {
		const raw = Number(input.probeBytes)
		if (!Number.isFinite(raw)) return DefaultProxyCheckSettings.probeBytes
		return Math.max(1_024, Math.min(2_000_000, Math.trunc(raw)))
	})()

	const concurrency = (() => {
		const raw = Number(input.concurrency)
		if (!Number.isFinite(raw)) return DefaultProxyCheckSettings.concurrency
		return Math.max(1, Math.min(20, Math.trunc(raw)))
	})()

	return { testUrl, timeoutMs, probeBytes, concurrency }
}

type DbClient = Awaited<ReturnType<typeof getDb>>

export async function getProxyCheckSettings(
	db?: DbClient,
): Promise<ProxyCheckSettings> {
	const database = db ?? (await getDb())
	const row = await database.query.proxySettings.findFirst({
		where: eq(schema.proxySettings.id, DEFAULT_PROXY_SETTINGS_ID),
	})

	if (!row) return { ...DefaultProxyCheckSettings }

	return normalizeProxyCheckSettings({
		testUrl: (row.proxyCheckTestUrl ?? '').trim(),
		timeoutMs: row.proxyCheckTimeoutMs ?? DefaultProxyCheckSettings.timeoutMs,
		probeBytes:
			row.proxyCheckProbeBytes ?? DefaultProxyCheckSettings.probeBytes,
		concurrency:
			row.proxyCheckConcurrency ?? DefaultProxyCheckSettings.concurrency,
	})
}

export async function setProxyCheckSettings(
	input: ProxyCheckSettings,
	db?: DbClient,
): Promise<ProxyCheckSettings> {
	const database = db ?? (await getDb())
	const now = new Date()
	const normalized = normalizeProxyCheckSettings(input)

	await database
		.insert(schema.proxySettings)
		.values({
			id: DEFAULT_PROXY_SETTINGS_ID,
			proxyCheckTestUrl: normalized.testUrl,
			proxyCheckTimeoutMs: normalized.timeoutMs,
			proxyCheckProbeBytes: normalized.probeBytes,
			proxyCheckConcurrency: normalized.concurrency,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: schema.proxySettings.id,
			set: {
				proxyCheckTestUrl: normalized.testUrl,
				proxyCheckTimeoutMs: normalized.timeoutMs,
				proxyCheckProbeBytes: normalized.probeBytes,
				proxyCheckConcurrency: normalized.concurrency,
				updatedAt: now,
			},
		})

	return normalized
}
