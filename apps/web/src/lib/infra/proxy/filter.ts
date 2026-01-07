import { classifyHost } from '~/lib/shared/utils/host'
import type { ParsedProxy } from './parser'

export function filterOutIpv6Proxies(input: readonly ParsedProxy[]): {
	proxies: ParsedProxy[]
	filteredIpv6Count: number
} {
	const proxies = input.filter((proxy) => classifyHost(proxy.server) !== 'ipv6')
	return { proxies, filteredIpv6Count: input.length - proxies.length }
}
