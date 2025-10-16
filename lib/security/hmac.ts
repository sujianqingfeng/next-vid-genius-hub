import crypto from 'node:crypto'

export function signHmacSHA256(secret: string, payload: string): string {
  const h = crypto.createHmac('sha256', secret)
  h.update(payload, 'utf8')
  return h.digest('hex')
}

export function verifyHmacSHA256(secret: string, payload: string, signature: string): boolean {
  const expected = signHmacSHA256(secret, payload)
  // timing-safe compare
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(signature, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function buildSignedBody(secret: string, body: object) {
  const ts = Date.now()
  const payload = JSON.stringify({ ...body, ts })
  const signature = signHmacSHA256(secret, payload)
  return { payload, signature, ts }
}
