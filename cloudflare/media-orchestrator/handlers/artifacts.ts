import { bucketPaths } from '@app/media-domain'
import type { Env } from '../types'
import { deleteObjectFromStorage, putObjectStreamToStorage, streamObjectFromS3 } from '../storage/fallback'
import { json } from '../utils/http'
import { jobStub } from '../utils/job'

async function loadJobDoc(_env: Env, _jobId: string, stub?: any): Promise<any | undefined> {
	if (!stub) return undefined
	try {
		const r = await stub.fetch('https://do/')
		if (r.ok) return (await r.json()) as any
	} catch {}
	return undefined
}

function collectKeysFromDoc(doc: any, jobId: string): string[] {
	const collected = new Set<string>()
	const push = (value: unknown) => {
		if (typeof value === 'string') {
			const trimmed = value.trim()
			if (trimmed) collected.add(trimmed)
		}
	}

	if (doc) {
		push(doc.outputKey)
		push(doc.outputAudioKey)
		push(doc.outputMetadataKey)
		if (doc.outputs && typeof doc.outputs === 'object') {
			for (const value of Object.values(doc.outputs)) {
				if (value && typeof value === 'object' && 'key' in value) {
					push((value as { key?: unknown }).key)
				}
			}
		}
		if (Array.isArray(doc.outputs)) {
			for (const item of doc.outputs) {
				if (item && typeof item === 'object' && 'key' in item) {
					push((item as { key?: unknown }).key)
				}
			}
		}
		const mediaId = typeof doc.mediaId === 'string' ? doc.mediaId : undefined
		const pathOptions = { title: doc?.title as string | undefined }
		if (mediaId) {
			push(bucketPaths.outputs.video(mediaId, jobId, pathOptions))
			push(bucketPaths.downloads.video(mediaId, jobId, pathOptions))
			push(bucketPaths.downloads.audio(mediaId, jobId, pathOptions))
			push(bucketPaths.downloads.metadata(mediaId, jobId, pathOptions))
			push(bucketPaths.asr.results.transcript(mediaId, jobId, pathOptions))
			push(bucketPaths.asr.results.words(mediaId, jobId, pathOptions))
		}
	}

	// Fallback canonical location
	push(bucketPaths.outputs.fallbackVideo(jobId))

	return Array.from(collected)
}

export async function handleArtifactDelete(env: Env, jobId: string) {
	if (!jobId) return json({ error: 'jobId required' }, { status: 400 })
	const stub = jobStub(env, jobId)
	const doc = await loadJobDoc(env, jobId, stub)
	const keys = collectKeysFromDoc(doc, jobId)

	const deleted: string[] = []
	const errors: Record<string, string> = {}

	for (const key of keys) {
		try {
			await deleteObjectFromStorage(env, key)
			deleted.push(key)
		} catch (err) {
			errors[key] = err instanceof Error ? err.message : String(err)
		}
	}

	if (stub) {
		try {
			await stub.fetch('https://do/', { method: 'DELETE' })
		} catch (err) {
			console.warn('[artifact-delete] DO cleanup failed', err)
		}
	}

	const hasErrors = Object.keys(errors).length > 0
	return json({ ok: !hasErrors, deleted, keys, errors }, { status: hasErrors ? 500 : 200 })
}

export async function handleUpload(env: Env, req: Request, jobId: string) {
	// 依据 DO 中的 outputKey 决定最终存储路径（包含 mediaId）
	let outputKey = bucketPaths.outputs.fallbackVideo(jobId)
	try {
		const stub = jobStub(env, jobId)
		if (stub) {
			const r = await stub.fetch('https://do/')
			if (r.ok) {
				const doc = (await r.json()) as any
				if (doc?.outputKey) outputKey = doc.outputKey
			}
		}
	} catch {}

	// Persist artifact into bucket（优先使用 S3，便于本地 Worker 直接写入远端 R2）
	const body = req.body as ReadableStream | null
	if (!body) return json({ error: 'missing request body' }, { status: 400 })
	await putObjectStreamToStorage(env, outputKey, 'video/mp4', body)
	return json({ ok: true, outputKey, outputUrl: `/artifacts/${jobId}` })
}

export async function handleArtifactGet(env: Env, req: Request, jobId: string) {
	// 优先从 DO 获取 outputKey（包含 mediaId 的归属路径）
	let key = bucketPaths.outputs.fallbackVideo(jobId)
	try {
		const stub = jobStub(env, jobId)
		if (stub) {
			const r = await stub.fetch('https://do/')
			if (r.ok) {
				const doc = (await r.json()) as any
				if (doc?.outputKey) key = doc.outputKey
			}
		}
	} catch {}
	const range = req.headers.get('range')

	// R2 绑定直读（生产常见路径）；若不可用或对象不存在则回退到 S3 直连
	if (env.RENDER_BUCKET) {
		try {
			if (range) {
				const m = range.match(/bytes=(\d*)-(\d*)/)
				if (!m) return json({ error: 'invalid range' }, { status: 400 })
				const startStr = m[1]
				const endStr = m[2]
				const head = await env.RENDER_BUCKET.head(key)
				if (head) {
					const size = head.size
					let start: number
					let end: number
					if (startStr === '' && endStr) {
						const suffix = parseInt(endStr, 10)
						start = Math.max(size - suffix, 0)
						end = size - 1
					} else {
						start = parseInt(startStr, 10)
						end = endStr ? parseInt(endStr, 10) : size - 1
					}
					if (
						Number.isNaN(start) ||
						Number.isNaN(end) ||
						start < 0 ||
						end < start
					) {
						return json({ error: 'invalid range' }, { status: 416 })
					}
					if (end >= size) end = size - 1
					const len = end - start + 1
					const part = await env.RENDER_BUCKET.get(key, {
						range: { offset: start, length: len },
					})
					if (part) {
						const h = new Headers()
						h.set('content-type', part.httpMetadata?.contentType || 'video/mp4')
						h.set('accept-ranges', 'bytes')
						h.set('content-length', String(len))
						h.set('content-range', `bytes ${start}-${end}/${size}`)
						return new Response(part.body, { status: 206, headers: h })
					}
				}
				// head 或 get 返回空时，回退到 S3
			} else {
				const obj = await env.RENDER_BUCKET.get(key)
				if (obj) {
					const h = new Headers()
					h.set('content-type', obj.httpMetadata?.contentType || 'video/mp4')
					h.set('accept-ranges', 'bytes')
					return new Response(obj.body, { headers: h })
				}
			}
		} catch (e) {
			console.warn('[artifacts] R2 read failed, falling back to S3', e)
		}
	}

	// Fallback: stream via S3 presigned URL（本地 Worker 仍可访问远端 R2）
	return streamObjectFromS3(env, key, range)
}

