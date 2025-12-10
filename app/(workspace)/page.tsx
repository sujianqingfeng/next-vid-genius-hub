import { BarChart3, Download, FileVideo, TrendingUp } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { PageHeader } from '~/components/business/layout/page-header'
import { WorkspacePageShell } from '~/components/business/layout/workspace-page-shell'

export default async function DashboardPage() {
	const t = await getTranslations('Dashboard')

	return (
		<WorkspacePageShell
			header={
				<PageHeader
					backHref="/"
					showBackButton={false}
					title={t('title')}
					subtitle={t('subtitle')}
					withBackground
				/>
			}
		>
			<div className="grid gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 md:grid-cols-2 lg:grid-cols-4">
				<Card className="glass border-none shadow-sm transition-all duration-300 hover:shadow-md">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							{t('cards.totalVideos.title')}
						</CardTitle>
						<FileVideo className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-foreground">0</div>
						<p className="mt-1 text-xs text-muted-foreground">
							{t('cards.totalVideos.delta')}
						</p>
					</CardContent>
				</Card>
				<Card className="glass border-none shadow-sm transition-all duration-300 hover:shadow-md">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							{t('cards.media.title')}
						</CardTitle>
						<Download className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-foreground">0</div>
						<p className="mt-1 text-xs text-muted-foreground">
							{t('cards.media.delta')}
						</p>
					</CardContent>
				</Card>
				<Card className="glass border-none shadow-sm transition-all duration-300 hover:shadow-md">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							{t('cards.processing.title')}
						</CardTitle>
						<TrendingUp className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-foreground">0</div>
						<p className="mt-1 text-xs text-muted-foreground">
							{t('cards.processing.delta')}
						</p>
					</CardContent>
				</Card>
				<Card className="glass border-none shadow-sm transition-all duration-300 hover:shadow-md">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							{t('cards.analytics.title')}
						</CardTitle>
						<BarChart3 className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-foreground">0</div>
						<p className="mt-1 text-xs text-muted-foreground">
							{t('cards.analytics.delta')}
						</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 md:grid-cols-2 lg:grid-cols-3">
				<Card className="glass group cursor-pointer border-none shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md">
					<CardContent className="p-6">
						<div className="flex items-center gap-5">
							<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/50 transition-colors group-hover:bg-primary/10">
								<Download
									className="h-7 w-7 text-foreground transition-colors group-hover:text-primary"
									strokeWidth={1.5}
								/>
							</div>
							<div>
								<h3 className="text-lg font-semibold text-foreground">
									{t('quickActions.download.title')}
								</h3>
								<p className="text-sm font-light text-muted-foreground">
									{t('quickActions.download.desc')}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card className="glass group cursor-pointer border-none shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md">
					<CardContent className="p-6">
						<div className="flex items-center gap-5">
							<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/50 transition-colors group-hover:bg-primary/10">
								<FileVideo
									className="h-7 w-7 text-foreground transition-colors group-hover:text-primary"
									strokeWidth={1.5}
								/>
							</div>
							<div>
								<h3 className="text-lg font-semibold text-foreground">
									{t('quickActions.browse.title')}
								</h3>
								<p className="text-sm font-light text-muted-foreground">
									{t('quickActions.browse.desc')}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card className="glass group cursor-pointer border-none shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md">
					<CardContent className="p-6">
						<div className="flex items-center gap-5">
							<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/50 transition-colors group-hover:bg-primary/10">
								<BarChart3
									className="h-7 w-7 text-foreground transition-colors group-hover:text-primary"
									strokeWidth={1.5}
								/>
							</div>
							<div>
								<h3 className="text-lg font-semibold text-foreground">
									{t('quickActions.analytics.title')}
								</h3>
								<p className="text-sm font-light text-muted-foreground">
									{t('quickActions.analytics.desc')}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</WorkspacePageShell>
	)
}
