import { defineConfig } from 'eslint/config'
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

// Use Next.js official flat config for ESLint 9+
// https://nextjs.org/docs/app/api-reference/config/eslint
const eslintConfig = defineConfig([
	// Next.js + TypeScript + default ignores
	...nextCoreWebVitals,
	// Project-specific overrides
	{
		files: ['**/*.ts', '**/*.tsx'],
		rules: {
			'@typescript-eslint/no-explicit-any': [
				'error',
				{
					ignoreRestArgs: true,
				},
			],
		},
	},
])

export default eslintConfig
