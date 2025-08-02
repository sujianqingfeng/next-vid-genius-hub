export default function DashboardPage() {
	return (
		<div className="p-8">
			<h1 className="text-3xl font-bold mb-6">Dashboard</h1>
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				<div className="rounded-lg border bg-card p-6">
					<h3 className="text-lg font-semibold mb-2">Total Videos</h3>
					<p className="text-3xl font-bold text-primary">0</p>
				</div>
				<div className="rounded-lg border bg-card p-6">
					<h3 className="text-lg font-semibold mb-2">Downloads</h3>
					<p className="text-3xl font-bold text-primary">0</p>
				</div>
				<div className="rounded-lg border bg-card p-6">
					<h3 className="text-lg font-semibold mb-2">Processing</h3>
					<p className="text-3xl font-bold text-primary">0</p>
				</div>
			</div>
		</div>
	)
}
