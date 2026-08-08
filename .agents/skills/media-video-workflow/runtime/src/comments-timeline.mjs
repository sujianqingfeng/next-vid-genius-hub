import { spawnSync } from 'node:child_process'

// Vendored from packages/media-comments/src/core/shared.ts (plain JS).
// The scroll/font constants here MUST stay in sync with the vendored
// CommentsVideo.tsx / CommentsVideoVertical.tsx (ScrollingCommentWithTranslation),
// because buildCommentTimeline models the same on-screen scroll the template plays.

export const REMOTION_FPS = 50
export const COVER_DURATION_SECONDS = 3
export const MIN_COMMENT_DURATION_SECONDS = 3
export const MAX_COMMENT_DURATION_SECONDS = 8

const BASE_SECONDS = 2.8
const TRANSLATION_WEIGHT = 1.2
const CHARACTER_DIVISOR = 90
const APPEAR_DISAPPEAR_BUFFER_SECONDS = 1.6

const SCROLL_CONTAINER_HEIGHT = 320
const SCROLL_SPEED_PX_PER_SEC = 30
const MIN_SCROLL_TIME_SECONDS = 1.5

const chineseCharRegex = /[一-鿿]/
function isChinese(text) {
	return Boolean(text && chineseCharRegex.test(text))
}

function estimateCommentHeight(comment) {
	const isPrimaryChinese = isChinese(comment?.content)
	const isTranslationChinese = isChinese(comment?.translatedContent)
	const mainFontSize = isPrimaryChinese ? 56 : 28
	const mainLineHeight = isPrimaryChinese ? 1.4 : 1.6
	const mainLineHeightPx = mainFontSize * mainLineHeight
	const mainLines = String(comment?.content || '').split('\n').length
	const mainHeight = mainLines * mainLineHeightPx
	let totalHeight = mainHeight
	if (comment?.translatedContent && comment.translatedContent !== comment.content) {
		const translationFontSize = isTranslationChinese ? 56 : 26
		const translationLineHeight = isTranslationChinese ? 1.4 : 1.6
		const translationLineHeightPx = translationFontSize * translationLineHeight
		const translationLines = String(comment?.translatedContent || '').split('\n').length
		const translationHeight = translationLines * translationLineHeightPx
		const spacingBetweenSections = 28
		totalHeight += spacingBetweenSections + translationHeight
	}
	return totalHeight
}

function calculateScrollingDuration(contentHeight) {
	if (contentHeight <= SCROLL_CONTAINER_HEIGHT) return 0
	const scrollDistance = contentHeight - SCROLL_CONTAINER_HEIGHT
	const timeNeeded = scrollDistance / SCROLL_SPEED_PX_PER_SEC
	return Math.max(MIN_SCROLL_TIME_SECONDS, timeNeeded)
}

export function estimateCommentDurationSeconds(comment) {
	const contentLength = String(comment?.content || '').length
	const translationLength = String(comment?.translatedContent || '').length
	const weightedChars = contentLength + translationLength * TRANSLATION_WEIGHT
	const readingDuration = BASE_SECONDS + weightedChars / CHARACTER_DIVISOR
	const contentHeight = estimateCommentHeight(comment)
	const scrollingDuration = calculateScrollingDuration(contentHeight)
	const total = readingDuration + scrollingDuration + APPEAR_DISAPPEAR_BUFFER_SECONDS
	return Math.min(MAX_COMMENT_DURATION_SECONDS, Math.max(MIN_COMMENT_DURATION_SECONDS, total))
}

export function buildCommentTimeline(comments, fps = REMOTION_FPS) {
	const coverDurationInFrames = Math.round(COVER_DURATION_SECONDS * fps)
	const commentDurationsInFrames = (Array.isArray(comments) ? comments : []).map((c) =>
		Math.round(estimateCommentDurationSeconds(c) * fps),
	)
	const totalDurationInFrames = coverDurationInFrames + commentDurationsInFrames.reduce((s, f) => s + f, 0)
	const totalDurationSeconds = totalDurationInFrames / fps
	return {
		coverDurationInFrames,
		commentDurationsInFrames,
		totalDurationInFrames,
		totalDurationSeconds,
		coverDurationSeconds: COVER_DURATION_SECONDS,
	}
}

// ---------------- Layout constants (video slot for compose-on-video) ----------------
export const VIDEO_WIDTH = 720
export const VIDEO_HEIGHT = 405

const layout = {
	paddingX: 80,
	paddingY: 60,
	columnGap: 40,
	infoPanelWidth: 680,
	cardPaddingX: 32,
}

const REMOTION_CANVAS_WIDTH = 1920
const containerContentWidth = REMOTION_CANVAS_WIDTH - layout.paddingX * 2
const videoPanelWidth = layout.cardPaddingX * 2 + VIDEO_WIDTH
const gridContentWidth = layout.infoPanelWidth + layout.columnGap + videoPanelWidth
const centerOffset = Math.max(0, (containerContentWidth - gridContentWidth) / 2)
const videoPanelX = layout.paddingX + centerOffset + layout.infoPanelWidth + layout.columnGap
const videoPanelY = layout.paddingY
const VIDEO_X = videoPanelX + layout.cardPaddingX
const VIDEO_Y = videoPanelY

export const layoutConstants = {
	video: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT, x: VIDEO_X, y: VIDEO_Y },
}

// ---------------- FFmpeg compose (overlay source video into the template slot) ----------------

// Probe whether the source has an audio track. Source videos with no audio
// (e.g. silent/visual-only clips) must skip the audio filter branch entirely,
// otherwise ffmpeg fails with "Stream specifier ':a' ... matches no streams".
export function sourceHasAudio(filePath) {
	const result = spawnSync(
		'ffprobe',
		['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', filePath],
		{ encoding: 'utf8' },
	)
	return Boolean((result.stdout || '').trim())
}

export function getOverlayFilter({
	coverDurationSeconds,
	totalDurationSeconds,
	layout: overrideLayout,
	fps = REMOTION_FPS,
	hasAudio = true,
}) {
	const slot = overrideLayout || layoutConstants.video
	const actualX = Math.round(slot.x)
	const actualY = Math.round(slot.y)
	const actualWidth = Math.round(slot.width)
	const actualHeight = Math.round(slot.height)
	const delayMs = Math.round(coverDurationSeconds * 1000)
	const filterGraph = [
		`[1:v]fps=${fps},setpts=PTS-STARTPTS,scale=${actualWidth}:${actualHeight}:flags=lanczos,setsar=1[scaled_src]`,
		`[0:v][scaled_src]overlay=${actualX}:${actualY}:enable='between(t,${coverDurationSeconds},${totalDurationSeconds})'[composited]`,
	]
	if (hasAudio) {
		filterGraph.push(
			`[1:a]adelay=${delayMs}|${delayMs},atrim=0:${totalDurationSeconds},asetpts=PTS-STARTPTS[delayed_audio]`,
		)
	}
	return { filterGraph: filterGraph.join(';'), actualX, actualY, actualWidth, actualHeight, delayMs }
}

export function buildComposeArgs({
	overlayPath,
	sourceVideoPath,
	outputPath,
	fps = REMOTION_FPS,
	coverDurationSeconds,
	totalDurationSeconds,
	layout: overrideLayout,
	hasAudio = true,
	videoCodec = 'libx264',
	audioCodec = 'aac',
	audioBitrate = '192k',
	preset,
	pixFmt = 'yuv420p',
	movFlags = '+faststart',
	vsync = 'cfr',
}) {
	const { filterGraph } = getOverlayFilter({ coverDurationSeconds, totalDurationSeconds, layout: overrideLayout, fps, hasAudio })
	const args = [
		'-y',
		'-hide_banner',
		'-loglevel',
		'error',
		'-progress',
		'pipe:2',
		'-i',
		overlayPath,
		'-stream_loop',
		'-1',
		'-i',
		sourceVideoPath,
		'-filter_complex',
		filterGraph,
		'-map',
		'[composited]',
	]
	if (hasAudio) {
		args.push('-map', '[delayed_audio]?', '-c:a', audioCodec, '-b:a', audioBitrate)
	}
	args.push('-vsync', vsync, '-r', String(fps), '-c:v', videoCodec)
	if (preset) args.push('-preset', preset)
	args.push('-pix_fmt', pixFmt, '-movflags', movFlags, '-t', String(totalDurationSeconds), '-shortest', outputPath)
	return args
}

