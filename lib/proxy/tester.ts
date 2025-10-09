import { fetch, ProxyAgent } from 'undici'
import { Proxy } from '~/lib/db/schema'
import { logger } from '~/lib/logger'

export interface ProxyTestResult {
	id: string
	status: 'success' | 'failed'
	responseTime?: number
	error?: string
}

export async function testProxy(proxy: Proxy): Promise<ProxyTestResult> {
	const startTime = Date.now()
	
	try {
		// Build proxy URL and create ProxyAgent
		const proxyUrl = buildProxyUrl(proxy)
		const proxyAgent = new ProxyAgent(proxyUrl)
		
		// Test with fallback URLs for better reliability
		const testResult = await testWithFallback(proxyAgent)
		
		if (testResult.success) {
			logger.info('proxy', `Proxy test successful for ${proxy.server}:${proxy.port} (${testResult.responseTime}ms)`)
			return {
				id: proxy.id,
				status: 'success',
				responseTime: testResult.responseTime,
			}
		} else {
			throw new Error(testResult.error || 'Proxy test failed')
		}
	} catch (error) {
		const responseTime = Date.now() - startTime
		logger.warn('proxy', `Proxy test failed for ${proxy.server}:${proxy.port} - ${error}`)
		return {
			id: proxy.id,
			status: 'failed',
			responseTime,
			error: error instanceof Error ? error.message : 'Unknown error',
		}
	}
}

export async function testMultipleProxies(proxies: Proxy[]): Promise<ProxyTestResult[]> {
	// Test proxies in parallel with concurrency limit
	const concurrencyLimit = 5
	const results: ProxyTestResult[] = []

	for (let i = 0; i < proxies.length; i += concurrencyLimit) {
		const batch = proxies.slice(i, i + concurrencyLimit)
		const batchResults = await Promise.allSettled(
			batch.map(proxy => testProxy(proxy))
		)

		batchResults.forEach((result) => {
			if (result.status === 'fulfilled') {
				results.push(result.value)
			} else {
				// Handle promise rejection
				const failedProxy = batch[batchResults.indexOf(result)]
				results.push({
					id: failedProxy.id,
					status: 'failed',
					error: 'Test failed to complete',
				})
			}
		})
	}

	return results
}

function buildProxyUrl(proxy: Proxy): string {
	const { protocol, server, port, username, password } = proxy
	
	// Undici supports all proxy protocols
	if (username && password) {
		return `${protocol}://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${server}:${port}`
	} else {
		return `${protocol}://${server}:${port}`
	}
}

// Multiple test URLs for reliability
const TEST_URLS = [
	'https://httpbin.org/ip',
	'https://api.ipify.org?format=json',
	'https://ipinfo.io/json'
]

async function testWithFallback(proxyAgent: ProxyAgent): Promise<{ success: boolean; responseTime: number; error?: string }> {
	const startTime = Date.now()
	
	for (const url of TEST_URLS) {
		try {
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 second timeout per URL

			const response = await fetch(url, {
				dispatcher: proxyAgent,
				signal: controller.signal,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				},
			})

			clearTimeout(timeoutId)

			if (response.ok) {
				const responseTime = Date.now() - startTime
				return { success: true, responseTime }
			}
		} catch {
			// Try next URL
			logger.debug('proxy', `Test URL ${url} failed for proxy, trying next...`)
			continue
		}
	}
	
	const responseTime = Date.now() - startTime
	return { 
		success: false, 
		responseTime, 
		error: 'All test URLs failed' 
	}
}

// Advanced proxy test with connection validation
export async function testProxyConnection(proxy: Proxy): Promise<ProxyTestResult & { 
	anonymousLevel?: 'transparent' | 'anonymous' | 'elite' 
	ipAddress?: string 
}> {
	const startTime = Date.now()
	
	try {
		const proxyUrl = buildProxyUrl(proxy)
		const proxyAgent = new ProxyAgent(proxyUrl)
		
		// Test basic connectivity
		const basicTest = await testWithFallback(proxyAgent)
		if (!basicTest.success) {
			throw new Error(basicTest.error || 'Basic connectivity test failed')
		}
		
		// Test IP address and anonymity level
		const ipTestResult = await testProxyAnonymity(proxyAgent)
		
		logger.info('proxy', `Advanced proxy test successful for ${proxy.server}:${proxy.port} (${basicTest.responseTime}ms)`)
		
		return {
			id: proxy.id,
			status: 'success',
			responseTime: basicTest.responseTime,
			...ipTestResult,
		}
	} catch (error) {
		const responseTime = Date.now() - startTime
		logger.warn('proxy', `Advanced proxy test failed for ${proxy.server}:${proxy.port} - ${error}`)
		return {
			id: proxy.id,
			status: 'failed',
			responseTime,
			error: error instanceof Error ? error.message : 'Unknown error',
		}
	}
}

// Test proxy anonymity and IP information
async function testProxyAnonymity(proxyAgent: ProxyAgent): Promise<{
	anonymousLevel?: 'transparent' | 'anonymous' | 'elite'
	ipAddress?: string
}> {
	try {
		const response = await fetch('https://httpbin.org/ip', {
			dispatcher: proxyAgent,
			signal: AbortSignal.timeout(5000),
		})
		
		if (!response.ok) {
			return {}
		}
		
		const data = await response.json() as { origin: string }
		const ipAddress = data.origin
		
		// Test for proxy headers to determine anonymity level
		const headersResponse = await fetch('https://httpbin.org/headers', {
			dispatcher: proxyAgent,
			signal: AbortSignal.timeout(5000),
		})
		
		if (headersResponse.ok) {
			const headersData = await headersResponse.json() as { headers: Record<string, string> }
			const headers = headersData.headers
			
			// Check for proxy-related headers
			const hasProxyHeaders = [
				'X-Forwarded-For',
				'X-Real-IP', 
				'Via',
				'Proxy-Connection'
			].some(header => headers[header])
			
			let anonymousLevel: 'transparent' | 'anonymous' | 'elite'
			if (hasProxyHeaders) {
				anonymousLevel = 'transparent' // Reveals original IP
			} else if (headers['User-Agent'] && !headers['User-Agent'].includes('proxy')) {
				anonymousLevel = 'anonymous' // Hides IP but identifies as proxy
			} else {
				anonymousLevel = 'elite' // Completely anonymous
			}
			
			return { ipAddress, anonymousLevel }
		}
		
		return { ipAddress }
	} catch (error) {
		logger.debug('proxy', `Anonymity test failed: ${error}`)
		return {}
	}
}

// Test proxy with specific target URL (for testing geo-restrictions)
export async function testProxyWithTarget(
	proxy: Proxy, 
	targetUrl: string
): Promise<ProxyTestResult & { 
	targetAccessible: boolean 
	finalUrl?: string 
}> {
	const startTime = Date.now()
	
	try {
		const proxyUrl = buildProxyUrl(proxy)
		const proxyAgent = new ProxyAgent(proxyUrl)
		
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

		const response = await fetch(targetUrl, {
			dispatcher: proxyAgent,
			signal: controller.signal,
			redirect: 'manual', // Don't follow redirects automatically
		})

		clearTimeout(timeoutId)
		
		const responseTime = Date.now() - startTime
		const targetAccessible = response.status < 400
		
		logger.info('proxy', `Target test for ${targetUrl} via ${proxy.server}:${proxy.port}: ${targetAccessible ? 'SUCCESS' : 'FAILED'} (${responseTime}ms)`)
		
		return {
			id: proxy.id,
			status: targetAccessible ? 'success' : 'failed',
			responseTime,
			targetAccessible,
			finalUrl: response.headers.get('location') || undefined,
		}
	} catch (error) {
		const responseTime = Date.now() - startTime
		logger.warn('proxy', `Target test failed for ${proxy.server}:${proxy.port} - ${error}`)
		return {
			id: proxy.id,
			status: 'failed',
			responseTime,
			error: error instanceof Error ? error.message : 'Unknown error',
			targetAccessible: false,
		}
	}
}
