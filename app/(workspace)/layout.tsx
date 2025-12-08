import { WorkspaceAuthGate } from '~/components/auth/workspace-auth-gate'
import { Sidebar } from '~/components/sidebar'

export default function WorkspaceLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<WorkspaceAuthGate>
			<div className="flex h-dvh bg-gradient-to-br from-background to-secondary/50">
				<Sidebar />
				<main className="flex-1 overflow-hidden">
					<div className="h-full overflow-y-auto">{children}</div>
				</main>
			</div>
		</WorkspaceAuthGate>
	)
}
