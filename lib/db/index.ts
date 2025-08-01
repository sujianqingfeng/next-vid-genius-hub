import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { DATABASE_URL } from '../constants'
import * as schema from './schema'

if (!DATABASE_URL) {
	throw new Error('DATABASE_URL is missing')
}

const client = createClient({
	url: DATABASE_URL,
})

const db = drizzle(client, { schema })

export { schema, db }
