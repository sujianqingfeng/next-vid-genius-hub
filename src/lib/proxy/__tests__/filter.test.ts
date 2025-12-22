import { describe, expect, it } from 'vitest'
import { filterOutIpv6Proxies } from '../filter'

describe('proxy filters', () => {
	it('filters out IPv6 literal servers', () => {
		const input = [
			{
				id: '1',
				server: '1.2.3.4',
				port: 443,
				protocol: 'https' as const,
			},
			{
				id: '2',
				server: '2606:4700:4700::1111',
				port: 443,
				protocol: 'https' as const,
			},
			{
				id: '3',
				server: '[2606:4700:4700::1111]',
				port: 443,
				protocol: 'https' as const,
			},
			{
				id: '4',
				server: 'example.com',
				port: 443,
				protocol: 'https' as const,
			},
		] satisfies Parameters<typeof filterOutIpv6Proxies>[0]

		const { proxies, filteredIpv6Count } = filterOutIpv6Proxies(input)

		expect(filteredIpv6Count).toBe(2)
		expect(proxies.map((p) => p.id)).toEqual(['1', '4'])
	})
})
