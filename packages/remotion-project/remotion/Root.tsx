import { Composition } from 'remotion'
import { REMOTION_FPS } from '@app/media-comments'
import { CommentsVideo } from './CommentsVideo'
import { CommentsVideoVertical } from './CommentsVideoVertical'
import { ThreadForumVideo } from './ThreadForumVideo'
import type { CommentVideoInputProps, ThreadVideoInputProps } from './types'

const fps = REMOTION_FPS
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

  const defaultThreadProps: ThreadVideoInputProps = {
    thread: { title: 'Thread Title', source: 'x', sourceUrl: null },
    root: {
      id: 'root',
      author: { name: 'Author', handle: '@author', avatarAssetId: null },
      contentBlocks: [{ id: 'text-0', type: 'text', data: { text: 'Root post…' } }],
      plainText: 'Root post…',
      createdAt: null,
      metrics: { likes: 0 },
    },
    replies: [
      {
        id: 'r1',
        author: { name: 'ReplyUser', handle: '@reply', avatarAssetId: null },
        contentBlocks: [{ id: 'text-0', type: 'text', data: { text: 'First reply' } }],
        plainText: 'First reply',
        createdAt: null,
        metrics: { likes: 3 },
      },
    ],
    coverDurationInFrames: fps * 3,
    replyDurationsInFrames: [fps * 3],
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
      <Composition
        id="CommentsVideoVertical"
        component={CommentsVideoVertical}
        durationInFrames={fps * 5}
        fps={fps}
        width={1920}
        height={1080}
        defaultProps={defaultProps}
      />
      <Composition
        id="ThreadForumVideo"
        component={ThreadForumVideo}
        durationInFrames={fps * 5}
        fps={fps}
        width={width}
        height={height}
        defaultProps={defaultThreadProps}
      />
    </>
  )
}
