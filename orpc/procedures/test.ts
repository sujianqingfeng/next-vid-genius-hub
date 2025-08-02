import { os } from '@orpc/server'
import { z } from 'zod'

export const test = os
	.input(
		z.object({
			name: z.string(),
		}),
	)
	.handler(({ input }) => {
		return `سلامت, ${input.name}!`
	})
