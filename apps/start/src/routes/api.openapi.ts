import { OpenAPIGenerator } from '@orpc/openapi'
import { createFileRoute } from '@tanstack/react-router'

import { appRouter } from '~/orpc/router'

const generator = new OpenAPIGenerator()

export const Route = createFileRoute('/api/openapi')({
	server: {
		handlers: {
			GET: async () => {
				const doc = await generator.generate(appRouter, {
					info: {
						title: 'Vid Genius Hub ORPC API',
						version: '1.0.0',
					},
					servers: [
						{
							url: '/api/orpc',
						},
					],
					filter: ({ path }) => path[0] !== 'admin',
				})

				return new Response(JSON.stringify(doc), {
					status: 200,
					headers: {
						'content-type': 'application/json',
					},
				})
			},
		},
	},
})

