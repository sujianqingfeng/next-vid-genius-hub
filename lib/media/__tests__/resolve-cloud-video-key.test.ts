import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	getJobStatusMock: vi.fn(),
	remoteKeyExistsMock: vi.fn(),
}))

vi.mock('~/lib/cloudflare', () => ({
	getJobStatus: mocks.getJobStatusMock,
	remoteKeyExists: mocks.remoteKeyExistsMock,
}))

import { resolveCloudVideoKey } from '../resolve-cloud-video-key'

describe('resolveCloudVideoKey', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('returns remoteVideoKey for original policy when it exists', async () => {
		mocks.remoteKeyExistsMock.mockResolvedValueOnce(true)
		const key = await resolveCloudVideoKey({
			sourcePolicy: 'original',
			remoteVideoKey: 'k-remote',
			downloadJobId: null,
			filePath: null,
			videoWithSubtitlesPath: null,
		})
		expect(key).toBe('k-remote')
		expect(mocks.getJobStatusMock).not.toHaveBeenCalled()
		expect(mocks.remoteKeyExistsMock).toHaveBeenCalledWith('k-remote')
	})

	it('falls back to downloadJobId output key when remoteVideoKey is missing', async () => {
		mocks.remoteKeyExistsMock
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true)
		mocks.getJobStatusMock.mockResolvedValueOnce({ outputKey: 'k-from-job' })
		const key = await resolveCloudVideoKey({
			sourcePolicy: 'original',
			remoteVideoKey: 'k-missing',
			downloadJobId: 'job_download',
			filePath: null,
			videoWithSubtitlesPath: null,
		})
		expect(key).toBe('k-from-job')
		expect(mocks.getJobStatusMock).toHaveBeenCalledWith('job_download')
		expect(mocks.remoteKeyExistsMock).toHaveBeenCalledTimes(2)
	})

	it('uses subtitles job key for subtitles policy', async () => {
		mocks.getJobStatusMock.mockResolvedValueOnce({
			outputs: { video: { key: 'k-sub' } },
		})
		mocks.remoteKeyExistsMock.mockResolvedValueOnce(true)
		const key = await resolveCloudVideoKey({
			sourcePolicy: 'subtitles',
			remoteVideoKey: 'k-remote',
			downloadJobId: 'job_download',
			filePath: null,
			videoWithSubtitlesPath: 'remote:orchestrator:job_subtitles',
		})
		expect(key).toBe('k-sub')
		expect(mocks.getJobStatusMock).toHaveBeenCalledWith('job_subtitles')
	})

	it('auto policy falls back to original when subtitles key is missing', async () => {
		mocks.getJobStatusMock.mockResolvedValueOnce({ outputKey: 'k-sub' })
		mocks.remoteKeyExistsMock
			.mockResolvedValueOnce(false) // subtitles key
			.mockResolvedValueOnce(true) // original remote key
		const key = await resolveCloudVideoKey({
			sourcePolicy: 'auto',
			remoteVideoKey: 'k-remote',
			downloadJobId: null,
			filePath: null,
			videoWithSubtitlesPath: 'remote:orchestrator:job_subtitles',
		})
		expect(key).toBe('k-remote')
		expect(mocks.remoteKeyExistsMock).toHaveBeenCalledTimes(2)
	})

	it('returns null when no candidates exist', async () => {
		const key = await resolveCloudVideoKey({
			sourcePolicy: 'auto',
			remoteVideoKey: null,
			downloadJobId: null,
			filePath: null,
			videoWithSubtitlesPath: null,
		})
		expect(key).toBeNull()
		expect(mocks.getJobStatusMock).not.toHaveBeenCalled()
		expect(mocks.remoteKeyExistsMock).not.toHaveBeenCalled()
	})
})
