import { ArrowLeft } from 'lucide-react'
import { Link, createFileRoute } from '@tanstack/react-router'

import LanguageToggle from '../components/LanguageToggle'
import { useTranslations } from '../integrations/i18n'

import { Button } from '~/components/ui/button'

export const Route = createFileRoute('/privacy')({
	component: PrivacyPage,
})

function PrivacyPage() {
	const t = useTranslations('Privacy')

	return (
		<div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
			<div className="relative overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
				<div className="pointer-events-none absolute top-0 left-1/2 h-[300px] w-full -translate-x-1/2 bg-gradient-to-b from-secondary/80 to-transparent -z-10" />

				<div className="relative z-10 mx-auto max-w-4xl">
					<div className="mb-8 flex items-center justify-between">
						<Button variant="ghost" size="sm" asChild>
							<Link to="/">
								<ArrowLeft className="mr-2 h-4 w-4" />
								{t('backHome')}
							</Link>
						</Button>
						<LanguageToggle />
					</div>

					<div className="mb-12 animate-in fade-in slide-in-from-bottom-8 text-center duration-700">
						<h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
							{t('title')}
						</h1>
						<p className="text-muted-foreground">
							{t('lastUpdated')}: {t('updateDate')}
						</p>
					</div>

					<div className="max-w-none animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
						<section className="glass mb-10 rounded-2xl p-6">
							<h2 className="mb-4 text-2xl font-semibold">
								{t('sections.intro.title')}
							</h2>
							<p className="leading-relaxed text-muted-foreground">
								{t('sections.intro.content')}
							</p>
						</section>

						<section className="glass mb-10 rounded-2xl p-6">
							<h2 className="mb-4 text-2xl font-semibold">
								{t('sections.collection.title')}
							</h2>
							<p className="mb-4 leading-relaxed text-muted-foreground">
								{t('sections.collection.content')}
							</p>
							<ul className="list-inside list-disc space-y-2 text-muted-foreground">
								<li>{t('sections.collection.items.account')}</li>
								<li>{t('sections.collection.items.usage')}</li>
								<li>{t('sections.collection.items.device')}</li>
								<li>{t('sections.collection.items.media')}</li>
							</ul>
						</section>

						<section className="glass mb-10 rounded-2xl p-6">
							<h2 className="mb-4 text-2xl font-semibold">
								{t('sections.usage.title')}
							</h2>
							<p className="mb-4 leading-relaxed text-muted-foreground">
								{t('sections.usage.content')}
							</p>
							<ul className="list-inside list-disc space-y-2 text-muted-foreground">
								<li>{t('sections.usage.items.service')}</li>
								<li>{t('sections.usage.items.improve')}</li>
								<li>{t('sections.usage.items.communicate')}</li>
								<li>{t('sections.usage.items.security')}</li>
							</ul>
						</section>

						<section className="glass mb-10 rounded-2xl p-6">
							<h2 className="mb-4 text-2xl font-semibold">
								{t('sections.storage.title')}
							</h2>
							<p className="leading-relaxed text-muted-foreground">
								{t('sections.storage.content')}
							</p>
						</section>

						<section className="glass mb-10 rounded-2xl p-6">
							<h2 className="mb-4 text-2xl font-semibold">
								{t('sections.sharing.title')}
							</h2>
							<p className="leading-relaxed text-muted-foreground">
								{t('sections.sharing.content')}
							</p>
						</section>

						<section className="glass mb-10 rounded-2xl p-6">
							<h2 className="mb-4 text-2xl font-semibold">
								{t('sections.rights.title')}
							</h2>
							<p className="mb-4 leading-relaxed text-muted-foreground">
								{t('sections.rights.content')}
							</p>
							<ul className="list-inside list-disc space-y-2 text-muted-foreground">
								<li>{t('sections.rights.items.access')}</li>
								<li>{t('sections.rights.items.correct')}</li>
								<li>{t('sections.rights.items.delete')}</li>
								<li>{t('sections.rights.items.export')}</li>
							</ul>
						</section>

						<section className="glass mb-10 rounded-2xl p-6">
							<h2 className="mb-4 text-2xl font-semibold">
								{t('sections.cookies.title')}
							</h2>
							<p className="leading-relaxed text-muted-foreground">
								{t('sections.cookies.content')}
							</p>
						</section>

						<section className="glass mb-10 rounded-2xl p-6">
							<h2 className="mb-4 text-2xl font-semibold">
								{t('sections.updates.title')}
							</h2>
							<p className="leading-relaxed text-muted-foreground">
								{t('sections.updates.content')}
							</p>
						</section>

						<section className="glass mb-10 rounded-2xl p-6">
							<h2 className="mb-4 text-2xl font-semibold">
								{t('sections.contact.title')}
							</h2>
							<p className="leading-relaxed text-muted-foreground">
								{t('sections.contact.content')}
							</p>
						</section>
					</div>
				</div>
			</div>
		</div>
	)
}

