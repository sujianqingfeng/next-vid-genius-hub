import type { BuildForwardProxyArgs } from './types'

const FORWARD_PROXY_PROTOCOLS = new Set(['http', 'https', 'socks4', 'socks5'])

export function isForwardProxyProtocolSupported(protocol: string): boolean {
  return FORWARD_PROXY_PROTOCOLS.has(String(protocol || '').toLowerCase())
}

export function buildForwardProxyUrl({ protocol, server, port, username, password }: BuildForwardProxyArgs): string {
  const proto = String(protocol || '').toLowerCase()
  if (!server || !port || !isForwardProxyProtocolSupported(proto)) return ''
  let auth = ''
  if (username && password) {
    auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
  }
  return `${proto}://${auth}${server}:${port}`
}

export function resolveForwardProxy({
  proxy,
  defaultProxyUrl,
  logger,
}: {
  proxy?: { protocol: string; server: string; port: number | string; username?: string; password?: string }
  defaultProxyUrl?: string
  logger?: { warn?: (...args: any[]) => any; info?: (...args: any[]) => any; log?: (...args: any[]) => any }
} = {}): string | undefined {
  const log = logger || console
  if (proxy && proxy.server && proxy.port && proxy.protocol) {
    if (!isForwardProxyProtocolSupported(proxy.protocol)) {
      log?.warn?.(
        '[media-core/proxy] Unsupported proxy protocol for direct forwarding; falling back to default proxy.',
        { protocol: proxy.protocol },
      )
    } else {
      log?.log?.('[media-core/proxy] using direct forward proxy', {
        server: proxy.server,
        port: proxy.port,
        protocol: proxy.protocol,
        hasCredentials: Boolean(proxy.username && proxy.password),
      })
      return buildForwardProxyUrl(proxy as any)
    }
  }
  if (defaultProxyUrl) {
    log?.log?.('[media-core/proxy] falling back to defaultProxyUrl')
  }
  return defaultProxyUrl
}

export default {
  isForwardProxyProtocolSupported,
  buildForwardProxyUrl,
  resolveForwardProxy,
}

