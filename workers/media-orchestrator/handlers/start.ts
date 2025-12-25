import { getContainer } from '@cloudflare/containers'
import { bucketPaths, type EngineId } from '@app/media-domain'
import type { Env, JobManifest, StartBody } from '../types'
import { containerS3Endpoint, presignS3 } from '../storage/presign'
import { readObjectTextWithFallback } from '../storage/fallback'
import { s3Head } from '../storage/s3'
import { json } from '../utils/http'
import { jobStub } from '../utils/job'
import { hmacHex, requireJobCallbackSecret, verifyHmac } from '../utils/hmac'

async function readJobManifest(
	env: Env,
	jobId: string,
): Promise<JobManifest | null> {
	const key = bucketPaths.manifests.job(jobId)
	const text = await readObjectTextWithFallback(env, key)
	if (!text) return null
	try {
		return JSON.parse(text) as JobManifest
	} catch {
		return null
	}
}

async function presignGetForContainer(
	env: Env,
	bucket: string,
	key: string,
	endpointOverride?: string,
): Promise<string> {
	return presignS3(env, 'GET', bucket, key, 600, undefined, endpointOverride)
}

export async function handleStart(env: Env, req: Request) {
	const raw = await req.text()
	const sig = req.headers.get('x-signature') || ''
	const secret = requireJobCallbackSecret(env)
	if (!(await verifyHmac(secret, raw, sig))) {
		return json({ error: 'unauthorized' }, { status: 401 })
	}
	const body = JSON.parse(raw) as StartBody
	if (!body?.jobId || !body?.mediaId || !body?.engine) {
		return json({ error: 'bad request' }, { status: 400 })
	}
	const jobId = body.jobId
	const purpose =
		typeof body.purpose === 'string' && body.purpose.trim()
			? body.purpose.trim()
			: undefined
	const isDownloader = body.engine === 'media-downloader'
	const isAsrPipeline = body.engine === 'asr-pipeline'
	// Choose container base by engine
	let containerBase: string
	if (body.engine === 'renderer-remotion') {
		containerBase =
			env.CONTAINER_BASE_URL_REMOTION ||
			env.CONTAINER_BASE_URL ||
			'http://localhost:8190'
	} else if (body.engine === 'media-downloader') {
		containerBase =
			env.CONTAINER_BASE_URL_DOWNLOADER ||
			env.CONTAINER_BASE_URL ||
			'http://localhost:8100'
	} else {
		containerBase = env.CONTAINER_BASE_URL || 'http://localhost:9080'
	}
	containerBase = containerBase.replace(/\/$/, '')
	const baseSelfForContainer = (
		env.ORCHESTRATOR_BASE_URL_CONTAINER || new URL(req.url).origin
	).replace(/\/$/, '')

	// Prepare payload for container
	// Ensure inputs exist in R2 (bucket-first; container不会访问业务应用)
	const bucketName = env.S3_BUCKET_NAME || 'vidgen-render'
	const jobS3Endpoint = containerS3Endpoint(
		env.S3_ENDPOINT,
		env.S3_INTERNAL_ENDPOINT,
	)
	const pathOptions = { title: body.title ?? undefined }
	const outputVideoKey = isDownloader
		? bucketPaths.downloads.video(body.mediaId, jobId, pathOptions)
		: bucketPaths.outputs.video(body.mediaId, jobId, pathOptions)
	const outputAudioSourceKey = isDownloader
		? bucketPaths.downloads.audioSource(body.mediaId, jobId, pathOptions)
		: undefined
	const outputAudioProcessedKey = isDownloader
		? bucketPaths.downloads.audioProcessed(body.mediaId, jobId, pathOptions)
		: undefined
	// Backward-compatible: treat outputAudioKey as the processed audio key.
	let outputAudioKey = isDownloader ? outputAudioProcessedKey : undefined
	const outputMetadataKey = isDownloader
		? bucketPaths.downloads.metadata(body.mediaId, jobId, pathOptions)
		: undefined

	const opts = (body.options || {}) as any
	if (isAsrPipeline) {
		const sourceKey =
			typeof opts.sourceKey === 'string'
				? opts.sourceKey
				: String(opts.sourceKey || '')
		if (!sourceKey) {
			return json({ error: 'asr-pipeline missing sourceKey' }, { status: 400 })
		}
		// For direct ASR, treat the original audio key as the "outputAudioKey" for observability.
		outputAudioKey = sourceKey

		const stub = jobStub(env, jobId)
		if (stub) {
			const initPayload: Record<string, unknown> = {
				jobId,
				mediaId: body.mediaId,
				title: body.title,
				engine: body.engine,
				purpose,
				status: 'running',
				outputKey: undefined,
				outputAudioKey,
				metadata: { ...(body.options || {}) },
			}
			await stub.fetch('https://do/init', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(initPayload),
			})
			// Kick off ASR in the Durable Object (async via waitUntil).
			await stub.fetch('https://do/start-asr', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ jobId }),
			})
		}
		return json({ jobId })
	}

	let inputVideoUrl: string | undefined
	let inputVttUrl: string | undefined
	let inputDataUrl: string | undefined
	let manifestPurpose: string | undefined
	if (!isDownloader && !isAsrPipeline) {
		// Resolve inputs exclusively from per-job manifest written by the app. The
		// Worker no longer consults the media-level manifest when starting jobs.
		const jobManifest = await readJobManifest(env, jobId)
		if (!jobManifest) {
			return json(
				{ error: 'missing_job_manifest', details: { jobId } },
				{ status: 400 },
			)
		}
		const inputs = jobManifest.inputs || {}
		manifestPurpose =
			typeof jobManifest.purpose === 'string' && jobManifest.purpose.trim()
				? jobManifest.purpose.trim()
				: undefined

		// 1) Video source
		if (inputs.videoKey) {
			const hasVideo = await s3Head(env, bucketName, inputs.videoKey)
			if (hasVideo) {
				inputVideoUrl = await presignGetForContainer(
					env,
					bucketName,
					inputs.videoKey,
					jobS3Endpoint,
				)
			}
		}

		// 2) Text inputs (VTT / comments)
		if (body.engine === 'burner-ffmpeg' && inputs.vttKey) {
			const hasVtt = await s3Head(env, bucketName, inputs.vttKey)
			if (hasVtt) {
				inputVttUrl = await presignGetForContainer(
					env,
					bucketName,
					inputs.vttKey,
					jobS3Endpoint,
				)
			}
		} else if (body.engine === 'renderer-remotion' && inputs.commentsKey) {
			const hasData = await s3Head(env, bucketName, inputs.commentsKey)
			if (hasData) {
				inputDataUrl = await presignGetForContainer(
					env,
					bucketName,
					inputs.commentsKey,
					jobS3Endpoint,
				)
			}
		}

		// 3) Strict mode: if any input missing, fail fast with actionable error
		const needVideo = !inputVideoUrl
		const needVtt = body.engine === 'burner-ffmpeg' && !inputVttUrl
		const needData = body.engine === 'renderer-remotion' && !inputDataUrl
		if (needVideo || needVtt || needData) {
			const missing: string[] = []
			if (needVideo) missing.push('video')
			if (needVtt) missing.push('subtitles')
			if (needData) missing.push('comments-data')

			// Debug log to understand why inputs are considered missing in dev
			try {
				console.warn(
					'[handleStart.missing_inputs]',
					JSON.stringify({
						mediaId: body.mediaId,
						engine: body.engine,
						jobId,
						videoKey: inputs.videoKey ?? null,
						vttKey: inputs.vttKey ?? null,
						commentsKey: inputs.commentsKey ?? null,
						hasInputVideoUrl: Boolean(inputVideoUrl),
						hasInputVttUrl: Boolean(inputVttUrl),
						needVideo,
						needVtt,
						needData,
					}),
				)
			} catch {}

			return json(
				{
					error: 'missing_inputs',
					details: {
						missing,
						// 标记已经使用 GET-range 探测，便于从应用日志中区分新旧 Worker 版本
						hint: 'Materialize inputs in bucket/manifest (checked via GET-range)',
					},
				},
				{ status: 400 },
			)
		}
	}

	const putTtl = Number(env.PUT_EXPIRES || 600)
	const outputVideoPutUrl = await presignS3(
		env,
		'PUT',
		bucketName,
		outputVideoKey,
		putTtl,
		'video/mp4',
		jobS3Endpoint,
	)
	const outputAudioPutUrl = outputAudioKey
		? await presignS3(
				env,
				'PUT',
				bucketName,
				outputAudioKey,
				putTtl,
				// Processed audio from media-downloader is WAV (PCM S16LE, 16kHz mono).
				'audio/wav',
				jobS3Endpoint,
			)
		: undefined
	const outputAudioSourcePutUrl = outputAudioSourceKey
		? await presignS3(
				env,
				'PUT',
				bucketName,
				outputAudioSourceKey,
				putTtl,
				// Source audio is extracted losslessly from MP4 into a Matroska audio container.
				'audio/x-matroska',
				jobS3Endpoint,
			)
		: undefined
	const outputMetadataPutUrl = outputMetadataKey
		? await presignS3(
				env,
				'PUT',
				bucketName,
				outputMetadataKey,
				putTtl,
				'application/json',
				jobS3Endpoint,
			)
		: undefined

	const payload: any = {
		jobId,
		mediaId: body.mediaId,
		engine: body.engine,
		// Use container-visible base URL so the callback reaches the Worker in dev/prod
		callbackUrl: `${baseSelfForContainer}/callbacks/container`,
		engineOptions: body.options || {},
	}

	if (isDownloader) {
		payload.outputVideoPutUrl = outputVideoPutUrl
		if (outputAudioPutUrl) payload.outputAudioPutUrl = outputAudioPutUrl
		if (outputAudioSourcePutUrl)
			payload.outputAudioSourcePutUrl = outputAudioSourcePutUrl
		payload.outputVideoKey = outputVideoKey
		if (outputAudioKey) payload.outputAudioKey = outputAudioKey
		if (outputAudioSourceKey)
			payload.outputAudioSourceKey = outputAudioSourceKey
		if (outputAudioProcessedKey)
			payload.outputAudioProcessedKey = outputAudioProcessedKey
		if (outputMetadataPutUrl)
			payload.outputMetadataPutUrl = outputMetadataPutUrl
		if (outputMetadataKey) payload.outputMetadataKey = outputMetadataKey
	} else {
		payload.inputVideoUrl = inputVideoUrl
		if (body.engine === 'burner-ffmpeg') {
			payload.inputVttUrl = inputVttUrl
		} else if (body.engine === 'renderer-remotion') {
			payload.inputDataUrl = inputDataUrl
		}
		payload.outputPutUrl = outputVideoPutUrl
	}

	// Prefer Cloudflare Containers if a binding for the engine exists; fallback to external base URL otherwise
	const bindingForEngine = (
		engine: EngineId,
	): DurableObjectNamespace | undefined => {
		switch (engine) {
			case 'media-downloader':
				return env.MEDIA_DOWNLOADER
			case 'burner-ffmpeg':
				return env.BURNER_FFMPEG
			case 'renderer-remotion':
				return env.RENDERER_REMOTION
			default:
				return undefined
		}
	}

	let res: Response | undefined
	const preferExternal =
		env.PREFER_EXTERNAL_CONTAINERS === 'true' || env.NO_CF_CONTAINERS === 'true'
	const contBinding = preferExternal ? undefined : bindingForEngine(body.engine)

	// Sign the container request body so external engines can verify caller authenticity.
	const payloadText = JSON.stringify(payload)
	const containerSig = await hmacHex(secret, payloadText)
	const containerHeaders = {
		'content-type': 'application/json',
		'x-signature': containerSig,
	}
	try {
		if (contBinding) {
			// Use jobId as the container session key so each job gets its own instance
			const inst = getContainer(contBinding, jobId)
			const reqToContainer = new Request('http://container/render', {
				method: 'POST',
				headers: containerHeaders,
				body: payloadText,
			})
			res = await inst.fetch(reqToContainer)
			console.log(
				'[orchestrator] start job',
				jobId,
				'container=cloudflare-containers',
				'status=',
				res.status,
			)
		} else {
			// Fire-and-forget HTTP call to external container host
			res = await fetch(`${containerBase}/render`, {
				method: 'POST',
				headers: containerHeaders,
				body: payloadText,
			})
			console.log(
				'[orchestrator] start job',
				jobId,
				'container=',
				containerBase,
				'status=',
				res.status,
			)
		}
	} catch (e) {
		const msg = (e as any)?.message || String(e)
		console.error('[orchestrator] container start error', {
			jobId,
			engine: body.engine,
			base: contBinding ? 'cloudflare-containers' : containerBase,
			msg,
		})
		return json(
			{
				jobId,
				error: 'container_unreachable',
				message: msg,
				engine: body.engine,
				containerBase: contBinding ? undefined : containerBase,
			},
			{ status: 502 },
		)
	}
	if (!res || !res.ok) {
		return json(
			{
				jobId,
				error: 'container_start_failed',
				status: res?.status || 0,
			},
			{ status: 502 },
		)
	}

	// Initialize Durable Object
	const stub = jobStub(env, jobId)
	if (stub) {
		const initPayload: Record<string, unknown> = {
			jobId,
			mediaId: body.mediaId,
			title: body.title,
			engine: body.engine,
			purpose: purpose ?? manifestPurpose,
			status: 'running',
			outputKey: outputVideoKey,
		}
		if (outputAudioKey) initPayload.outputAudioKey = outputAudioKey
		if (outputAudioSourceKey)
			initPayload['outputAudioSourceKey'] = outputAudioSourceKey
		if (outputAudioProcessedKey)
			initPayload['outputAudioProcessedKey'] = outputAudioProcessedKey
		if (outputMetadataKey) initPayload.outputMetadataKey = outputMetadataKey
		// Persist initial options for ASR pipeline (e.g., model/thresholds)
		if (isAsrPipeline) {
			initPayload['metadata'] = { ...(body.options || {}) }
		}
		await stub.fetch('https://do/init', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(initPayload),
		})
	}
	return json({ jobId })
}
