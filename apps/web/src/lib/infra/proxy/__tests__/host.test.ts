import { describe, expect, it } from 'vitest'
import {
	classifyHost,
	formatHostForDisplay,
	formatHostPort,
	isIpv4,
	isIpv6,
} from '~/lib/shared/utils/host'

describe('proxy host helpers', () => {
	it('detects ipv4', () => {
		expect(isIpv4('1.2.3.4')).toBe(true)
		expect(classifyHost('1.2.3.4')).toBe('ipv4')
		expect(formatHostPort('1.2.3.4', 443)).toBe('1.2.3.4:443')
	})

	it('detects ipv6 and formats with brackets', () => {
		expect(isIpv6('2606:4700:4700::1111')).toBe(true)
		expect(classifyHost('2606:4700:4700::1111')).toBe('ipv6')
		expect(formatHostForDisplay('2606:4700:4700::1111')).toBe(
			'[2606:4700:4700::1111]',
		)
		expect(formatHostPort('2606:4700:4700::1111', 443)).toBe(
			'[2606:4700:4700::1111]:443',
		)
		expect(classifyHost('[2606:4700:4700::1111]')).toBe('ipv6')
	})

	it('detects domains', () => {
		expect(classifyHost('example.com')).toBe('domain')
		expect(formatHostPort('example.com', 443)).toBe('example.com:443')
	})
})
