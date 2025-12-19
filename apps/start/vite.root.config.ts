import { defineConfig } from 'vite'

import baseConfig from './vite.config'

export default defineConfig(async (env) => {
	const cfg = typeof baseConfig === 'function' ? await baseConfig(env) : baseConfig

	return {
		...cfg,
		base: '/',
	}
})

