import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '~/components/ui/button'
import LanguageToggle from '~/components/business/layout/language-toggle'
import { useTranslations } from '~/lib/shared/i18n'

export const Route = createFileRoute('/marketing/')({ component: Home })

function Home() {
	const t = useTranslations('Home')

	return (
		<div className="min-h-screen bg-background text-foreground font-sans">
			{/* Top Bar */}
			<header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background">
				<div className="flex items-center gap-4">
					<span className="text-sm font-bold uppercase tracking-wider">
						{t('topBar.brand')}
					</span>
					<span className="font-mono text-xs text-muted-foreground border border-border px-1.5 py-0.5">
						v1.0.0
					</span>
				</div>
				<div className="flex items-center gap-4">
					<LanguageToggle />
					<Button
						variant="outline"
						size="sm"
						className="h-8 rounded-none border-border text-xs uppercase tracking-wide hover:bg-secondary hover:text-secondary-foreground"
						asChild
					>
						<Link to="/auth/login">{t('topBar.login')}</Link>
					</Button>
				</div>
			</header>

			{/* Main Canvas */}
			<main className="p-6 md:p-12 lg:p-24">
				<div className="border border-border bg-card max-w-7xl mx-auto">
					{/* Hero Section */}
					<div className="py-24 px-8 text-center border-b border-border">
						<div className="inline-block border border-border px-3 py-1 mb-8 bg-secondary/50">
							<span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
								{t('badge')}
							</span>
						</div>

						<h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 uppercase">
							{t('title')}
						</h1>

						<p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-mono mb-12">
							{t('hero')}
						</p>

						<div className="flex flex-col sm:flex-row items-center justify-center gap-4">
							<Button
								size="lg"
								className="h-12 px-8 rounded-none bg-primary text-primary-foreground hover:bg-primary/90 text-sm uppercase tracking-wide border border-transparent"
								asChild
							>
								<Link to="/media">
									{t('cta')}
									<ArrowRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>

							<Button
								variant="outline"
								size="lg"
								className="h-12 px-8 rounded-none border-border hover:bg-secondary hover:text-secondary-foreground text-sm uppercase tracking-wide"
								asChild
							>
								<a
									href="https://github.com/your-repo"
									target="_blank"
									rel="noopener noreferrer"
								>
									{t('topBar.documentation')}
								</a>
							</Button>
						</div>
					</div>

					{/* Features Grid */}
					<div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
						{/* Feature 1 */}
						<div className="p-8 md:p-12 hover:bg-secondary/5 transition-colors duration-200">
							<div className="mb-6">
								<span className="text-xs font-mono border border-border px-2 py-1 text-muted-foreground">
									01
								</span>
							</div>
							<h3 className="text-lg font-bold uppercase tracking-wide mb-4">
								{t('features.processing.title')}
							</h3>
							<p className="text-sm text-muted-foreground leading-relaxed font-mono">
								{t('features.processing.desc')}
							</p>
						</div>

						{/* Feature 2 */}
						<div className="p-8 md:p-12 hover:bg-secondary/5 transition-colors duration-200">
							<div className="mb-6">
								<span className="text-xs font-mono border border-border px-2 py-1 text-muted-foreground">
									02
								</span>
							</div>
							<h3 className="text-lg font-bold uppercase tracking-wide mb-4">
								{t('features.downloads.title')}
							</h3>
							<p className="text-sm text-muted-foreground leading-relaxed font-mono">
								{t('features.downloads.desc')}
							</p>
						</div>

						{/* Feature 3 */}
						<div className="p-8 md:p-12 hover:bg-secondary/5 transition-colors duration-200">
							<div className="mb-6">
								<span className="text-xs font-mono border border-border px-2 py-1 text-muted-foreground">
									03
								</span>
							</div>
							<h3 className="text-lg font-bold uppercase tracking-wide mb-4">
								{t('features.comments.title')}
							</h3>
							<p className="text-sm text-muted-foreground leading-relaxed font-mono">
								{t('features.comments.desc')}
							</p>
						</div>
					</div>
				</div>
			</main>
		</div>
	)
}
