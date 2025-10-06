import { BarChart3, Download, FileVideo, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

export default function DashboardPage() {
	return (
		<div className="min-h-full bg-background">
			{/* Header Section */}
			<div className="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
				<div className="px-4 py-6">
					<div className="space-y-1">
						<h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
						<p className="text-muted-foreground">
							Welcome to Video Genius. Manage your video content and track your
							progress.
						</p>
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div className="px-4 py-8">
				{/* Stats Grid */}
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
					<Card className="border-border/50 hover:shadow-md transition-shadow">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">
								Total Videos
							</CardTitle>
							<FileVideo className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">0</div>
							<p className="text-xs text-muted-foreground">
								+0% from last month
							</p>
						</CardContent>
					</Card>
					<Card className="border-border/50 hover:shadow-md transition-shadow">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Media Files</CardTitle>
							<Download className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">0</div>
							<p className="text-xs text-muted-foreground">
								+0% from last month
							</p>
						</CardContent>
					</Card>
					<Card className="border-border/50 hover:shadow-md transition-shadow">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Processing</CardTitle>
							<TrendingUp className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">0</div>
							<p className="text-xs text-muted-foreground">Active tasks</p>
						</CardContent>
					</Card>
					<Card className="border-border/50 hover:shadow-md transition-shadow">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Analytics</CardTitle>
							<BarChart3 className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">0</div>
							<p className="text-xs text-muted-foreground">Reports generated</p>
						</CardContent>
					</Card>
				</div>

				{/* Quick Actions */}
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					<Card className="border-dashed border-border/50 hover:border-border transition-colors cursor-pointer group">
						<CardContent className="p-6">
							<div className="flex items-center gap-4">
								<div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
									<Download className="h-6 w-6 text-primary" />
								</div>
								<div>
									<h3 className="font-semibold">Download New Video</h3>
									<p className="text-sm text-muted-foreground">
										Add a new video to your library
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
					<Card className="border-dashed border-border/50 hover:border-border transition-colors cursor-pointer group">
						<CardContent className="p-6">
							<div className="flex items-center gap-4">
								<div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
									<FileVideo className="h-6 w-6 text-primary" />
								</div>
								<div>
									<h3 className="font-semibold">Browse Media</h3>
									<p className="text-sm text-muted-foreground">
										View and manage your videos
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
					<Card className="border-dashed border-border/50 hover:border-border transition-colors cursor-pointer group">
						<CardContent className="p-6">
							<div className="flex items-center gap-4">
								<div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
									<BarChart3 className="h-6 w-6 text-primary" />
								</div>
								<div>
									<h3 className="font-semibold">View Analytics</h3>
									<p className="text-sm text-muted-foreground">
										Check your video statistics
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}
