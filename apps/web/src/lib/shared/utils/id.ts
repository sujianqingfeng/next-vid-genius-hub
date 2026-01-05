function bytesToBase64Url(bytes: Uint8Array): string {
	const bufferCtor = (globalThis as unknown as { Buffer?: any }).Buffer
	if (bufferCtor?.from) {
		return bufferCtor
			.from(bytes)
			.toString('base64')
			.replaceAll('+', '-')
			.replaceAll('/', '_')
			.replaceAll('=', '')
	}

	// Browser/Worker fallback
	let binary = ''
	for (const b of bytes) binary += String.fromCharCode(b)
	// oxlint-disable-next-line typescript/no-explicit-any: btoa is a browser/worker global
	const base64 = (globalThis as any).btoa(binary) as string
	return base64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function createId() {
	const g = globalThis as unknown as { crypto?: Crypto }
	if (g.crypto?.randomUUID) return g.crypto.randomUUID()

	if (g.crypto?.getRandomValues) {
		const bytes = new Uint8Array(16)
		g.crypto.getRandomValues(bytes)
		return bytesToBase64Url(bytes)
	}

	// Last-resort fallback (should not happen in modern Node/Workers)
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}
