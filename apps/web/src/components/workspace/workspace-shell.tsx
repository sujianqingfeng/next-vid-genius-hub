import type React from 'react'

import WorkspaceSidebar from './workspace-sidebar'

export default function WorkspaceShell({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<div className="flex h-dvh bg-gradient-to-br from-background to-secondary/50">
			<WorkspaceSidebar />
			<main className="flex-1 overflow-hidden">
				<div className="h-full overflow-y-auto">{children}</div>
			</main>
		</div>
	)
}
