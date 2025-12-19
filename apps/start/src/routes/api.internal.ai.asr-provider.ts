import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { createFileRoute } from '@tanstack/react-router'

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

export const Route = createFileRoute('/api/internal/ai/asr-provider')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const signature = request.headers.get('x-signature') || ''
				const bodyText = await request.text()
				const secret = JOB_CALLBACK_HMAC_SECRET

				if (!secret) {
					logger.error(
						'api',
						'[internal.asr-provider] JOB_CALLBACK_HMAC_SECRET is not configured',
					)
					return Response.json({ error: 'server not configured' }, { status: 500 })
				}
				if (!verifyHmacSHA256(secret, bodyText, signature)) {
					return Response.json({ error: 'unauthorized' }, { status: 401 })
				}

				let parsed: z.infer<typeof BodySchema>
				try {
					parsed = BodySchema.parse(JSON.parse(bodyText))
				} catch (err) {
					return Response.json(
						{ error: err instanceof Error ? err.message : 'bad request' },
						{ status: 400 },
					)
				}

				const now = Date.now()
				if (Math.abs(now - parsed.ts) > 5 * 60 * 1000) {
					return Response.json({ error: 'request expired' }, { status: 400 })
				}

				const db = await getDb()
				const provider = await db.query.aiProviders.findFirst({
					where: eq(schema.aiProviders.id, parsed.providerId),
				})
				if (!provider || provider.kind !== 'asr' || provider.type !== 'whisper_api') {
					return Response.json({ error: 'provider not found' }, { status: 404 })
				}
				if (!provider.enabled) {
					return Response.json({ error: 'provider disabled' }, { status: 400 })
				}

				const model = await db.query.aiModels.findFirst({
					where: eq(schema.aiModels.id, parsed.modelId),
				})
				if (!model || model.kind !== 'asr' || model.providerId !== provider.id) {
					return Response.json({ error: 'model not found' }, { status: 404 })
				}
				if (!model.enabled) {
					return Response.json({ error: 'model disabled' }, { status: 400 })
				}

				const baseUrl = (provider.baseUrl || '').trim()
				const apiKey = (provider.apiKey || '').trim()
				if (!baseUrl || !apiKey) {
					logger.warn(
						'api',
						`[internal.asr-provider] whisper_api missing baseUrl/apiKey providerId=${provider.id}`,
					)
					return Response.json({ error: 'provider not configured' }, { status: 400 })
				}

				return Response.json({
					type: 'whisper_api',
					baseUrl,
					apiKey,
					remoteModelId: model.remoteModelId,
				})
			},
		},
	},
})

