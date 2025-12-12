'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'
import { TooltipProvider } from '~/components/ui/tooltip'
import { ConfirmDialogProvider } from '~/components/business/layout/confirm-dialog-provider'

export function Providers({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 60 * 1000, // 1 minute
						retry: 0,
					},
					mutations: {
						retry: 0,
					},
				},
			}),
	)

	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			disableTransitionOnChange
		>
			<QueryClientProvider client={queryClient}>
				<TooltipProvider delayDuration={300}>
					<ConfirmDialogProvider>{children}</ConfirmDialogProvider>
				</TooltipProvider>
			</QueryClientProvider>
		</ThemeProvider>
	)
}
