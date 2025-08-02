export default function SettingsPage() {
	return (
		<div className="p-8">
			<h1 className="text-3xl font-bold mb-6">Settings</h1>
			<div className="space-y-6">
				<div className="rounded-lg border bg-card p-6">
					<h3 className="text-lg font-semibold mb-4">General Settings</h3>
					<p className="text-muted-foreground">Configure your application preferences</p>
				</div>
				<div className="rounded-lg border bg-card p-6">
					<h3 className="text-lg font-semibold mb-4">Download Settings</h3>
					<p className="text-muted-foreground">Manage your download preferences</p>
				</div>
			</div>
		</div>
	)
}
