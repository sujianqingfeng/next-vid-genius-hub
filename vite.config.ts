import path from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'

function normalizeBasePath(input: string): string {
	const raw = input.trim() || '/'
	if (raw === '/') return '/'
	const withLeading = raw.startsWith('/') ? raw : `/${raw}`
	return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
}

function externalizeNodeProtocolImports() {
	return {
		name: 'externalize-node-protocol-imports',
		setup(build: any) {
			build.onResolve({ filter: /^node:/ }, (args: any) => {
				return { path: args.path, external: true }
			})
		},
	}
}

const config = defineConfig(({ mode }) => {
	const fileEnv = loadEnv(mode, process.cwd(), '')
	// `loadEnv` only reads .env files. Merge with `process.env` so values injected
	// from npm scripts (e.g. `VITE_BASEPATH=/ ...`) are honored.
	const env = { ...fileEnv, ...process.env } as Record<
		string,
		string | undefined
	>
	// Default dev/build basepath is root. (Optional override via VITE_BASEPATH=/foo)
	const base = normalizeBasePath(env.VITE_BASEPATH || '/')

	return {
		base,
		optimizeDeps: {
			// TanStack Start provides virtual entry modules via the Vite plugin.
			// Pre-bundling @tanstack/start-server-core in dev can fail because it
			// contains dynamic imports like `import('#tanstack-start-entry')`.
			exclude: ['@tanstack/start-server-core'],
			// Some dependencies (e.g. `undici`) reference Node built-ins via the
			// `node:` protocol (like `node:sqlite`). In non-Node targets (Workers),
			// esbuild's prebundle step can incorrectly try to read them as files.
			esbuildOptions: {
				plugins: [externalizeNodeProtocolImports()],
			},
		},
		ssr: {
			optimizeDeps: {
				exclude: ['@tanstack/start-server-core'],
				esbuildOptions: {
					plugins: [externalizeNodeProtocolImports()],
				},
			},
		},
		resolve: {
			alias: [
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
