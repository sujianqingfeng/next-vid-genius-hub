import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { eq } from 'drizzle-orm'

import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '~/lib/db'
import { CF_ORCHESTRATOR_URL } from '~/lib/constants'

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

        if (!media.videoWithSubtitlesPath) {
            return NextResponse.json(
                { error: 'Rendered video not found' },
                { status: 404 },
            )
        }

        // 远端（Worker/R2）路径：remote:orchestrator:<jobId>
        if (media.videoWithSubtitlesPath.startsWith('remote:orchestrator:')) {
            const jobId = media.videoWithSubtitlesPath.split(':').pop()!
            const base = (CF_ORCHESTRATOR_URL || '').replace(/\/$/, '')
            if (!base) {
                return NextResponse.json({ error: 'Orchestrator URL not configured' }, { status: 500 })
            }
            const target = `${base}/artifacts/${encodeURIComponent(jobId)}`
            const range = request.headers.get('range')
            const headers: Record<string, string> = {}
            if (range) headers['range'] = range
            const r = await fetch(target, { headers })
            const respHeaders = new Headers()
            // 透传关键头
            const copy = ['content-type','accept-ranges','content-length','content-range','cache-control','etag','last-modified']
            for (const h of copy) {
                const v = r.headers.get(h)
                if (v) respHeaders.set(h, v)
            }
            if (!respHeaders.has('cache-control')) respHeaders.set('cache-control','private, max-age=60')
            return new NextResponse(r.body as unknown as ReadableStream, { status: r.status, headers: respHeaders })
        }

        // 本地文件路径
        const stats = await stat(media.videoWithSubtitlesPath)
        const fileSize = stats.size
        const lastModified = stats.mtime.toUTCString()
        const etag = `W/"${fileSize}-${Math.floor(stats.mtimeMs)}"`

		// Handle conditional GET
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
					'Cache-Control': 'public, max-age=3600',
				},
			})
		}

		// Common headers builder
		const baseHeaders = {
			'Content-Type': 'video/mp4',
			'Accept-Ranges': 'bytes',
			'Cache-Control': 'public, max-age=3600',
			ETag: etag,
			'Last-Modified': lastModified,
		} as const

		// Check for range request
		const range = request.headers.get('range')
		const download = request.nextUrl.searchParams.get('download') === '1'

		if (range) {
			// Support standard and suffix byte-range
			const match = range.match(/bytes=(\d*)-(\d*)/)
			if (!match) {
				return NextResponse.json({ error: 'Invalid Range' }, { status: 400 })
			}

			let start: number
			let end: number
			const startStr = match[1]
			const endStr = match[2]

			if (startStr === '' && endStr !== '') {
				// suffix range: bytes=-N (last N bytes)
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

			// Validate and clamp
			if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < 0) {
				return NextResponse.json({ error: 'Invalid Range' }, { status: 400 })
			}
			if (start >= fileSize) {
				// Unsatisfiable
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

			const stream = createReadStream(media.videoWithSubtitlesPath, {
				start,
				end,
			})

			return new NextResponse(stream as unknown as ReadableStream, {
				status: 206,
				headers: {
					...baseHeaders,
					'Content-Range': `bytes ${start}-${end}/${fileSize}`,
					'Content-Length': chunkSize.toString(),
					...(download
						? {
								'Content-Disposition': `attachment; filename="${(media.title || 'video').replace(/\s+/g, '_')}.mp4"`,
							}
						: {}),
				},
			})
		}

		// Non-range: stream entire file
		const stream = createReadStream(media.videoWithSubtitlesPath)
		return new NextResponse(stream as unknown as ReadableStream, {
			headers: {
				...baseHeaders,
				'Content-Length': fileSize.toString(),
				...(download
					? {
							'Content-Disposition': `attachment; filename="${(media.title || 'video').replace(/\s+/g, '_')}.mp4"`,
						}
					: {}),
			},
		})
	} catch (error) {
		console.error('Error serving rendered video:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 },
		)
	}
}
