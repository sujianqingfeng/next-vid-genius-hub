import { ArrowRight, Download, MessageSquare, Play } from 'lucide-react'
import Link from 'next/link'
import { Button } from '~/components/ui/button'

export default function Home() {
	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
			<div className="px-4 py-16 sm:px-6 lg:px-8">
				<div className="max-w-4xl mx-auto">
					{/* Hero Section */}
					<div className="text-center mb-16">
						<h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400 bg-clip-text text-transparent mb-6">
							Video Genius Hub
						</h1>
						<p className="text-xl sm:text-2xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto leading-relaxed">
							Your intelligent platform for video processing, transcription, and
							analysis
						</p>
					</div>

					{/* CTA Button */}
					<div className="flex justify-center mb-20">
						<Link href="/media">
							<Button
								size="lg"
								className="text-lg px-8 py-6 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
							>
								Get Started
								<ArrowRight className="ml-2 h-5 w-5" />
							</Button>
						</Link>
					</div>

					{/* Features Grid */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
						<div className="text-center p-6 rounded-xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700">
							<div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mx-auto mb-4">
								<Play className="h-6 w-6 text-blue-600 dark:text-blue-400" />
							</div>
							<h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
								Video Processing
							</h3>
							<p className="text-slate-600 dark:text-slate-400">
								Upload and process videos with advanced AI capabilities
							</p>
						</div>

						<div className="text-center p-6 rounded-xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700">
							<div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mx-auto mb-4">
								<Download className="h-6 w-6 text-green-600 dark:text-green-400" />
							</div>
							<h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
								Smart Downloads
							</h3>
							<p className="text-slate-600 dark:text-slate-400">
								Download videos with automatic quality optimization
							</p>
						</div>

						<div className="text-center p-6 rounded-xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700">
							<div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mx-auto mb-4">
								<MessageSquare className="h-6 w-6 text-purple-600 dark:text-purple-400" />
							</div>
							<h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
								AI Comments
							</h3>
							<p className="text-slate-600 dark:text-slate-400">
								Generate intelligent comments and insights
							</p>
						</div>
					</div>

					{/* Stats Section */}
					<div className="text-center">
						<div className="inline-flex items-center gap-8 text-sm text-slate-500 dark:text-slate-400">
							<span>Powered by Next.js 15</span>
							<span>•</span>
							<span>TypeScript</span>
							<span>•</span>
							<span>Tailwind CSS</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
