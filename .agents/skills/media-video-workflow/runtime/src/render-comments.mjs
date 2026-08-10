import { bundle } from '@remotion/bundler'
import { getCompositions, renderMedia } from '@remotion/renderer'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	ensureDir,
	normalizeAssetPath,
	normalizeCommentsSnapshot,
	runProcess,
} from './lib.mjs'
import {
	REMOTION_FPS,
	buildCommentTimeline,
	buildComposeArgs,
	sourceHasAudio,
} from './comments-timeline.mjs'

const runtimeDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
)
const fps = REMOTION_FPS
const MAX_LOCAL_AVATAR_BYTES = 256 * 1024

function avatarMimeType(assetPath) {
	return {
		'.jpg': 'image/jpeg',
		'.jpeg': 'image/jpeg',
		'.png': 'image/png',
		'.webp': 'image/webp',
		'.gif': 'image/gif',
		'.svg': 'image/svg+xml',
	}[path.extname(assetPath).toLowerCase()]
}

async function localAvatarDataUrl(assetPath, assetsDir) {
	const normalized = normalizeAssetPath(assetPath)
	if (!normalized) return undefined
	const root = path.resolve(assetsDir)
	const candidate = path.resolve(root, normalized)
	if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`))
		return undefined
	const mimeType = avatarMimeType(candidate)
	if (!mimeType) return undefined
	const bytes = await fs.readFile(candidate)
	if (bytes.byteLength > MAX_LOCAL_AVATAR_BYTES) return undefined
	return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`
}

export async function renderCommentsVideo({
	inputPath,
	outputPath,
	template,
	sourceVideoPath,
	templateConfig,
	allowRemoteImages = false,
	assetsDir,
}) {
	const rawSnapshot = JSON.parse(await fs.readFile(inputPath, 'utf8'))
	if (rawSnapshot?.kind !== 'mediaflow-safe-comments') {
		throw new Error(
			'render-comments only accepts comments.safe.json produced by materialize-comments',
		)
	}
	if (
		!Array.isArray(rawSnapshot.comments) ||
		rawSnapshot.comments.some(
			(comment) => comment?.moderation?.decision !== 'allow',
		)
	) {
		throw new Error(
			'Safe comments snapshot contains a non-allow moderation decision',
		)
	}
	const snapshot = normalizeCommentsSnapshot(rawSnapshot, { allowRemoteImages })
	const resolvedAssetsDir = path.resolve(
		assetsDir || path.join(path.dirname(inputPath), 'assets'),
	)
	const comments = await Promise.all(
		snapshot.comments.map(async (comment) => {
			let authorThumbnail
			if (comment.authorThumbnailAsset) {
				try {
					authorThumbnail = await localAvatarDataUrl(
						comment.authorThumbnailAsset,
						resolvedAssetsDir,
					)
				} catch (error) {
					console.error(
						`[mediaflow] avatar asset unavailable for ${comment.id}: ${error instanceof Error ? error.message : String(error)}`,
					)
				}
			}
			return {
				...comment,
				authorThumbnail: authorThumbnail || comment.authorThumbnail,
				translatedContent:
					typeof comment.translatedContent === 'string'
						? comment.translatedContent
						: '',
			}
		}),
	)
	if (!comments.length) throw new Error('Safe comments snapshot is empty')

	const timeline = buildCommentTimeline(comments, fps)
	const {
		coverDurationInFrames,
		commentDurationsInFrames,
		totalDurationInFrames,
		coverDurationSeconds,
		totalDurationSeconds,
	} = timeline
	const compositionId =
		template === 'vertical' ? 'CommentsVideoVertical' : 'CommentsVideo'
	const inputProps = {
		videoInfo: snapshot.videoInfo,
		comments,
		coverDurationInFrames,
		commentDurationsInFrames,
		fps,
		templateConfig,
	}

	await ensureDir(path.dirname(outputPath))
	const bundleDir = await fs.mkdtemp(
		path.join(os.tmpdir(), 'mediaflow-remotion-'),
	)
	// When composing onto a source video, the Remotion render is an intermediate overlay.
	const overlayPath = sourceVideoPath
		? path.join(bundleDir, '_overlay.mp4')
		: outputPath
	try {
		const serveUrl = await bundle({
			entryPoint: path.join(runtimeDir, 'remotion', 'index.ts'),
			outDir: bundleDir,
			enableCaching: true,
		})
		const compositions = await getCompositions(serveUrl, { inputProps })
		const composition = compositions.find(
			(candidate) => candidate.id === compositionId,
		)
		if (!composition)
			throw new Error(`Bundled Remotion composition missing: ${compositionId}`)
		await renderMedia({
			composition: {
				...composition,
				durationInFrames: totalDurationInFrames,
				fps,
			},
			serveUrl,
			codec: 'h264',
			audioCodec: 'aac',
			outputLocation: overlayPath,
			inputProps,
			onProgress: ({ progress }) => {
				if (Math.round(progress * 100) % 20 === 0) {
					console.error(
						`[mediaflow] Remotion render ${Math.round(progress * 100)}%`,
					)
				}
			},
		})

		if (sourceVideoPath) {
			const hasAudio = sourceHasAudio(sourceVideoPath)
			console.error(
				`[mediaflow] Composing overlay onto source video${hasAudio ? '' : ' (no audio track)'}`,
			)
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
