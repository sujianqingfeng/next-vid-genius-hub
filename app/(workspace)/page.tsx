import { BarChart3, Download, FileVideo, TrendingUp } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

export default async function DashboardPage() {
	const t = await getTranslations('Dashboard')

	return (
		<div className="min-h-full p-6 space-y-8">
			{/* Header Section */}
			<div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
				<h1 className="text-4xl font-bold tracking-tight text-foreground">
					{t('title')}
				</h1>
				<p className="text-muted-foreground text-lg font-light">
					{t('subtitle')}
				</p>
			</div>

			{/* Stats Grid */}
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
				<Card className="glass border-none shadow-sm hover:shadow-md transition-all duration-300">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							{t('cards.totalVideos.title')}
						</CardTitle>
						<FileVideo className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-foreground">0</div>
						<p className="text-xs text-muted-foreground mt-1">
							{t('cards.totalVideos.delta')}
						</p>
					</CardContent>
				</Card>
				<Card className="glass border-none shadow-sm hover:shadow-md transition-all duration-300">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							{t('cards.media.title')}
						</CardTitle>
						<Download className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-foreground">0</div>
						<p className="text-xs text-muted-foreground mt-1">
							{t('cards.media.delta')}
						</p>
					</CardContent>
				</Card>
				<Card className="glass border-none shadow-sm hover:shadow-md transition-all duration-300">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							{t('cards.processing.title')}
						</CardTitle>
						<TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-foreground">0</div>
						<p className="text-xs text-muted-foreground mt-1">
							{t('cards.processing.delta')}
						</p>
					</CardContent>
				</Card>
				<Card className="glass border-none shadow-sm hover:shadow-md transition-all duration-300">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							{t('cards.analytics.title')}
						</CardTitle>
						<BarChart3 className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-foreground">0</div>
						<p className="text-xs text-muted-foreground mt-1">
							{t('cards.analytics.delta')}
						</p>
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
								<h3 className="font-semibold text-lg text-foreground">
									{t('quickActions.download.title')}
								</h3>
								<p className="text-sm text-muted-foreground font-light">
									{t('quickActions.download.desc')}
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
								<h3 className="font-semibold text-lg text-foreground">
									{t('quickActions.browse.title')}
								</h3>
								<p className="text-sm text-muted-foreground font-light">
									{t('quickActions.browse.desc')}
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
								<h3 className="font-semibold text-lg text-foreground">
									{t('quickActions.analytics.title')}
								</h3>
								<p className="text-sm text-muted-foreground font-light">
									{t('quickActions.analytics.desc')}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
