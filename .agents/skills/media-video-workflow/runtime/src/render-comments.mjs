import { bundle } from '@remotion/bundler'
import { getCompositions, renderMedia } from '@remotion/renderer'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDir, normalizeCommentsSnapshot } from './lib.mjs'

const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fps = 30

function durationForComment(comment) {
	const characters = String(comment.content || '').length + String(comment.translatedContent || '').length
	return Math.round(Math.max(3.5, Math.min(10, 3.5 + characters / 38)) * fps)
}

export async function renderCommentsVideo({ inputPath, outputPath, template }) {
	const rawSnapshot = JSON.parse(await fs.readFile(inputPath, 'utf8'))
	if (rawSnapshot?.kind !== 'mediaflow-safe-comments') {
		throw new Error('render-comments only accepts comments.safe.json produced by materialize-comments')
	}
	if (
		!Array.isArray(rawSnapshot.comments) ||
		rawSnapshot.comments.some((comment) => comment?.moderation?.decision !== 'allow')
	) {
		throw new Error('Safe comments snapshot contains a non-allow moderation decision')
	}
	const snapshot = normalizeCommentsSnapshot(rawSnapshot)
	const comments = snapshot.comments.map((comment) => ({
		...comment,
		translatedContent: typeof comment.translatedContent === 'string' ? comment.translatedContent : '',
	}))
	if (!comments.length) throw new Error('Safe comments snapshot is empty')

	const coverDurationInFrames = fps * 3
	const commentDurationsInFrames = comments.map(durationForComment)
	const durationInFrames = coverDurationInFrames + commentDurationsInFrames.reduce((sum, duration) => sum + duration, 0)
	const orientation = template === 'portrait' ? 'portrait' : 'landscape'
	const compositionId = orientation === 'portrait' ? 'MediaflowCommentsPortrait' : 'MediaflowCommentsLandscape'
	const inputProps = {
		videoInfo: snapshot.videoInfo,
		comments,
		coverDurationInFrames,
		commentDurationsInFrames,
		fps,
		orientation,
	}

	await ensureDir(path.dirname(outputPath))
	const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mediaflow-remotion-'))
	try {
		const serveUrl = await bundle({
			entryPoint: path.join(runtimeDir, 'remotion', 'index.ts'),
			outDir: bundleDir,
			enableCaching: true,
		})
		const compositions = await getCompositions(serveUrl, { inputProps })
		const composition = compositions.find((candidate) => candidate.id === compositionId)
		if (!composition) throw new Error(`Bundled Remotion composition missing: ${compositionId}`)
		await renderMedia({
			composition: { ...composition, durationInFrames, fps },
			serveUrl,
			codec: 'h264',
			audioCodec: 'aac',
			outputLocation: outputPath,
			inputProps,
			onProgress: ({ progress }) => {
				if (Math.round(progress * 100) % 20 === 0) {
					console.error(`[mediaflow] Remotion render ${Math.round(progress * 100)}%`)
				}
			},
		})
	} finally {
		await fs.rm(bundleDir, { recursive: true, force: true })
	}
}
