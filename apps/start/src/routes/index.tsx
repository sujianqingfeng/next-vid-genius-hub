import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, Download, MessageSquare, Play } from 'lucide-react'

import LanguageToggle from '../components/LanguageToggle'
import { useTranslations } from '../integrations/i18n'

import { Button } from '~/components/ui/button'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const t = useTranslations('Home')

  return (
    <div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
      <div className="px-4 py-24 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-secondary/80 to-transparent -z-10 pointer-events-none" />

        <div className="max-w-5xl mx-auto relative z-10">
          <div className="flex justify-end mb-8">
            <LanguageToggle />
          </div>

          <div className="text-center mb-24 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="inline-flex items-center justify-center p-2 mb-8 rounded-full bg-secondary/50 backdrop-blur-sm border border-border/50">
              <span className="px-3 py-1 text-xs font-medium tracking-wide uppercase text-muted-foreground">
                {t('badge')}
              </span>
            </div>
            <h1 className="text-6xl sm:text-7xl lg:text-8xl font-bold tracking-tight text-foreground mb-8">
              {t('title')}
            </h1>
            <p className="text-xl sm:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed font-light">
              {t('hero')}
            </p>
          </div>

          <div className="flex justify-center mb-32 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
            <Button
              size="lg"
              className="h-14 px-10 rounded-full text-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              asChild
            >
              <Link to="/media">
                {t('cta')}
                <ArrowRight className="ml-2 h-5 w-5" strokeWidth={1.5} />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            <div className="group p-8 rounded-3xl glass hover:bg-white/80 transition-all duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <Play className="h-7 w-7 text-foreground" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                {t('features.processing.title')}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {t('features.processing.desc')}
              </p>
            </div>

            <div className="group p-8 rounded-3xl glass hover:bg-white/80 transition-all duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <Download className="h-7 w-7 text-foreground" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                {t('features.downloads.title')}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {t('features.downloads.desc')}
              </p>
            </div>

            <div className="group p-8 rounded-3xl glass hover:bg-white/80 transition-all duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <MessageSquare className="h-7 w-7 text-foreground" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                {t('features.comments.title')}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {t('features.comments.desc')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
