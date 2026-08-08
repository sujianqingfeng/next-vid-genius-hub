import { Composition } from 'remotion'
import type { FC } from 'react'
import { CommentsVideo } from './CommentsVideo'
import type { CommentsVideoProps } from './types'

const fps = 30

const defaultProps: CommentsVideoProps = {
	videoInfo: {
		title: 'Audience reactions',
		translatedTitle: '观众评论',
		author: 'Creator',
		viewCount: 0,
	},
	comments: [
		{
			id: 'sample-comment',
			author: 'Viewer',
			content: 'A thoughtful comment appears here.',
			translatedContent: '一条有价值的评论会显示在这里。',
			likes: 1,
		},
	],
	coverDurationInFrames: fps * 3,
	commentDurationsInFrames: [fps * 5],
	fps,
	orientation: 'landscape',
}

export const RemotionRoot: FC = () => {
	return (
		<>
			<Composition
				id="MediaflowCommentsLandscape"
				component={CommentsVideo}
				durationInFrames={fps * 8}
				fps={fps}
				width={1920}
				height={1080}
				defaultProps={defaultProps}
			/>
			<Composition
				id="MediaflowCommentsPortrait"
				component={CommentsVideo}
				durationInFrames={fps * 8}
				fps={fps}
				width={1080}
				height={1920}
				defaultProps={{ ...defaultProps, orientation: 'portrait' }}
			/>
		</>
	)
}
