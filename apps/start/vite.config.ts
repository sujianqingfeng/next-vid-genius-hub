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
	const fileEnv = loadEnv(mode, process.cwd(), '')
	// `loadEnv` only reads .env files. Merge with `process.env` so values injected
	// from npm scripts (e.g. `VITE_BASEPATH=/ ...`) are honored.
	const env = { ...fileEnv, ...process.env } as Record<string, string | undefined>
	// Default dev/build basepath for gray rollout. Root cutover uses `vite.root.config.ts`.
	const base = normalizeBasePath('/__start')
	const repoRoot = path.resolve(__dirname, '../..')
	const enableLegacyProxy = env.VITE_PROXY_NEXT === '1'
	const legacyTarget = env.VITE_NEXT_API_ORIGIN || 'http://localhost:3000'

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
			alias: [
				{ find: /^~\//, replacement: `${repoRoot}/` },
				{
					find: '@paralleldrive/cuid2',
					replacement: path.resolve(__dirname, './src/shims/cuid2.ts'),
				},
			],
			dedupe: ['react', 'react-dom', '@tanstack/react-query'],
		},
		build: {
			rollupOptions: {
				output: {
					// Avoid extremely long filenames on macOS/Windows when TanStack Start
					// generates virtual chunks (e.g. _tanstack-start-manifest_*).
					chunkFileNames: 'assets/[hash].js',
					assetFileNames: 'assets/[hash][extname]',
				},
			},
		},
		server: {
			fs: {
				allow: [repoRoot],
			},
			...(enableLegacyProxy
				? {
						proxy: {
							'/api': {
								target: legacyTarget,
								changeOrigin: true,
							},
							// Let Start navigate to legacy Next pages during migration (local dev only).
							'/media': {
								target: legacyTarget,
								changeOrigin: true,
							},
						},
					}
				: {}),
		},
			plugins: [
				// Disable the devtools server event bus (defaults to port 42069) to avoid
				// conflicts with other running dev servers/processes.
				devtools({ eventBusConfig: { enabled: false } }),
				cloudflare({
					configPath: 'wrangler.vite.jsonc',
					viteEnvironment: { name: 'ssr' },
				}),
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
