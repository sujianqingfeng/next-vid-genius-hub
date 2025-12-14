import { describe, expect, it } from 'vitest'

import type { Env } from '../../types'
import { presignS3 } from '../presign'

describe('presignS3', () => {
	it('RFC3986-encodes object keys in canonical URI', async () => {
		const env = {
			S3_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
			S3_ACCESS_KEY_ID: 'test-access-key',
			S3_SECRET_ACCESS_KEY: 'test-secret-access-key',
			S3_REGION: 'us-east-1',
			S3_STYLE: 'path',
		} as unknown as Env

		const key = "media-id-title-ASML-CEO:China-Won't-Accept-Being-Cut-Off/(demo)/audio.mp3"
		const url = await presignS3(env, 'PUT', 'media', key, 600, 'audio/mpeg')

		const pathname = new URL(url).pathname
		expect(pathname).toContain('/media/')
		expect(pathname).toContain('%3A')
		expect(pathname).toContain('%27')
		expect(pathname).toContain('%28')
		expect(pathname).toContain('%29')
		expect(pathname).not.toContain("'")
	})
})

