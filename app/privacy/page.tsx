import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '~/components/ui/button'
import { HomeLanguageToggle } from '~/components/business/home/home-language-toggle'
import { getServerTranslations } from '~/lib/i18n/next-server'

export default async function PrivacyPage() {
	const t = await getServerTranslations('Privacy')

	return (
		<div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
			<div className="px-4 py-12 sm:px-6 lg:px-8 relative overflow-hidden">
				{/* Background Elements */}
				<div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[300px] bg-gradient-to-b from-secondary/80 to-transparent -z-10 pointer-events-none" />

				<div className="max-w-4xl mx-auto relative z-10">
					<div className="flex justify-between items-center mb-8">
						<Link href="/">
							<Button variant="ghost" size="sm">
								<ArrowLeft className="mr-2 h-4 w-4" />
								{t('backHome')}
							</Button>
						</Link>
						<HomeLanguageToggle />
					</div>

					{/* Header */}
					<div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
						<h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
							{t('title')}
						</h1>
						<p className="text-muted-foreground">
							{t('lastUpdated')}: {t('updateDate')}
						</p>
					</div>

					{/* Content */}
					<div className="prose prose-neutral dark:prose-invert max-w-none animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
						{/* Introduction */}
						<section className="mb-10 p-6 rounded-2xl glass">
							<h2 className="text-2xl font-semibold mb-4">{t('sections.intro.title')}</h2>
							<p className="text-muted-foreground leading-relaxed">
								{t('sections.intro.content')}
							</p>
						</section>

						{/* Information Collection */}
						<section className="mb-10 p-6 rounded-2xl glass">
							<h2 className="text-2xl font-semibold mb-4">{t('sections.collection.title')}</h2>
							<p className="text-muted-foreground leading-relaxed mb-4">
								{t('sections.collection.content')}
							</p>
							<ul className="list-disc list-inside text-muted-foreground space-y-2">
								<li>{t('sections.collection.items.account')}</li>
								<li>{t('sections.collection.items.usage')}</li>
								<li>{t('sections.collection.items.device')}</li>
								<li>{t('sections.collection.items.media')}</li>
							</ul>
						</section>

						{/* Information Usage */}
						<section className="mb-10 p-6 rounded-2xl glass">
							<h2 className="text-2xl font-semibold mb-4">{t('sections.usage.title')}</h2>
							<p className="text-muted-foreground leading-relaxed mb-4">
								{t('sections.usage.content')}
							</p>
							<ul className="list-disc list-inside text-muted-foreground space-y-2">
								<li>{t('sections.usage.items.service')}</li>
								<li>{t('sections.usage.items.improve')}</li>
								<li>{t('sections.usage.items.communicate')}</li>
								<li>{t('sections.usage.items.security')}</li>
							</ul>
						</section>

						{/* Data Storage */}
						<section className="mb-10 p-6 rounded-2xl glass">
							<h2 className="text-2xl font-semibold mb-4">{t('sections.storage.title')}</h2>
							<p className="text-muted-foreground leading-relaxed">
								{t('sections.storage.content')}
							</p>
						</section>

						{/* Data Sharing */}
						<section className="mb-10 p-6 rounded-2xl glass">
							<h2 className="text-2xl font-semibold mb-4">{t('sections.sharing.title')}</h2>
							<p className="text-muted-foreground leading-relaxed">
								{t('sections.sharing.content')}
							</p>
						</section>

						{/* User Rights */}
						<section className="mb-10 p-6 rounded-2xl glass">
							<h2 className="text-2xl font-semibold mb-4">{t('sections.rights.title')}</h2>
							<p className="text-muted-foreground leading-relaxed mb-4">
								{t('sections.rights.content')}
							</p>
							<ul className="list-disc list-inside text-muted-foreground space-y-2">
								<li>{t('sections.rights.items.access')}</li>
								<li>{t('sections.rights.items.correct')}</li>
								<li>{t('sections.rights.items.delete')}</li>
								<li>{t('sections.rights.items.export')}</li>
							</ul>
						</section>

						{/* Cookies */}
						<section className="mb-10 p-6 rounded-2xl glass">
							<h2 className="text-2xl font-semibold mb-4">{t('sections.cookies.title')}</h2>
							<p className="text-muted-foreground leading-relaxed">
								{t('sections.cookies.content')}
							</p>
						</section>

						{/* Updates */}
						<section className="mb-10 p-6 rounded-2xl glass">
							<h2 className="text-2xl font-semibold mb-4">{t('sections.updates.title')}</h2>
							<p className="text-muted-foreground leading-relaxed">
								{t('sections.updates.content')}
							</p>
						</section>

						{/* Contact */}
						<section className="mb-10 p-6 rounded-2xl glass">
							<h2 className="text-2xl font-semibold mb-4">{t('sections.contact.title')}</h2>
							<p className="text-muted-foreground leading-relaxed">
								{t('sections.contact.content')}
							</p>
						</section>
					</div>
				</div>
			</div>
		</div>
	)
}
