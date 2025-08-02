import { download } from './procedures/download'

export const router = {
	download,
}

export type AppRouter = typeof router
