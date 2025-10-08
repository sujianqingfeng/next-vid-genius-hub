import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '~/lib/db'

// Provides JSON needed by the Remotion renderer container.
// Shape aligns with lib/media/types: { videoInfo, comments }
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: mediaId } = await context.params

    const media = await db.query.media.findFirst({
      where: eq(schema.media.id, mediaId),
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    if (!media.comments || media.comments.length === 0) {
      return NextResponse.json({ error: 'Comments not found' }, { status: 404 })
    }

    const videoInfo = {
      title: media.title || 'Untitled',
      translatedTitle: media.translatedTitle || undefined,
      viewCount: media.viewCount ?? 0,
      author: media.author || undefined,
      thumbnail: media.thumbnail || undefined,
      series: '外网真实评论',
    }

    const body = JSON.stringify({
      videoInfo,
      comments: media.comments,
    })

    return new NextResponse(body, {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'private, max-age=60',
      },
    })
  } catch (error) {
    console.error('Error serving comments-data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

