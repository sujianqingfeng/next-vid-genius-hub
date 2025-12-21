export type HostKind = 'ipv4' | 'ipv6' | 'domain' | 'unknown'

function stripIpv6Brackets(host: string): string {
	const trimmed = host.trim()
	if (trimmed.startsWith('[') && trimmed.endsWith(']'))
		return trimmed.slice(1, -1)
	return trimmed
}

export function isIpv4(host: string): boolean {
	const value = host.trim()
	if (!value) return false
	const parts = value.split('.')
	if (parts.length !== 4) return false
	for (const part of parts) {
		if (!part || part.length > 3) return false
		if (!/^\d+$/.test(part)) return false
		const n = Number.parseInt(part, 10)
		if (n < 0 || n > 255) return false
	}
	return true
}

export function isIpv6(host: string): boolean {
	const value = stripIpv6Brackets(host).toLowerCase()
	if (!value) return false
	if (!value.includes(':')) return false
	if (!/^[0-9a-f:.]+$/.test(value)) return false
	if (value.includes(':::')) return false

	const doubleColons = value.match(/::/g)?.length ?? 0
	if (doubleColons > 1) return false

	const parts = value.split(':')

	let hasIpv4Tail = false
	const last = parts[parts.length - 1] ?? ''
	if (last.includes('.')) {
		hasIpv4Tail = isIpv4(last)
		if (!hasIpv4Tail) return false
	}

	const hextets = parts.filter((p) => p.length > 0 && !p.includes('.'))
	if (hextets.some((p) => p.length > 4)) return false
	if (hextets.some((p) => !/^[0-9a-f]{1,4}$/.test(p))) return false

	const total = hasIpv4Tail ? hextets.length + 2 : hextets.length
	return value.includes('::') ? total <= 8 : total === 8
}

export function classifyHost(host: string | null | undefined): HostKind {
	const value = (host ?? '').trim()
	if (!value) return 'unknown'
	if (isIpv4(value)) return 'ipv4'
	if (isIpv6(value)) return 'ipv6'
	// If it contains letters/dots and isn't an IP, treat as a domain/hostname.
	if (/^[0-9a-z.-]+$/i.test(value) && value.includes('.')) return 'domain'
	return 'unknown'
}

export function formatHostForDisplay(host: string | null | undefined): string {
	const value = (host ?? '').trim()
	if (!value) return ''
	const kind = classifyHost(value)
	if (kind === 'ipv6') {
		const bare = stripIpv6Brackets(value)
		return `[${bare}]`
	}
	return value
}

export function formatHostPort(
	host: string | null | undefined,
	port: number | string | null | undefined,
): string {
	const h = formatHostForDisplay(host)
	const p = port === null || port === undefined ? '' : String(port)
	if (!h) return p ? `:${p}` : ''
	return p ? `${h}:${p}` : h
}

export function hostKindLabel(kind: HostKind): string | null {
	switch (kind) {
		case 'ipv4':
			return 'IPv4'
		case 'ipv6':
			return 'IPv6'
		case 'domain':
			return 'Domain'
		default:
			return null
	}
}
