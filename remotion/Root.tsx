import { Composition } from 'remotion'
import { CommentsVideo } from './CommentsVideo'
import type { CommentVideoInputProps } from './types'

const fps = 30
const width = 1920
const height = 1080

export const RemotionRoot: React.FC = () => {
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
    </>
  )
}
