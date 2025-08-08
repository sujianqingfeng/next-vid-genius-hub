'use client'
import { type DehydratedState, HydrationBoundary } from '@tanstack/react-query'

export function HydrateClient({
	state,
	children,
}: {
	state: DehydratedState
	children: React.ReactNode
}) {
	return <HydrationBoundary state={state}>{children}</HydrationBoundary>
}
