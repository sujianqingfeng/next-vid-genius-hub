import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { LocalJobExecutor } from '../contracts'
import {
	ensureDir,
	extFromContentType,
	readJsonFile,
	resolveOutputPath,
	writeJsonFile,
} from '../fs-utils'
import { assertNoInternalApiUrl } from './io'

type ThreadAssetInputItem = {
	id: string
	url: string
	kind?: 'image' | 'video' | 'audio' | 'unknown'
}

type ThreadAssetIngestInput = {
	assets?: ThreadAssetInputItem[]
	assetsPath?: string
	outputDir?: string
	manifestPath?: string
	timeoutMs?: number
	maxBytes?: number
}

function guessExtFromUrl(url: string): string {
	try {
		const pathname = new URL(url).pathname
		const ext = path.extname(pathname)
		if (ext && ext.length <= 10) return ext
		return ''
	} catch {
		return ''
	}
}

async function loadAssets(input: ThreadAssetIngestInput): Promise<ThreadAssetInputItem[]> {
	if (Array.isArray(input.assets) && input.assets.length > 0) return input.assets
	if (input.assetsPath) {
		const parsed = await readJsonFile<ThreadAssetInputItem[]>(
			path.resolve(input.assetsPath),
		)
		if (Array.isArray(parsed)) return parsed
	}
	return []
}

async function fetchAsset(url: string, timeoutMs: number, maxBytes: number): Promise<{
	contentType: string | null
	data: Buffer
}> {
	assertNoInternalApiUrl(url)
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const response = await fetch(url, {
			method: 'GET',
			signal: controller.signal,
			redirect: 'follow',
			cache: 'no-store',
		})
		if (!response.ok) {
			throw new Error(`Fetch failed: ${response.status} ${response.statusText}`)
		}

		const reader = response.body?.getReader()
		if (!reader) {
			return { contentType: response.headers.get('content-type'), data: Buffer.alloc(0) }
		}

		const chunks: Uint8Array[] = []
		let total = 0
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			if (!value) continue
			total += value.byteLength
			if (total > maxBytes) {
				throw new Error(`Asset too large (${total} bytes), max=${maxBytes}`)
			}
			chunks.push(value)
		}

		const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
		return { contentType: response.headers.get('content-type'), data: buffer }
	} finally {
		clearTimeout(timeout)
	}
}

export const threadAssetIngestExecutor: LocalJobExecutor = async (ctx) => {
	const input = ctx.spec.input as ThreadAssetIngestInput
	const assets = await loadAssets(input)
	if (assets.length === 0) {
		throw new Error('thread-asset-ingest requires non-empty input.assets or input.assetsPath')
	}

	const timeoutMs = Math.max(1_000, Number(input.timeoutMs || 25_000))
	const maxBytes = Math.max(1_024, Number(input.maxBytes || 25 * 1024 * 1024))

	const objectDir = resolveOutputPath(
		process.cwd(),
		input.outputDir || path.join('.local-jobs', 'objects', 'thread-assets'),
	)
	await ensureDir(objectDir)
	const manifestPath = input.manifestPath
		? resolveOutputPath(objectDir, input.manifestPath)
		: path.join(objectDir, `${ctx.jobId}.manifest.json`)

	await ctx.emit({
		status: 'running',
		phase: 'preparing',
		progress: 0.05,
		message: `Preparing ingest for ${assets.length} assets`,
	})

	const summary: Array<{
		id: string
		url: string
		status: 'ready' | 'failed'
		path?: string
		bytes?: number
		contentType?: string | null
		error?: string
	}> = []

	for (let index = 0; index < assets.length; index++) {
		if (await ctx.isCanceled()) return
		const asset = assets[index]!
		const ratio = assets.length > 0 ? index / assets.length : 0
		await ctx.emit({
			status: 'running',
			phase: 'running',
			progress: 0.1 + ratio * 0.8,
			message: `Ingesting asset ${index + 1}/${assets.length}`,
		})

		try {
			if (!asset.id || !asset.url) {
				throw new Error('Asset requires id and url')
			}
			const fetched = await fetchAsset(asset.url, timeoutMs, maxBytes)
			const ext = extFromContentType(fetched.contentType) || guessExtFromUrl(asset.url)
			const filePath = path.join(objectDir, `${asset.id}${ext}`)
			await fs.writeFile(filePath, fetched.data)
			summary.push({
				id: asset.id,
				url: asset.url,
				status: 'ready',
				path: filePath,
				bytes: fetched.data.byteLength,
				contentType: fetched.contentType,
			})
		} catch (error) {
			summary.push({
				id: asset.id,
				url: asset.url,
				status: 'failed',
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	await writeJsonFile(manifestPath, {
		jobId: ctx.jobId,
		assets: summary,
	})

	const failed = summary.filter((item) => item.status === 'failed').length
	const succeeded = summary.length - failed
	if (failed > 0 && succeeded === 0) {
		throw new Error('All thread asset ingests failed')
	}

	await ctx.emit({
		status: failed > 0 ? 'failed' : 'completed',
		phase: failed > 0 ? 'failed' : 'completed',
		progress: 1,
		message:
			failed > 0
				? `Thread asset ingest completed with failures (${failed}/${summary.length})`
				: 'Thread asset ingest completed',
		outputs: {
			manifest: {
				path: manifestPath,
				contentType: 'application/json',
			},
		},
		metadata: {
			total: summary.length,
			succeeded,
			failed,
		},
	})
}
