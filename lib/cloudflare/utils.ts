import { CF_ORCHESTRATOR_URL, JOB_CALLBACK_HMAC_SECRET } from '~/lib/config/app.config'

export function requireOrchestratorUrl(): string {
  if (!CF_ORCHESTRATOR_URL) throw new Error('CF_ORCHESTRATOR_URL is not configured')
  return CF_ORCHESTRATOR_URL
}

export function requireJobCallbackSecret(): string {
  if (!JOB_CALLBACK_HMAC_SECRET) {
    throw new Error('JOB_CALLBACK_HMAC_SECRET is not configured')
  }
  return JOB_CALLBACK_HMAC_SECRET
}
