import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		environment: 'node',
		globals: true,
		setupFiles: [],
		include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
		exclude: ['node_modules', 'dist', '.next'],
	},
})
