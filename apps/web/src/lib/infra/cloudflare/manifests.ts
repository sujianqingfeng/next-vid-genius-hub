import { bucketPaths, type JobManifest } from '@app/media-domain'
import { presignPutAndGetByKey } from './storage'

export type { JobManifest } from '@app/media-domain'

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
