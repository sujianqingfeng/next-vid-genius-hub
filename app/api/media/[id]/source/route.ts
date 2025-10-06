import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
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

		if (!media.filePath) {
			return NextResponse.json({ error: 'Source video not found' }, { status: 404 })
		}

		const stats = await stat(media.filePath)
		const fileSize = stats.size
		const lastModified = stats.mtime.toUTCString()
		const etag = `W/"${fileSize}-${Math.floor(stats.mtimeMs)}"`

		const ifNoneMatch = request.headers.get('if-none-match')
		const ifModifiedSince = request.headers.get('if-modified-since')
		const isNotModified =
			(ifNoneMatch && ifNoneMatch === etag) ||
			(ifModifiedSince &&
				!Number.isNaN(Date.parse(ifModifiedSince)) &&
				new Date(ifModifiedSince).getTime() >= stats.mtime.getTime())
		if (isNotModified) {
			return new NextResponse(null, {
				status: 304,
				headers: {
					ETag: etag,
					'Last-Modified': lastModified,
					'Cache-Control': 'public, max-age=600',
				},
			})
		}

		const baseHeaders = {
			'Content-Type': 'video/mp4',
			'Accept-Ranges': 'bytes',
			'Cache-Control': 'public, max-age=600',
			ETag: etag,
			'Last-Modified': lastModified,
		} as const

		const range = request.headers.get('range')
		if (range) {
			const match = range.match(/bytes=(\d*)-(\d*)/)
			if (!match) {
				return NextResponse.json({ error: 'Invalid Range' }, { status: 400 })
			}

			let start: number
			let end: number
			const startStr = match[1]
			const endStr = match[2]

			if (startStr === '' && endStr !== '') {
				const suffixLength = parseInt(endStr, 10)
				if (Number.isNaN(suffixLength) || suffixLength <= 0) {
					return NextResponse.json({ error: 'Invalid Range' }, { status: 400 })
				}
				start = Math.max(fileSize - suffixLength, 0)
				end = fileSize - 1
			} else {
				start = parseInt(startStr, 10)
				end = endStr ? parseInt(endStr, 10) : fileSize - 1
			}

			if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < 0) {
				return NextResponse.json({ error: 'Invalid Range' }, { status: 400 })
			}

			if (start >= fileSize) {
				return new NextResponse(null, {
					status: 416,
					headers: {
						...baseHeaders,
						'Content-Range': `bytes */${fileSize}`,
					},
				})
			}

			if (end >= fileSize) end = fileSize - 1
			if (end < start) {
				return new NextResponse(null, {
					status: 416,
					headers: {
						...baseHeaders,
						'Content-Range': `bytes */${fileSize}`,
					},
				})
			}

			const chunkSize = end - start + 1
			const stream = createReadStream(media.filePath, { start, end })

			return new NextResponse(stream as unknown as ReadableStream, {
				status: 206,
				headers: {
					...baseHeaders,
					'Content-Range': `bytes ${start}-${end}/${fileSize}`,
					'Content-Length': chunkSize.toString(),
				},
			})
		}

		const stream = createReadStream(media.filePath)
		return new NextResponse(stream as unknown as ReadableStream, {
			headers: {
				...baseHeaders,
				'Content-Length': fileSize.toString(),
			},
		})
	} catch (error) {
		console.error('Error serving source video:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 },
		)
	}
}
