import { bucketPaths } from '@app/media-domain'
import { presignPutAndGetByKey } from './storage'

// Per-job manifest: immutable snapshot of everything a single async job needs
// so that Workers/containers never have to reach into the primary DB.
export interface JobManifest {
	jobId: string
	mediaId: string
	engine: string
	createdAt: number
	// Inputs resolved at job-start time. Engines must not look at DB; only at
	// these resolved keys/options.
	inputs: {
		// Generic video/audio keys (e.g. downloads/.../video.mp4)
		videoKey?: string | null
		audioKey?: string | null
		// Optional pre-materialized variants
		subtitlesInputKey?: string | null
		vttKey?: string | null
		commentsKey?: string | null
		// ASR / audio pipelines
		asrSourceKey?: string | null
		// Optional policy hints (e.g. which variant to prefer)
		sourcePolicy?: 'auto' | 'original' | 'subtitles' | null
	}
	// Optional outputs contract for observability/debugging. Containers still
	// receive presigned PUT URLs from the orchestrator; this just records the
	// canonical keys we expect to be written.
	outputs?: {
		videoKey?: string | null
		audioKey?: string | null
		metadataKey?: string | null
		vttKey?: string | null
		wordsKey?: string | null
	}
	// Best-effort snapshot of engine options for debugging.
	optionsSnapshot?: Record<string, unknown>
}

export async function putJobManifest(
	jobId: string,
	manifest: JobManifest,
): Promise<void> {
	const key = bucketPaths.manifests.job(jobId)
	const { putUrl } = await presignPutAndGetByKey(key, 'application/json')
	const res = await fetch(putUrl, {
		method: 'PUT',
		headers: {
			'content-type': 'application/json',
			'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
		},
		body: JSON.stringify(manifest),
	})
	if (!res.ok) {
		throw new Error(`putJobManifest failed: ${res.status} ${await res.text()}`)
	}
}
