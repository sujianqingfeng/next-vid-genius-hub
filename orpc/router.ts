import { os } from '@orpc/server'
import * as comment from './procedures/comment'
import * as download from './procedures/download'
import * as media from './procedures/media'
import * as subtitle from './procedures/subtitle'
import * as proxy from './procedures/proxy'

export const appRouter = os.router({
	comment,
	download,
	media,
	subtitle,
	proxy,
})

export type AppRouter = typeof appRouter
