import { QueryClient } from '@tanstack/react-query'

export function getServerQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 60 * 1000,
				retry: 1,
			},
			mutations: {
				retry: 1,
			},
		},
	})
}
