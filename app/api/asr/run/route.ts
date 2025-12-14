import { NextRequest, NextResponse } from 'next/server'
import { bucketPaths } from '@app/media-domain'
import { verifyHmacSHA256 } from '@app/job-callbacks'
import { JOB_CALLBACK_HMAC_SECRET } from '~/lib/config/env'
import { getDb, schema } from '~/lib/db'
import { eq } from 'drizzle-orm'
import { getAiModelConfig } from '~/lib/ai/config/service'
import { presignGetByKey, putObjectByKey } from '~/lib/cloudflare'
import { runCloudflareWorkersAiAsr } from '~/lib/subtitle/server/cloudflare-workers-ai'
import { runWhisperApiAsr } from '~/lib/subtitle/server/whisper-api'
import { logger } from '~/lib/logger'

type Body = {
	jobId: string
	mediaId: string
	outputAudioKey: string
	model: string
	language?: string
	title?: string | null
}

export async function POST(req: NextRequest) {
	try {
		const signature = req.headers.get('x-signature') || ''
		const bodyText = await req.text()
		const secret = JOB_CALLBACK_HMAC_SECRET || 'replace-with-strong-secret'
		if (!verifyHmacSHA256(secret, bodyText, signature)) {
			return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
		}

		const body = JSON.parse(bodyText) as Body
		if (!body?.jobId || !body?.mediaId || !body?.outputAudioKey || !body?.model) {
			return NextResponse.json({ error: 'bad request' }, { status: 400 })
		}

		const modelCfg = await getAiModelConfig(body.model)
		if (!modelCfg || modelCfg.kind !== 'asr' || !modelCfg.enabled) {
			return NextResponse.json({ error: 'ASR model not available' }, { status: 400 })
		}
		const provider = modelCfg.provider
		if (!provider.enabled || provider.kind !== 'asr') {
			return NextResponse.json({ error: 'ASR provider not available' }, { status: 400 })
		}

		let runAsr: (opts: { audio: ArrayBuffer }) => Promise<{ vtt: string; words?: unknown }>
		if (provider.type === 'cloudflare_asr') {
			const accountId =
				typeof (provider.metadata as any)?.accountId === 'string'
					? String((provider.metadata as any).accountId).trim()
					: ''
			const apiToken = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : ''
			if (!accountId || !apiToken) {
				return NextResponse.json(
					{ error: 'Cloudflare ASR provider credentials not configured in DB' },
					{ status: 400 },
				)
			}
			runAsr = ({ audio }) =>
				runCloudflareWorkersAiAsr({
					accountId,
					apiToken,
					modelId: modelCfg.remoteModelId,
					audio,
					language: body.language,
				})
		} else if (provider.type === 'whisper_api') {
			const baseUrl = typeof provider.baseUrl === 'string' ? provider.baseUrl.trim() : ''
			const apiKey = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : ''
			if (!baseUrl || !apiKey) {
				return NextResponse.json(
					{ error: 'Whisper API provider credentials not configured in DB' },
					{ status: 400 },
				)
			}
			runAsr = ({ audio }) =>
				runWhisperApiAsr({
					baseUrl,
					apiKey,
					remoteModelId: modelCfg.remoteModelId,
					audio,
					language: body.language,
					filename: `${body.mediaId}-${body.jobId}.mp3`,
				})
		} else {
			return NextResponse.json({ error: 'ASR provider not available' }, { status: 400 })
		}

		const db = await getDb()
		const media = await db.query.media.findFirst({
			where: eq(schema.media.id, body.mediaId),
		})
		const title = body.title ?? media?.title ?? undefined
		const pathOptions = { title }

		const audioUrl = await presignGetByKey(body.outputAudioKey)
		const audioResp = await fetch(audioUrl)
		if (!audioResp.ok) {
			return NextResponse.json(
				{ error: `fetch audio failed: ${audioResp.status}` },
				{ status: 502 },
			)
		}
		const audio = await audioResp.arrayBuffer()

		const { vtt, words } = await runAsr({ audio })

		const vttKey = bucketPaths.asr.results.transcript(body.mediaId, body.jobId, pathOptions)
		await putObjectByKey(vttKey, 'text/vtt', vtt)

		let wordsKey: string | undefined
		if (words && (Array.isArray(words) ? words.length > 0 : true)) {
			wordsKey = bucketPaths.asr.results.words(body.mediaId, body.jobId, pathOptions)
			await putObjectByKey(wordsKey, 'application/json', JSON.stringify(words))
		}

		return NextResponse.json({ vttKey, wordsKey })
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e)
		logger.error('api', `[asr.run] error: ${message}`)

		const includeDetails =
			process.env.NODE_ENV !== 'production' ||
			process.env.DEBUG_ASR_RUN_ERRORS === 'true'

		return NextResponse.json(
			includeDetails ? { error: 'internal error', details: message } : { error: 'internal error' },
			{ status: 500 },
		)
	}
}
