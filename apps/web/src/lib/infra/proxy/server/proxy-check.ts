import { z } from 'zod'
import { buildRequestContext } from '~/lib/features/auth/context'
import { startCloudJob } from '~/lib/infra/cloudflare/jobs'
import { getDb } from '~/lib/infra/db'
import { runProxyChecksNow } from '~/lib/infra/proxy/check'
import { getProxyCheckSettings } from '~/lib/infra/proxy/proxy-settings'
import { toProxyJobPayload } from '~/lib/infra/proxy/utils'
import { createId } from '~/lib/shared/utils/id'

function withResponseCookies(
	ctx: { responseCookies: string[] },
	res: Response,
) {
	for (const cookie of ctx.responseCookies) {
		res.headers.append('Set-Cookie', cookie)
	}
	return res
}

async function ensureAdminRequestContext(request: Request) {
	const ctx = await buildRequestContext(request)
	if (!ctx.auth.user) {
		return {
			ctx,
			response: withResponseCookies(
				ctx,
				Response.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
			),
		}
	}
	if (ctx.auth.user.role !== 'admin') {
		return {
			ctx,
			response: withResponseCookies(
				ctx,
				Response.json({ error: 'FORBIDDEN' }, { status: 403 }),
			),
		}
	}
	return { ctx, response: null }
}

export async function handleProxyCheckRun(
	request: Request,
	runtime?: { waitUntil?: (p: Promise<unknown>) => void },
) {
	const ensured = await ensureAdminRequestContext(request)
	if (ensured.response) return ensured.response

	let input: { concurrency?: number } | undefined
	try {
		if (request.headers.get('content-type')?.includes('application/json')) {
			input = (await request.json()) as { concurrency?: number }
		}
	} catch {}

	const runId = `proxycheck_manual_${createId()}`
	const promise = runProxyChecksNow({
		runId,
		concurrency:
			typeof input?.concurrency === 'number' &&
			Number.isFinite(input.concurrency)
				? Math.max(1, Math.trunc(input.concurrency))
				: undefined,
	})

	if (runtime?.waitUntil) {
		runtime.waitUntil(promise)
		return withResponseCookies(
			ensured.ctx,
			Response.json({ ok: true, queued: true, runId }),
		)
	}

	const data = await promise
	return withResponseCookies(ensured.ctx, Response.json(data))
}

const RunOneInputSchema = z.object({
	proxyId: z.string().min(1),
})

export async function handleProxyCheckRunOne(
	request: Request,
	runtime?: { waitUntil?: (p: Promise<unknown>) => void },
) {
	const ensured = await ensureAdminRequestContext(request)
	if (ensured.response) return ensured.response

	const db = await getDb()
	const settings = await getProxyCheckSettings(db)
	const testUrl = (settings.testUrl ?? '').trim()
	if (!testUrl) {
		return withResponseCookies(
			ensured.ctx,
			Response.json(
				{ error: 'Proxy check testUrl not configured' },
				{ status: 500 },
			),
		)
	}

	const raw = await request.json().catch(() => null)
	const parsed = RunOneInputSchema.safeParse(raw)
	if (!parsed.success) {
		return withResponseCookies(
			ensured.ctx,
			Response.json(
				{ error: 'bad request', issues: parsed.error.issues },
				{ status: 400 },
			),
		)
	}

	const proxy = await db.query.proxies.findFirst({
		where: (proxies, { eq }) => eq(proxies.id, parsed.data.proxyId),
	})
	if (!proxy) {
		return withResponseCookies(
			ensured.ctx,
			Response.json({ error: 'proxy not found' }, { status: 404 }),
		)
	}

	const proxyPayload = toProxyJobPayload(proxy)
	if (!proxyPayload) {
		return withResponseCookies(
			ensured.ctx,
			Response.json({ error: 'invalid proxy payload' }, { status: 400 }),
		)
	}

	const runId = `proxycheck_single_${createId()}`
	const jobId = `pchk_${runId}_${proxy.id}`

	const promise = startCloudJob({
		jobId,
		mediaId: 'system-proxy-check',
		engine: 'media-downloader',
		purpose: 'proxy-check',
		title: 'proxy-check',
		options: {
			task: 'proxy-probe',
			url: testUrl,
			proxy: proxyPayload,
			runId,
			proxyId: proxy.id,
			timeoutMs: settings.timeoutMs,
			probeBytes: settings.probeBytes,
		},
	})

	if (runtime?.waitUntil) {
		runtime.waitUntil(promise)
		return withResponseCookies(
			ensured.ctx,
			Response.json({
				ok: true,
				queued: true,
				runId,
				jobId,
				proxyId: proxy.id,
			}),
		)
	}

	await promise
	return withResponseCookies(
		ensured.ctx,
		Response.json({ ok: true, queued: true, runId, jobId }),
	)
}
