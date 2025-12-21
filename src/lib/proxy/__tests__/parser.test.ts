import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseSSRSubscription } from '../parser'

function buildSSRLink({
	server,
	port,
	protocol,
	password,
	remarks,
}: {
	server: string
	port: number
	protocol: string
	password: string
	remarks?: string
}): string {
	const passwordBase64 = Buffer.from(password).toString('base64')
	const remarksBase64 = remarks
		? Buffer.from(remarks).toString('base64')
		: undefined
	const payload = `${server}:${port}:${protocol}:auth_aes128_md5:plain:${passwordBase64}/?${remarksBase64 ? `remarks=${remarksBase64}` : ''}`
	const encodedPayload = Buffer.from(payload).toString('base64')
	return `ssr://${encodedPayload}`
}

const TROJAN_NODE =
	'trojan://1d9ea67e-d583-49aa-81ce-ec66b3f81ba6@123.interld123456789.com:443?allowInsecure=0&peer=w6yGF03BpeOA.us1234567891.xyz&sni=w6yGF03BpeOA.us1234567891.xyz&type=ws&fragment=1%2C40-60%2C30-50&path=%2Fmusic#trojan-%E7%BE%8E%E5%9B%BD'
const VLESS_NODE =
	'vless://1d9ea67e-d583-49aa-81ce-ec66b3f81ba6@152.53.231.109:56701?type=tcp&encryption=none&host=&path=&headerType=none&quicSecurity=none&serviceName=&security=reality&flow=xtls-rprx-vision&fp=chrome&sni=&pbk=DnGnJ_DkIUvESgNvgdxI8ehjHpO-QJmwiNOoFHw2vi0&sid=cb4a585e#%E4%B8%80%E5%85%83%E7%99%BEG'
const HYSTERIA_NODE =
	'hysteria2://1d9ea67e-d583-49aa-81ce-ec66b3f81ba6@152.53.231.109:56701?type=tcp&encryption=none&host=&path=&headerType=none&quicSecurity=none&serviceName=&security=reality&flow=xtls-rprx-vision&fp=firefox&sni=addons.mozilla.org&pbk=sW8BfHeovVzmbFuAnr9nH8oJaKYze6shKoKMdek5ai8&sid=792147b8#%E5%BE%B7%E5%9B%BD'

function encodeSubscription(...nodes: string[]): string {
	return Buffer.from(nodes.join('\n'), 'utf-8').toString('base64')
}

const CLASH_SUBSCRIPTION = `
port: 7890
socks-port: 7891
proxies:
  - {name: "Traffic: 118.23 GB / 200 GB", server: west.example.com, port: 20002, type: trojan, password: WEST-PASS-20002, sni: cos.example.com, skip-cert-verify: true, udp: true}
  - name: 🇭🇰 Hong Kong | 01
    server: hk.example.com
    port: 20003
    type: trojan
    password: HK-PASS-20003
    udp: true
  - name: VLESS WS TLS | 01
    server: vless.example.com
    port: 443
    type: vless
    uuid: 1d9ea67e-d583-49aa-81ce-ec66b3f81ba6
    udp: true
    tls: true
    servername: sni.example.com
    network: ws
    skip-cert-verify: true
    ws-opts:
      path: /ws
      headers:
        Host: host.example.com
  - name: VLESS IPv6 WS TLS | 02
    server: 2606:4700:4400::4968:6c8e
    port: 443
    type: vless
    uuid: fef41949-89d1-441e-ae16-153c62697ef5
    tls: true
    servername: cfv.temp-drop-files.store
    network: ws
    ws-opts:
      path: "/?ed=2048"
      headers:
        Host: cfv.temp-drop-files.store
proxy-groups:
  - name: Auto Select
    type: url-test
    proxies:
      - 🇭🇰 Hong Kong | 01
`.trim()

describe('parseSSRSubscription', () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('parses base64-encoded subscription content', async () => {
		const ssrLink = buildSSRLink({
			server: 'example.com',
			port: 443,
			protocol: 'origin',
			password: 'super-secret',
			remarks: 'Test node',
		})
		const subscriptionContent = Buffer.from(`${ssrLink}\n`).toString('base64')

		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			statusText: 'OK',
			text: async () => subscriptionContent,
		})

		vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch)

		const result = await parseSSRSubscription('https://subscription.test/ssr')

		expect(mockFetch).toHaveBeenCalledWith('https://subscription.test/ssr')
		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({
			server: 'example.com',
			port: 443,
			protocol: 'socks5',
			password: 'super-secret',
		})
		expect(result[0].nodeUrl).toBe(ssrLink)
	})

	it('parses plain-text subscription content', async () => {
		const ssrLink = buildSSRLink({
			server: 'plain.example',
			port: 8443,
			protocol: 'auth_sha1_v4',
			password: 'plain-pass',
		})

		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			statusText: 'OK',
			text: async () => `${ssrLink}\n`,
		})

		vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch)

		const result = await parseSSRSubscription('https://subscription.test/plain')

		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({
			server: 'plain.example',
			port: 8443,
			protocol: 'socks5',
			password: 'plain-pass',
		})
	})

	it('parses base64 subscription containing trojan, vless, and hysteria nodes', async () => {
		const subscriptionContent = encodeSubscription(
			TROJAN_NODE,
			VLESS_NODE,
			HYSTERIA_NODE,
		)
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			statusText: 'OK',
			text: async () => subscriptionContent,
		})

		vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch)

		const result = await parseSSRSubscription('https://subscription.test/mixed')

		expect(result).toHaveLength(3)

		const trojan = result.find((proxy) => proxy.protocol === 'trojan')
		expect(trojan).toBeDefined()
		expect(trojan).toMatchObject({
			server: '123.interld123456789.com',
			port: 443,
			password: '1d9ea67e-d583-49aa-81ce-ec66b3f81ba6',
		})
		expect(trojan?.nodeUrl).toBe(TROJAN_NODE)

		const vless = result.find((proxy) => proxy.protocol === 'vless')
		expect(vless).toBeDefined()
		expect(vless).toMatchObject({
			server: '152.53.231.109',
			port: 56701,
			username: '1d9ea67e-d583-49aa-81ce-ec66b3f81ba6',
		})

		const hysteria = result.find((proxy) => proxy.protocol === 'hysteria2')
		expect(hysteria).toBeDefined()
		expect(hysteria).toMatchObject({
			server: '152.53.231.109',
			port: 56701,
			username: '1d9ea67e-d583-49aa-81ce-ec66b3f81ba6',
		})
		expect(hysteria?.nodeUrl).toBe(HYSTERIA_NODE)
	})

	it('parses Clash/WestData style YAML subscriptions', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			statusText: 'OK',
			text: async () => CLASH_SUBSCRIPTION,
		})

		vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch)

		const result = await parseSSRSubscription('https://subscription.test/clash')

		expect(result).toHaveLength(4)

		const firstNode = result[0]
		expect(firstNode).toMatchObject({
			name: 'Traffic: 118.23 GB / 200 GB',
			server: 'west.example.com',
			port: 20002,
			protocol: 'trojan',
			password: 'WEST-PASS-20002',
		})

		const secondNode = result[1]
		expect(secondNode).toMatchObject({
			name: '🇭🇰 Hong Kong | 01',
			server: 'hk.example.com',
			port: 20003,
			protocol: 'trojan',
			password: 'HK-PASS-20003',
		})

		const vless = result.find((proxy) => proxy.protocol === 'vless')
		expect(vless).toBeDefined()
		expect(vless).toMatchObject({
			name: 'VLESS WS TLS | 01',
			server: 'vless.example.com',
			port: 443,
			protocol: 'vless',
			username: '1d9ea67e-d583-49aa-81ce-ec66b3f81ba6',
		})
		expect(vless?.nodeUrl).toContain('vless://')
		expect(vless?.nodeUrl).toContain('@vless.example.com:443')
		expect(vless?.nodeUrl).toContain('type=ws')
		expect(vless?.nodeUrl).toContain('security=tls')
		expect(vless?.nodeUrl).toContain('host=host.example.com')
		expect(vless?.nodeUrl).toContain('path=%2Fws')

		const vlessIpv6 = result.find((proxy) =>
			proxy.name?.includes('IPv6'),
		)
		expect(vlessIpv6).toBeDefined()
		expect(vlessIpv6).toMatchObject({
			server: '2606:4700:4400::4968:6c8e',
			port: 443,
			protocol: 'vless',
			username: 'fef41949-89d1-441e-ae16-153c62697ef5',
		})
		expect(vlessIpv6?.nodeUrl).toContain(
			'@[2606:4700:4400::4968:6c8e]:443',
		)
		expect(vlessIpv6?.nodeUrl).toContain('type=ws')
		expect(vlessIpv6?.nodeUrl).toContain('security=tls')
		expect(vlessIpv6?.nodeUrl).toContain('host=cfv.temp-drop-files.store')
		expect(vlessIpv6?.nodeUrl).toContain('path=%2F%3Fed%3D2048')
	})
})
