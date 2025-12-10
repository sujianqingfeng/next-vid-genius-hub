// Minimal centralized environment-backed config for server-side code.
// 只保留当前代码实际 import 的配置，避免堆积未使用的常量。

// Database
export const DATABASE_URL = process.env.DATABASE_URL || 'file:./local.db'

// Local operations workspace
export const OPERATIONS_DIR = process.env.OPERATIONS_DIR || './operations'

// Outbound proxy used by media jobs / HTTP fetches
export const PROXY_URL = process.env.PROXY_URL

// Cloudflare Workers AI (Whisper) payload size限制
export const CLOUDFLARE_ASR_MAX_UPLOAD_BYTES =
	Number(process.env.CLOUDFLARE_ASR_MAX_UPLOAD_BYTES || '') ||
	4 * 1024 * 1024 // 4 MiB

// Audio transcoding hints for Cloudflare Whisper
export const ASR_TARGET_BITRATES = (process.env.ASR_TARGET_BITRATES || '48,24')
	.split(',')
	.map((s) => Number(s.trim()))
	.filter((n) => Number.isFinite(n) && n > 0) as number[]

export const ASR_SAMPLE_RATE = Number(process.env.ASR_SAMPLE_RATE || 16_000)

// Cloud orchestrator + callback integration
export const CF_ORCHESTRATOR_URL = process.env.CF_ORCHESTRATOR_URL

export const JOB_CALLBACK_HMAC_SECRET = process.env.JOB_CALLBACK_HMAC_SECRET
