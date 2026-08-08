import { ensureBrowser } from '@remotion/renderer'

const status = await ensureBrowser()

if (status.type === 'no-browser' || status.type === 'version-mismatch') {
	throw new Error(`Remotion browser is unavailable: ${status.type}`)
}

console.log(`[mediaflow] Remotion browser ready: ${status.path}`)
