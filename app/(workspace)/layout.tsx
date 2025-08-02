import { Sidebar } from '~/components/sidebar'

export default function WorkspaceLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<div className="flex h-screen">
			<Sidebar />
			<main className="flex-1 overflow-y-auto bg-background">{children}</main>
		</div>
	)
}
