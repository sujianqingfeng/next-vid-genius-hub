import { os } from '@orpc/server'
import { download } from './procedures/download'
import { media } from './procedures/media'
import { transcribe } from './procedures/transcribe'
import { translate } from './procedures/translate'

export const router = os.router({
	download,
	media,
	transcribe,
	translate,
})

export type AppRouter = typeof router
