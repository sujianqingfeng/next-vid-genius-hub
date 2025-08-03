import { os } from '@orpc/server'
import { download } from './procedures/download'
import { media } from './procedures/media'
import { render } from './procedures/render'
import { subtitle } from './procedures/subtitle'

export const router = os.router({
	download,
	media,
	subtitle,
	render,
})

export type AppRouter = typeof router
