import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'

import { setInjectedD1Database } from '~/lib/db'
import type { D1Database } from '~/lib/db'

type WorkerEnv = {
	DB?: D1Database
	[key: string]: unknown
}

type WorkerCtx = unknown

const handler = createStartHandler(defaultStreamHandler)

export default {
	async fetch(request: Request, env: WorkerEnv, ctx: WorkerCtx) {
		if (env?.DB) {
			setInjectedD1Database(env.DB)
		}

		return handler(request, { context: { env, ctx } })
	},
}
