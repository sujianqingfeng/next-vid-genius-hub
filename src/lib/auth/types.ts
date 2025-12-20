import type { InferSelectModel } from 'drizzle-orm'
import { pointAccounts, sessions, users } from '~/lib/db/schema'

export type User = InferSelectModel<typeof users>
export type Session = InferSelectModel<typeof sessions>
export type PointAccount = InferSelectModel<typeof pointAccounts>

export type AuthContext = {
	user: User | null
	session: Session | null
}

export type RequestContext = {
	auth: AuthContext
	responseCookies: string[]
}
