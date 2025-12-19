import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import path from 'node:path'

function normalizeBasePath(input: string): string {
	const raw = input.trim() || '/'
	if (raw === '/') return '/'
	const withLeading = raw.startsWith('/') ? raw : `/${raw}`
	return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
}

const config = defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '')
	// Gray rollout: serve Start under /__start/* by default.
	// Override at build time via VITE_BASEPATH (e.g. "/__start").
	const base = normalizeBasePath(env.VITE_BASEPATH ?? '/__start')
	const repoRoot = path.resolve(__dirname, '../..')
	const apiTarget = env.VITE_NEXT_API_ORIGIN || 'http://localhost:3000'

	return {
		base,
		optimizeDeps: {
			// TanStack Start provides virtual entry modules via the Vite plugin.
			// Pre-bundling @tanstack/start-server-core in dev can fail because it
			// contains dynamic imports like `import('#tanstack-start-entry')`.
			exclude: ['@tanstack/start-server-core'],
		},
		ssr: {
			optimizeDeps: {
				exclude: ['@tanstack/start-server-core'],
			},
		},
		resolve: {
			alias: [{ find: /^~\//, replacement: `${repoRoot}/` }],
		},
		server: {
			fs: {
				allow: [repoRoot],
			},
			proxy: {
				'/api': {
					target: apiTarget,
					changeOrigin: true,
				},
				// Let Start navigate to legacy Next pages during the migration (local dev only).
				'/media': {
					target: apiTarget,
					changeOrigin: true,
				},
			},
		},
		plugins: [
			// Disable the devtools server event bus (defaults to port 42069) to avoid
			// conflicts with other running dev servers/processes.
			devtools({ eventBusConfig: { enabled: false } }),
			cloudflare({ viteEnvironment: { name: 'ssr' } }),
			// this is the plugin that enables path aliases
			viteTsConfigPaths({
				projects: ['./tsconfig.json'],
			}),
			tailwindcss(),
			tanstackStart(),
			viteReact(),
		],
	}
})

export default config
