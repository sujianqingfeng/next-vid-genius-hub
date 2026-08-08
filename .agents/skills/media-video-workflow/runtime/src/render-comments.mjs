import { bundle } from '@remotion/bundler'
import { getCompositions, renderMedia } from '@remotion/renderer'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDir, normalizeCommentsSnapshot, runProcess } from './lib.mjs'
import { REMOTION_FPS, buildCommentTimeline, buildComposeArgs, sourceHasAudio } from './comments-timeline.mjs'

const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fps = REMOTION_FPS

export async function renderCommentsVideo({ inputPath, outputPath, template, sourceVideoPath, templateConfig }) {
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

	const timeline = buildCommentTimeline(comments, fps)
	const { coverDurationInFrames, commentDurationsInFrames, totalDurationInFrames, coverDurationSeconds, totalDurationSeconds } =
		timeline
	const compositionId = template === 'vertical' ? 'CommentsVideoVertical' : 'CommentsVideo'
	const inputProps = {
		videoInfo: snapshot.videoInfo,
		comments,
		coverDurationInFrames,
		commentDurationsInFrames,
		fps,
		templateConfig,
	}

	await ensureDir(path.dirname(outputPath))
	const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mediaflow-remotion-'))
	// When composing onto a source video, the Remotion render is an intermediate overlay.
	const overlayPath = sourceVideoPath ? path.join(bundleDir, '_overlay.mp4') : outputPath
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
			composition: { ...composition, durationInFrames: totalDurationInFrames, fps },
			serveUrl,
			codec: 'h264',
			audioCodec: 'aac',
			outputLocation: overlayPath,
			inputProps,
			onProgress: ({ progress }) => {
				if (Math.round(progress * 100) % 20 === 0) {
					console.error(`[mediaflow] Remotion render ${Math.round(progress * 100)}%`)
				}
			},
		})

		if (sourceVideoPath) {
			const hasAudio = sourceHasAudio(sourceVideoPath)
			console.error(`[mediaflow] Composing overlay onto source video${hasAudio ? '' : ' (no audio track)'}`)
			await runProcess(
				'ffmpeg',
				buildComposeArgs({
					overlayPath,
					sourceVideoPath,
					outputPath,
					fps,
					coverDurationSeconds,
					totalDurationSeconds,
					preset: 'veryfast',
					hasAudio,
				}),
			)
		}
	} finally {
		await fs.rm(bundleDir, { recursive: true, force: true })
	}
}
