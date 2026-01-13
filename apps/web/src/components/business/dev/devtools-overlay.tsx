'use client'

import * as React from 'react'

const LazyTanStackDevtools = React.lazy(async () => {
	const mod = await import('@tanstack/react-devtools')
	return { default: mod.TanStackDevtools }
})

const LazyRouterDevtoolsPanel = React.lazy(async () => {
	const mod = await import('@tanstack/react-router-devtools')
	return { default: mod.TanStackRouterDevtoolsPanel }
})

const LazyReactQueryDevtoolsPanel = React.lazy(async () => {
	const mod = await import('@tanstack/react-query-devtools')
	return { default: mod.ReactQueryDevtoolsPanel }
})

export function DevtoolsOverlay() {
	if (!import.meta.env.DEV) return null

	return (
		<LazyTanStackDevtools
			config={{ position: 'bottom-right' }}
			plugins={[
				{
					name: 'Tanstack Router',
					render: <LazyRouterDevtoolsPanel />,
				},
				{
					name: 'Tanstack Query',
					render: <LazyReactQueryDevtoolsPanel />,
				},
			]}
		/>
	)
}

