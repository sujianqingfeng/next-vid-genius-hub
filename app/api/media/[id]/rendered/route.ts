import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { eq } from 'drizzle-orm'

import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '~/lib/db'

export async function GET(
	request: NextRequest,
	{ params }: { params: { id: string } },
) {
	try {
		const mediaId = params.id

		const media = await db.query.media.findFirst({
			where: eq(schema.media.id, mediaId),
		})

		if (!media) {
			return NextResponse.json({ error: 'Media not found' }, { status: 404 })
		}

		if (!media.videoWithSubtitlesPath) {
			return NextResponse.json(
				{ error: 'Rendered video not found' },
				{ status: 404 },
			)
		}

		// Get file stats
		const stats = await stat(media.videoWithSubtitlesPath)
		const fileSize = stats.size

		// Check for range request
		const range = request.headers.get('range')

		if (range) {
			// Parse range header
			const parts = range.replace(/bytes=/, '').split('-')
			const start = parseInt(parts[0], 10)
			const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
			const chunkSize = end - start + 1

			// Create read stream for the requested range
			const stream = createReadStream(media.videoWithSubtitlesPath, {
				start,
				end,
			})

			// Return partial content response
			return new NextResponse(stream as unknown as ReadableStream, {
				status: 206,
				headers: {
					'Content-Type': 'video/mp4',
					'Content-Range': `bytes ${start}-${end}/${fileSize}`,
					'Content-Length': chunkSize.toString(),
					'Accept-Ranges': 'bytes',
					'Cache-Control': 'public, max-age=3600',
				},
			})
		} else {
			// Return full file for non-range requests
			const videoBuffer = await readFile(media.videoWithSubtitlesPath)

			return new NextResponse(new Uint8Array(videoBuffer), {
				headers: {
					'Content-Type': 'video/mp4',
					'Content-Length': fileSize.toString(),
					'Accept-Ranges': 'bytes',
					'Cache-Control': 'public, max-age=3600',
				},
			})
		}
	} catch (error) {
		console.error('Error serving rendered video:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 },
		)
	}
}
