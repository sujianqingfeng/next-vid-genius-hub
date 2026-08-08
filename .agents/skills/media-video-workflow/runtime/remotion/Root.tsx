import { Composition } from 'remotion'
import type { FC } from 'react'
import { CommentsVideo } from './CommentsVideo'
import { CommentsVideoVertical } from './CommentsVideoVertical'
import { REMOTION_FPS } from './constants'
import type { CommentVideoInputProps } from './types'

const fps = REMOTION_FPS
const width = 1920
const height = 1080

const defaultProps: CommentVideoInputProps = {
	videoInfo: {
		title: 'Sample Title',
		translatedTitle: '示例标题',
		viewCount: 0,
		author: 'creator',
		series: '外网真实评论',
	},
	comments: [],
	coverDurationInFrames: fps * 3,
	commentDurationsInFrames: [],
	fps,
}

export const RemotionRoot: FC = () => {
	return (
		<>
			<Composition
				id="CommentsVideo"
				component={CommentsVideo}
				durationInFrames={fps * 5}
				fps={fps}
				width={width}
				height={height}
				defaultProps={defaultProps}
			/>
			<Composition
				id="CommentsVideoVertical"
				component={CommentsVideoVertical}
				durationInFrames={fps * 5}
				fps={fps}
				width={width}
				height={height}
				defaultProps={defaultProps}
			/>
		</>
	)
}
