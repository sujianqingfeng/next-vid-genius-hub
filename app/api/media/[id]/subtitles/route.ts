import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getDb, schema } from '~/lib/db'
export const runtime = 'nodejs'
import { logger } from '~/lib/logger'

// Internal VTT provider for cloud rendering pipeline
// Note: UI 下载已移除，但云端 burner 仍需要拉取 VTT 文本
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const db = await getDb()
    const { id: mediaId } = await context.params

    const media = await db.query.media.findFirst({
      where: eq(schema.media.id, mediaId),
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    if (!media.translation) {
      return NextResponse.json(
        { error: 'Subtitles not found' },
        { status: 404 },
      )
    }

    // Convert the translation text to VTT format
    const vttContent = `WEBVTT\n\n${media.translation}`

    return new NextResponse(vttContent, {
      headers: {
        'Content-Type': 'text/vtt',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    logger.error('api', `Error serving subtitles: ${error instanceof Error ? error.message : String(error)}`)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
