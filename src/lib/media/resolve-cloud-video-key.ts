import { getJobStatus, remoteKeyExists } from '~/lib/cloudflare'

export type CloudVideoSourcePolicy = 'auto' | 'original' | 'subtitles'

export interface ResolveCloudVideoKeyInput {
	sourcePolicy: CloudVideoSourcePolicy
	remoteVideoKey: string | null
	downloadJobId: string | null
	filePath?: string | null
	videoWithSubtitlesPath?: string | null
}

function extractOrchestratorJobId(
	path: string | null | undefined,
): string | null {
	if (!path) return null
	if (!path.startsWith('remote:orchestrator:')) return null
	return path.split(':').pop() || null
}

async function getVideoKeyFromJob(jobId: string): Promise<string | null> {
	const status = await getJobStatus(jobId)
	return status.outputs?.video?.key ?? status.outputKey ?? null
}

export async function resolveCloudVideoKey(
	input: ResolveCloudVideoKeyInput,
): Promise<string | null> {
	const subtitlesJobId = extractOrchestratorJobId(input.videoWithSubtitlesPath)
	const originalJobId =
		extractOrchestratorJobId(input.filePath) || input.downloadJobId

	const candidates: Array<() => Promise<string | null>> = []

	const pushOriginalCandidates = () => {
		candidates.push(async () => input.remoteVideoKey)
		if (originalJobId) {
			candidates.push(async () => getVideoKeyFromJob(originalJobId))
		}
	}

	const pushSubtitlesCandidates = () => {
		if (subtitlesJobId) {
			candidates.push(async () => getVideoKeyFromJob(subtitlesJobId))
		}
	}

	if (input.sourcePolicy === 'subtitles') {
		pushSubtitlesCandidates()
		pushOriginalCandidates()
	} else if (input.sourcePolicy === 'original') {
		pushOriginalCandidates()
	} else {
		// auto: prefer subtitles variant if available, then fall back to original
		pushSubtitlesCandidates()
		pushOriginalCandidates()
	}

	for (const getCandidate of candidates) {
		const key = await getCandidate()
		if (!key) continue
		if (await remoteKeyExists(key)) return key
	}

	return null
}
