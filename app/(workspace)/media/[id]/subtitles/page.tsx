'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
	AlertCircle,
	FileText,
	Languages,
	Loader2,
	Play,
	Video,
} from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MediaInfoCard } from '~/components/business/media/media-info-card'
import { MobileDetailsCard } from '~/components/business/media/mobile-details-card'
import {
	Step1Transcribe,
	type WhisperModel,
} from '~/components/business/media/subtitles/Step1Transcribe'
import { Step2Translate } from '~/components/business/media/subtitles/Step2Translate'
import { Step3Render } from '~/components/business/media/subtitles/Step3Render'
import { Step4Preview } from '~/components/business/media/subtitles/Step4Preview'
import {
	type StepId,
	Stepper,
} from '~/components/business/media/subtitles/Stepper'
import { PageHeader } from '~/components/layout'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { type AIModelId, AIModelIds } from '~/lib/ai/models'
import { queryOrpc } from '~/lib/orpc/query-client'
import {
	defaultSubtitleRenderConfig,
	type SubtitleRenderConfig,
} from '~/lib/media/types'

type Model = WhisperModel

export default function SubtitlesPage() {
	const queryClient = useQueryClient()
	const [activeTab, setActiveTab] = useState<StepId>('step1')
	const [transcription, setTranscription] = useState<string>('')
	const [translation, setTranslation] = useState<string>('')
	const [selectedModel, setSelectedModel] = useState<Model>('whisper-medium')
	const [selectedAIModel, setSelectedAIModel] = useState<AIModelId>(
		AIModelIds[0],
	)
	const [isMobileDetailsOpen, setIsMobileDetailsOpen] = useState(false)
	const [subtitleConfig, setSubtitleConfig] = useState<SubtitleRenderConfig>(
		() => ({ ...defaultSubtitleRenderConfig }),
	)
	const [renderCacheBuster, setRenderCacheBuster] = useState<number>(0)
	const params = useParams()
	const mediaId = params.id as string

	const mediaQuery = useQuery(
		queryOrpc.media.byId.queryOptions({ input: { id: mediaId } }),
	)

	const media = mediaQuery.data
	const hasRenderedVideo = !!media?.videoWithSubtitlesPath

	useEffect(() => {
		if (mediaQuery.data?.transcription) {
			setTranscription(mediaQuery.data.transcription)
			setActiveTab('step2')
		}
		if (mediaQuery.data?.translation) {
			setTranslation(mediaQuery.data.translation)
			setActiveTab('step3')
		}
		if (mediaQuery.data?.videoWithSubtitlesPath) {
			setActiveTab('step4')
			setRenderCacheBuster(Date.now())
		}
	}, [mediaQuery.data])

	// Poll for rendering status when on step 3
	useEffect(() => {
		if (activeTab === 'step3' && translation && !hasRenderedVideo) {
			const interval = setInterval(() => {
				queryClient.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id: mediaId } }),
				})
			}, 5000) // Poll every 5 seconds

			return () => clearInterval(interval)
		}
	}, [activeTab, translation, hasRenderedVideo, mediaId, queryClient])

	const transcribeMutation = useMutation(
		queryOrpc.subtitle.transcribe.mutationOptions({
			onSuccess: (data) => {
				if (data.transcription) {
					setTranscription(data.transcription)
					setActiveTab('step2')
				}
			},
		}),
	)

	const translateMutation = useMutation(
		queryOrpc.subtitle.translate.mutationOptions({
			onSuccess: (data) => {
				setTranslation(data.translation)
				setActiveTab('step3')
				queryClient.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id: mediaId } }),
				})
			},
		}),
	)

	const deleteCueMutation = useMutation(
		queryOrpc.subtitle.deleteTranslationCue.mutationOptions({
			onSuccess: (data) => {
				if (data.translation) setTranslation(data.translation)
				queryClient.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id: mediaId } }),
				})
			},
		}),
	)

	const {
		mutate: renderMutate,
		isPending: isRendering,
		error: renderError,
	} = useMutation(
		queryOrpc.subtitle.render.mutationOptions({
			onSuccess: () => {
				setActiveTab('step4')
				setRenderCacheBuster(Date.now())
				queryClient.invalidateQueries({
					queryKey: queryOrpc.media.byId.queryKey({ input: { id: mediaId } }),
				})
			},
		}),
	)

	const handleStartTranscription = () => {
		transcribeMutation.mutate({ mediaId, model: selectedModel })
	}

	const handleStartTranslation = () => {
		if (transcription) {
			translateMutation.mutate({ mediaId, model: selectedAIModel })
		}
	}

	const handleDeleteCue = (index: number) => {
		if (!translation) return
		deleteCueMutation.mutate({ mediaId, index })
	}

	if (mediaQuery.isLoading) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<Loader2 className="h-8 w-8 animate-spin" />
			</div>
		)
	}

	if (mediaQuery.isError) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<div className="text-center">
					<AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
					<h2 className="text-xl font-semibold mb-2">Failed to load media</h2>
					<p className="text-muted-foreground mb-4">
						{mediaQuery.error.message}
					</p>
					<Button asChild>
						<Link href="/media">Back to Media</Link>
					</Button>
				</div>
			</div>
		)
	}

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<PageHeader
				backHref={`/media/${mediaId}`}
				backText="Back to Video"
				title="Generate Subtitles"
			/>

			{/* Main Layout - Grid with Stepper and Content */}
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
				{/* Stepper - Desktop Only */}
				<aside className="lg:block hidden lg:sticky lg:top-24 self-start lg:col-span-3">
					<Stepper
						activeTab={activeTab}
						hasTranscription={!!transcription}
						hasTranslation={!!translation}
						hasRenderedVideo={hasRenderedVideo}
						onChange={(step) => setActiveTab(step)}
						orientation="vertical"
					/>
				</aside>

				{/* Main Content Area */}
				<div className="lg:col-span-9 space-y-6">
					{/* Mobile Stepper - Mobile Only */}
					<div className="lg:hidden">
						<Stepper
							activeTab={activeTab}
							hasTranscription={!!transcription}
							hasTranslation={!!translation}
							hasRenderedVideo={hasRenderedVideo}
							onChange={(step) => setActiveTab(step)}
						/>
					</div>

					{/* Main Content */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								{activeTab === 'step1' && <FileText className="h-5 w-5" />}
								{activeTab === 'step2' && <Languages className="h-5 w-5" />}
								{activeTab === 'step3' && <Video className="h-5 w-5" />}
								{activeTab === 'step4' && <Play className="h-5 w-5" />}
								{activeTab === 'step1' && 'Step 1: Generate Subtitles'}
								{activeTab === 'step2' && 'Step 2: Translate Subtitles'}
								{activeTab === 'step3' && 'Step 3: Render Video'}
								{activeTab === 'step4' && 'Step 4: Preview Video'}
							</CardTitle>
							<CardDescription>
								{activeTab === 'step1' &&
									'Transcribe audio to text using Whisper AI'}
								{activeTab === 'step2' &&
									'Translate subtitles to your target language'}
								{activeTab === 'step3' &&
									'Render the final video with embedded subtitles'}
								{activeTab === 'step4' &&
									'Preview and download your rendered video'}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{activeTab === 'step1' && (
								<Step1Transcribe
									selectedModel={selectedModel}
									onModelChange={(m) => setSelectedModel(m)}
									isPending={transcribeMutation.isPending}
									onStart={handleStartTranscription}
									transcription={transcription}
									errorMessage={
										transcribeMutation.isError
											? transcribeMutation.error.message
											: undefined
									}
								/>
							)}
							{activeTab === 'step2' && (
								<Step2Translate
									selectedAIModel={selectedAIModel}
									onModelChange={(m) => setSelectedAIModel(m)}
									isPending={translateMutation.isPending}
									onStart={handleStartTranslation}
									translation={translation}
									onDeleteCue={handleDeleteCue}
									canStart={!!transcription}
									errorMessage={
										translateMutation.isError
											? translateMutation.error.message
											: undefined
									}
								/>
							)}
							{activeTab === 'step3' && (
								<Step3Render
									isRendering={isRendering}
									onStart={(renderConfig) =>
										renderMutate({ mediaId, subtitleConfig: renderConfig })
									}
									errorMessage={renderError?.message}
									mediaId={mediaId}
									translationAvailable={!!translation}
									translation={translation}
									config={subtitleConfig}
									onConfigChange={(nextConfig) =>
										setSubtitleConfig({ ...nextConfig })
									}
								/>
							)}
							{activeTab === 'step4' && (
								<Step4Preview
									mediaId={mediaId}
									hasRenderedVideo={hasRenderedVideo}
									thumbnail={media?.thumbnail ?? undefined}
									cacheBuster={renderCacheBuster}
								/>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}
