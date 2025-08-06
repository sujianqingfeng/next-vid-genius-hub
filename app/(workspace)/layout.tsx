import { Sidebar } from '~/components/sidebar'

export default function WorkspaceLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<div className="flex h-screen bg-background">
			<Sidebar />
			<main className="flex-1 overflow-hidden">
				<div className="h-full overflow-y-auto">{children}</div>
			</main>
		</div>
	)
}
