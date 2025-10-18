export function signHmacSHA256(secret: string, payload: string): string
export function verifyHmacSHA256(secret: string, payload: string, signature: string): boolean

export interface MakeStatusCallbackOptions {
  callbackUrl: string
  secret: string
  fetchImpl?: typeof fetch
  logger?: Console
  maxAttempts?: number
  backoffMs?: number
  baseFields?: Record<string, unknown>
}

export function makeStatusCallback(opts: MakeStatusCallbackOptions): (status: string, extra?: Record<string, unknown>) => Promise<void>

export function postSignedJson(
  url: string,
  secret: string,
  body: Record<string, unknown>,
  opts?: { fetchImpl?: typeof fetch; headers?: Record<string, string>; logger?: Console },
): Promise<Response>

export function buildSignedBody(secret: string, body: object): { payload: string; signature: string; ts: number }
