import type { Env } from './types'
import { json } from './utils/http'
import { handleStart } from './handlers/start'
import { handleContainerCallback } from './handlers/callback'
import { handleArtifactDelete, handleArtifactGet, handleUpload } from './handlers/artifacts'
import { handleDebugDelete, handleDebugDeletePrefixes, handleDebugPresign } from './handlers/debug'
import { handleGetStatus } from './handlers/status'

// Re-export container classes so the runtime can locate them by class_name
export { MediaDownloaderContainer, BurnerFfmpegContainer, RendererRemotionContainer } from './containers'
export { RenderJobDO } from './do/RenderJobDO'

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const { pathname } = url
    if (req.method === 'GET' && pathname === '/debug/presign') {
      return handleDebugPresign(env, req)
    }
    if (req.method === 'POST' && pathname === '/debug/delete') {
      return handleDebugDelete(env, req)
    }
    if (req.method === 'POST' && pathname === '/debug/delete-prefixes') {
      return handleDebugDeletePrefixes(env, req)
    }
    // Inputs proxy fallback removed: containers always receive S3 presigned URLs now
    if (req.method === 'POST' && pathname === '/jobs') return handleStart(env, req)
    if (req.method === 'GET' && pathname.startsWith('/jobs/')) {
      const parts = pathname.split('/')
      const jobId = parts[parts.length - 1]
      return handleGetStatus(env, jobId)
    }
    if (req.method === 'POST' && pathname === '/callbacks/container') return handleContainerCallback(env, req)
    if (req.method === 'POST' && pathname.startsWith('/upload/')) {
      const jobId = pathname.split('/').pop()!
      return handleUpload(env, req, jobId)
    }
    if (req.method === 'DELETE' && pathname.startsWith('/artifacts/')) {
      const jobId = pathname.split('/').pop()!
      return handleArtifactDelete(env, jobId)
    }
    if (req.method === 'GET' && pathname.startsWith('/artifacts/')) {
      const jobId = pathname.split('/').pop()!
      return handleArtifactGet(env, req, jobId)
    }
    return json({ error: 'not found' }, { status: 404 })
  },
}
