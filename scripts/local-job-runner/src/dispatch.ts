import type { LocalJobExecutor, LocalJobKind } from './contracts'
import { asrExecutor } from './executors/asr'
import { channelSyncExecutor } from './executors/channel-sync'
import { commentsDownloadExecutor } from './executors/comments-download'
import { downloadExecutor } from './executors/download'
import { proxyCheckExecutor } from './executors/proxy-check'
import { renderCommentsExecutor } from './executors/render-comments'
import { renderSubtitlesExecutor } from './executors/render-subtitles'
import { threadAssetIngestExecutor } from './executors/thread-asset-ingest'

const EXECUTORS: Record<LocalJobKind, LocalJobExecutor> = {
	download: downloadExecutor,
	'render-subtitles': renderSubtitlesExecutor,
	'render-comments': renderCommentsExecutor,
	'comments-download': commentsDownloadExecutor,
	'channel-sync': channelSyncExecutor,
	'thread-asset-ingest': threadAssetIngestExecutor,
	asr: asrExecutor,
	'proxy-check': proxyCheckExecutor,
}

export function resolveExecutor(kind: LocalJobKind): LocalJobExecutor {
	const executor = EXECUTORS[kind]
	if (!executor) {
		throw new Error(`Unsupported local job kind: ${kind}`)
	}
	return executor
}

export function listSupportedKinds(): LocalJobKind[] {
	return Object.keys(EXECUTORS) as LocalJobKind[]
}
