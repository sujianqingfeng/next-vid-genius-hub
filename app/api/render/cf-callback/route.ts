import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, schema } from '~/lib/db'
import { JOB_CALLBACK_HMAC_SECRET, RENDERED_VIDEO_FILENAME } from '~/lib/constants'
import { OPERATIONS_DIR } from '~/lib/config/app.config'
import { verifyHmacSHA256 } from '~/lib/security/hmac'
import { promises as fs } from 'node:fs'
import path from 'node:path'

// Container/Worker → Next: final callback to persist status and output
// Expected body: { jobId, mediaId, status, outputUrl?, outputKey?, durationMs?, attempts?, error? }

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('x-signature') || ''
    const bodyText = await req.text()

    const secret = JOB_CALLBACK_HMAC_SECRET || 'replace-with-strong-secret'
    if (!verifyHmacSHA256(secret, bodyText, signature)) {
      console.error('[cf-callback] invalid signature')
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(bodyText) as {
      jobId: string
      mediaId: string
      status: 'completed' | 'failed' | 'canceled'
      outputUrl?: string
      outputKey?: string
      durationMs?: number
      attempts?: number
      error?: string
    }

    const media = await db.query.media.findFirst({ where: eq(schema.media.id, payload.mediaId) })
    if (!media) {
      console.error('[cf-callback] media not found', payload.mediaId)
      return NextResponse.json({ error: 'media not found' }, { status: 404 })
    }

    if (payload.status === 'completed') {
      // Optional: download artifact locally so existing preview route works unchanged
      if (payload.outputUrl) {
        const opDir = path.join(OPERATIONS_DIR, media.id)
        await fs.mkdir(opDir, { recursive: true })
        const outPath = path.join(opDir, RENDERED_VIDEO_FILENAME)
        const res = await fetch(payload.outputUrl)
        if (!res.ok) {
          console.error('[cf-callback] fetch artifact failed', res.status)
          return NextResponse.json({ error: 'failed to fetch outputUrl' }, { status: 502 })
        }
        const buf = Buffer.from(await res.arrayBuffer())
        await fs.writeFile(outPath, buf)

        await db.update(schema.media).set({ videoWithSubtitlesPath: outPath }).where(eq(schema.media.id, media.id))
        console.log('[cf-callback] saved to', outPath)
      }
    }

    // In all cases, acknowledge
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[cf-callback] error', e)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
