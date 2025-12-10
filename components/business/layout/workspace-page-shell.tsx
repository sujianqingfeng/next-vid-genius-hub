import type React from 'react'

interface WorkspacePageShellProps {
	header: React.ReactNode
	children: React.ReactNode
}

export function WorkspacePageShell({
	header,
	children,
}: WorkspacePageShellProps) {
	return (
		<div className="flex min-h-full flex-col">
			<div className="bg-card/50 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/50">
				{header}
			</div>
			<div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
		</div>
	)
}
