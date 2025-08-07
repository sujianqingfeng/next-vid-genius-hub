import { eqrdrizzle-orm
import { NextRequest, NextResponsextRequestnext/servernsextRequestnext/servernsextRequestnext/servernsextRequestnext/servernse } from 'next/server'
import { db, schema } from '~/lib/db'

export async function GET(
	request: NextRequest,
	{ params }: { params: { id: string } }
) {
	try {
		const mediaId = params.id

		const media = await db.query.media.findFirst({
			where: eq(schema.media.id, mediaId),
		})

		if (!media) {
			return NextResponse.json({ error: 'Media not found' }, { status: 404 })
		}

		if (!media.translation) {
			return NextResponse.json(
				{ error: 'Subtitles not found' },
				{ status: 404 }
			)
		}

		// Convert the translation text to VTT format
		const vttContent = `WEBVTT

${media.translation}`

		// Return the VTT file with appropriate headers
		return new NextResponse(vttContent, {
			headers: {
				'Content-Type': 'text/vtt',
				'Content-Disposition': `attachment; filename="${media.title || 'subtitles'}.vtt"`,
				'Cache-Control': 'public, max-age=3600',
			},
		})
	} catch (error) {
		console.error('Error serving subtitles:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
}
