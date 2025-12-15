import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '~/lib/db'
import { JOB_CALLBACK_HMAC_SECRET } from '~/lib/config/env'
import { verifyHmacSHA256 } from '@app/job-callbacks'
import { logger } from '~/lib/logger'

const BodySchema = z.object({
	providerId: z.string().min(1),
	modelId: z.string().min(1),
	ts: z.number().int().nonnegative(),
	nonce: z.string().min(8).max(200),
})

// Orchestrator-only endpoint: resolve whisper_api credentials for ASR jobs.
// Auth: HMAC signed request body (x-signature) using JOB_CALLBACK_HMAC_SECRET.
export async function POST(req: NextRequest) {
	const signature = req.headers.get('x-signature') || ''
	const bodyText = await req.text()
	const secret = JOB_CALLBACK_HMAC_SECRET
	if (!secret) {
		logger.error('api', '[internal.asr-provider] JOB_CALLBACK_HMAC_SECRET is not configured')
		return NextResponse.json({ error: 'server not configured' }, { status: 500 })
	}
	if (!verifyHmacSHA256(secret, bodyText, signature)) {
		return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
	}

	let parsed: z.infer<typeof BodySchema>
	try {
		parsed = BodySchema.parse(JSON.parse(bodyText))
	} catch (err) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : 'bad request' },
			{ status: 400 },
		)
	}

	// Basic replay window protection
	const now = Date.now()
	if (Math.abs(now - parsed.ts) > 5 * 60 * 1000) {
		return NextResponse.json({ error: 'request expired' }, { status: 400 })
	}

	const db = await getDb()
	const provider = await db.query.aiProviders.findFirst({
		where: eq(schema.aiProviders.id, parsed.providerId),
	})
	if (!provider || provider.kind !== 'asr' || provider.type !== 'whisper_api') {
		return NextResponse.json({ error: 'provider not found' }, { status: 404 })
	}
	if (!provider.enabled) {
		return NextResponse.json({ error: 'provider disabled' }, { status: 400 })
	}

	const model = await db.query.aiModels.findFirst({
		where: eq(schema.aiModels.id, parsed.modelId),
	})
	if (!model || model.kind !== 'asr' || model.providerId !== provider.id) {
		return NextResponse.json({ error: 'model not found' }, { status: 404 })
	}
	if (!model.enabled) {
		return NextResponse.json({ error: 'model disabled' }, { status: 400 })
	}

	const baseUrl = (provider.baseUrl || '').trim()
	const apiKey = (provider.apiKey || '').trim()
	if (!baseUrl || !apiKey) {
		logger.warn(
			'api',
			`[internal.asr-provider] whisper_api missing baseUrl/apiKey providerId=${provider.id}`,
		)
		return NextResponse.json({ error: 'provider not configured' }, { status: 400 })
	}

	return NextResponse.json({
		type: 'whisper_api',
		baseUrl,
		apiKey,
		remoteModelId: model.remoteModelId,
	})
}
