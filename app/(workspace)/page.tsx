import { BarChart3, Download, FileVideo, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

export default function DashboardPage() {
	return (
		<div className="min-h-full p-6 space-y-8">
			{/* Header Section */}
			<div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
				<h1 className="text-4xl font-bold tracking-tight text-foreground">Dashboard</h1>
				<p className="text-muted-foreground text-lg font-light">
					Welcome back. Here&apos;s an overview of your creative space.
				</p>
			</div>

			{/* Stats Grid */}
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
				<Card className="glass border-none shadow-sm hover:shadow-md transition-all duration-300">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Videos
						</CardTitle>
						<FileVideo className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-foreground">0</div>
						<p className="text-xs text-muted-foreground mt-1">
							+0% from last month
						</p>
					</CardContent>
				</Card>
				<Card className="glass border-none shadow-sm hover:shadow-md transition-all duration-300">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">Media Files</CardTitle>
						<Download className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-foreground">0</div>
						<p className="text-xs text-muted-foreground mt-1">
							+0% from last month
						</p>
					</CardContent>
				</Card>
				<Card className="glass border-none shadow-sm hover:shadow-md transition-all duration-300">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">Processing</CardTitle>
						<TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-foreground">0</div>
						<p className="text-xs text-muted-foreground mt-1">Active tasks</p>
					</CardContent>
				</Card>
				<Card className="glass border-none shadow-sm hover:shadow-md transition-all duration-300">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">Analytics</CardTitle>
						<BarChart3 className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-foreground">0</div>
						<p className="text-xs text-muted-foreground mt-1">Reports generated</p>
					</CardContent>
				</Card>
			</div>

			{/* Quick Actions */}
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
				<Card className="glass border-none shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-300 cursor-pointer group">
					<CardContent className="p-6">
						<div className="flex items-center gap-5">
							<div className="h-14 w-14 rounded-2xl bg-secondary/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
								<Download className="h-7 w-7 text-foreground group-hover:text-primary transition-colors" strokeWidth={1.5} />
							</div>
							<div>
								<h3 className="font-semibold text-lg text-foreground">Download Video</h3>
								<p className="text-sm text-muted-foreground font-light">
									Add a new video to your library
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card className="glass border-none shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-300 cursor-pointer group">
					<CardContent className="p-6">
						<div className="flex items-center gap-5">
							<div className="h-14 w-14 rounded-2xl bg-secondary/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
								<FileVideo className="h-7 w-7 text-foreground group-hover:text-primary transition-colors" strokeWidth={1.5} />
							</div>
							<div>
								<h3 className="font-semibold text-lg text-foreground">Browse Media</h3>
								<p className="text-sm text-muted-foreground font-light">
									View and manage your videos
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card className="glass border-none shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-300 cursor-pointer group">
					<CardContent className="p-6">
						<div className="flex items-center gap-5">
							<div className="h-14 w-14 rounded-2xl bg-secondary/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
								<BarChart3 className="h-7 w-7 text-foreground group-hover:text-primary transition-colors" strokeWidth={1.5} />
							</div>
							<div>
								<h3 className="font-semibold text-lg text-foreground">View Analytics</h3>
								<p className="text-sm text-muted-foreground font-light">
									Check your video statistics
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
