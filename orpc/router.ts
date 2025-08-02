import { os } from '@orpc/server'
import { download } from './procedures/download'
import { media } from './procedures/media'
import { transcribe } from './procedures/transcribe'

export const router = os.router({
	download,
	media,
	transcribe,
})

export type AppRouter = typeof router
