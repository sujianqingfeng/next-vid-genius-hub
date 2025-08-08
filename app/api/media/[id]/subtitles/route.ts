import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '~/lib/db'

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

		if (!media.translation) {
			return NextResponse.json(
				{ error: 'Subtitles not found' },
				{ status: 404 },
			)
		}

		// Convert the translation text to VTT format
		const vttContent = `WEBVTT

${media.translation}`

		// Return the VTT file with appropriate headers; allow inline view by default, force download with ?download=1
		const download = request.nextUrl.searchParams.get('download') === '1'
		return new NextResponse(vttContent, {
			headers: {
				'Content-Type': 'text/vtt',
				...(download
					? {
							'Content-Disposition': `attachment; filename="${(media.title || 'subtitles').replace(/\s+/g, '_')}.vtt"`,
						}
					: {}),
				'Cache-Control': 'public, max-age=3600',
			},
		})
	} catch (error) {
		console.error('Error serving subtitles:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 },
		)
	}
}
