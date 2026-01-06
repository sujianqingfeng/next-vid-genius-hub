import { defineConfig } from 'drizzle-kit'

// Local sqlite database used by Drizzle CLI for schema generation / studio.
// This no longer depends on an environment variable to keep tooling simple.
const LOCAL_SQLITE_URL = 'file:./local.db'

export default defineConfig({
	schema: './src/lib/infra/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	dbCredentials: {
		url: LOCAL_SQLITE_URL,
	},
	verbose: true,
	strict: true,
})
