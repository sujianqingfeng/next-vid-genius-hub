import { OpenAPIGenerator } from '@orpc/openapi'
import { appRouter } from '~/orpc/router'

export const runtime = 'nodejs'

const generator = new OpenAPIGenerator()

export async function GET() {
	const doc = await generator.generate(appRouter, {
		info: {
			title: 'Vid Genius Hub ORPC API',
			version: '1.0.0',
		},
		servers: [
			{
				// Match the oRPC HTTP endpoint prefix
				url: '/api/orpc',
			},
		],
		// Hide admin routers from the public OpenAPI spec
		filter: ({ path }) => path[0] !== 'admin',
	})

	return new Response(JSON.stringify(doc), {
		status: 200,
		headers: {
			'content-type': 'application/json',
		},
	})
}
