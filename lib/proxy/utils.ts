import type { schema } from '~/lib/db'

type ProxyRecord = typeof schema.proxies.$inferSelect

export type ProxyJobPayload = {
  id: string
  server: string
  port: number
  protocol: ProxyRecord['protocol']
  username?: string | null
  password?: string | null
  nodeUrl?: string | null
}

export function toProxyJobPayload(proxy: ProxyRecord | null | undefined): ProxyJobPayload | undefined {
  if (!proxy) return undefined
  if (!proxy.server || !proxy.port || !proxy.protocol) return undefined

  return {
    id: proxy.id,
    server: proxy.server,
    port: proxy.port,
    protocol: proxy.protocol,
    username: proxy.username ?? undefined,
    password: proxy.password ?? undefined,
    nodeUrl: proxy.nodeUrl ?? undefined,
  }
}
