import { createFileRoute } from '@tanstack/react-router'

import type { OrpcRequestEnv } from '~/lib/orpc/server/handler'
import { handleOrpcRequest } from '~/lib/orpc/server/handler'

export const Route = createFileRoute('/api/orpc/$')({
	server: {
		handlers: {
			GET: ({ request, context }) =>
				handleOrpcRequest(
					request,
					(context as any)?.env as OrpcRequestEnv | undefined,
				),
			POST: ({ request, context }) =>
				handleOrpcRequest(
					request,
					(context as any)?.env as OrpcRequestEnv | undefined,
				),
			PUT: ({ request, context }) =>
				handleOrpcRequest(
					request,
					(context as any)?.env as OrpcRequestEnv | undefined,
				),
			PATCH: ({ request, context }) =>
				handleOrpcRequest(
					request,
					(context as any)?.env as OrpcRequestEnv | undefined,
				),
			DELETE: ({ request, context }) =>
				handleOrpcRequest(
					request,
					(context as any)?.env as OrpcRequestEnv | undefined,
				),
			HEAD: ({ request, context }) =>
				handleOrpcRequest(
					request,
					(context as any)?.env as OrpcRequestEnv | undefined,
				),
			OPTIONS: ({ request, context }) =>
				handleOrpcRequest(
					request,
					(context as any)?.env as OrpcRequestEnv | undefined,
				),
		},
	},
})
