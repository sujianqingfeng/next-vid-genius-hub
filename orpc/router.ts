import { os } from '@orpc/server'
import { downloadComments } from './procedures/comment'
import { download } from './procedures/download'
import { media } from './procedures/media'
import { render } from './procedures/render'
import { subtitle } from './procedures/subtitle'

export const router = os.router({
	download,
	downloadComments,
	media,
	subtitle,
	render,
})

export type AppRouter = typeof router
