import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it, beforeAll } from 'vitest'

import { downloadVideo } from '../download'

const OUTPUT_DIR = path.join(__dirname, 'artifacts')
const OUTPUT_PATH = path.join(OUTPUT_DIR, '9qIHqX6rdiw.mp4')
const TEST_TIMEOUT = 5 * 60_000

describe('downloadVideo integration', () => {
	beforeAll(async () => {
		await fs.mkdir(OUTPUT_DIR, { recursive: true })
		await fs.rm(OUTPUT_PATH, { force: true })
	})

	it(
		'downloads https://www.youtube.com/watch?v=9qIHqX6rdiw to artifacts directory',
		async () => {
			await downloadVideo(
				'https://www.youtube.com/watch?v=9qIHqX6rdiw',
				'720p',
				OUTPUT_PATH,
			)

			const stats = await fs.stat(OUTPUT_PATH)
			expect(stats.size).toBeGreaterThan(0)
		},
		TEST_TIMEOUT,
	)
})
