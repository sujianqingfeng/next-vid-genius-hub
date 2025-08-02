import { download } from './procedures/download'
import { media } from './procedures/media'

export const router = {
	download,
	media,
}

export type AppRouter = typeof router
