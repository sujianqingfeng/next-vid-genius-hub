import { os } from '@orpc/server'
import { download } from './procedures/download'
import { media } from './procedures/media'
import { subtitle } from './procedures/subtitle'

export const router = os.router({
	download,
	media,
	subtitle,
})

export type AppRouter = typeof router
