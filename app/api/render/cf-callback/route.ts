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
      // 快速落地：不再将产物下载到 Next 本地，改为记录远端对象标识
      // 使用“remote:orchestrator:<jobId>”作为路径占位符，由 /api/media/[id]/rendered 代理 Worker 读取
      await db
        .update(schema.media)
        .set({ videoWithSubtitlesPath: `remote:orchestrator:${payload.jobId}` })
        .where(eq(schema.media.id, media.id))
      console.log('[cf-callback] recorded remote artifact for job', payload.jobId)
    }

    // In all cases, acknowledge
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[cf-callback] error', e)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
