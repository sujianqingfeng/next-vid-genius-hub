import {
	createStartHandler,
	defaultStreamHandler,
} from '@tanstack/react-start/server'
import type { D1Database } from '~/lib/db'
import { setInjectedD1Database } from '~/lib/db'
import { runScheduledProxyChecks } from '~/lib/proxy/check'
import { runScheduledTaskReconciler } from '~/lib/job/reconciler'
import { runScheduledThreadAssetIngest } from '~/lib/thread/server/asset-ingest'

type WorkerEnv = {
	DB?: D1Database
	WORKSPACE_PROTECT?: string
	WORKSPACE_AUTH_USERNAME?: string
	WORKSPACE_AUTH_PASSWORD?: string
	[key: string]: unknown
}

type WorkerCtx = unknown

let startHandler:
	| ReturnType<typeof createStartHandler<typeof defaultStreamHandler>>
	| undefined

function getStartHandler() {
	if (!startHandler) {
		startHandler = createStartHandler(defaultStreamHandler)
	}
	return startHandler
}

const ALLOWLIST_PREFIXES = ['/api/render/cf-callback']
const WORKSPACE_PREFIXES = ['/media', '/channels', '/points', '/tasks']

function decodeBase64(input: string): string {
	if (typeof atob === 'function') return atob(input)
	// nodejs_compat fallback (avoid hard dependency on Node types)
	const bufferCtor = (globalThis as unknown as { Buffer?: any }).Buffer
	if (bufferCtor?.from) {
		return bufferCtor.from(input, 'base64').toString('utf8')
	}
	throw new Error('No base64 decoder available')
}

function shouldProtectPath(pathname: string): boolean {
	if (ALLOWLIST_PREFIXES.some((p) => pathname.startsWith(p))) {
		return false
	}

	if (pathname.startsWith('/api')) return true
	return WORKSPACE_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	)
}

function authenticateBasicAuth(
	request: Request,
	env: WorkerEnv,
): Response | null {
	const enabled = env.WORKSPACE_PROTECT === '1'
	if (!enabled) return null

	const url = new URL(request.url)
	if (!shouldProtectPath(url.pathname)) return null

	const user = env.WORKSPACE_AUTH_USERNAME
	const pass = env.WORKSPACE_AUTH_PASSWORD

	if (!user || !pass) {
		return new Response('Forbidden', { status: 403 })
	}

	const header = request.headers.get('authorization')
	if (header) {
		const [scheme, encoded] = header.split(' ')
		if (scheme === 'Basic' && encoded) {
			const decoded = decodeBase64(encoded)
			const [givenUser, givenPass] = decoded.split(':')
			if (givenUser === user && givenPass === pass) {
				return null
			}
		}
	}

	return new Response('Authentication required', {
		status: 401,
		headers: { 'WWW-Authenticate': 'Basic realm="Workspace"' },
	})
}

export default {
	async fetch(request: Request, env: WorkerEnv, ctx: WorkerCtx) {
		const auth = authenticateBasicAuth(request, env)
		if (auth) return auth

		if (env?.DB) {
			setInjectedD1Database(env.DB)
		}

		return getStartHandler()(request)
	},
	async scheduled(
		_event: unknown,
		env: WorkerEnv,
		ctx: { waitUntil: (p: Promise<unknown>) => void },
	) {
		if (env?.DB) {
			setInjectedD1Database(env.DB)
		}
		ctx.waitUntil(
			Promise.all([
				runScheduledProxyChecks(),
				runScheduledTaskReconciler(),
				runScheduledThreadAssetIngest(),
			]),
		)
	},
}
