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
import { Step1Transcribe } from '~/components/business/media/subtitles/Step1Transcribe'
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
import { logger } from '~/lib/logger'
import { queryOrpc } from '~/lib/orpc/query-client'
import {
	defaultSubtitleRenderConfig,
	type SubtitleRenderConfig,
} from '~/lib/media/types'
import { type TranscriptionProvider, type WhisperModel } from '~/lib/asr/whisper'

export default function SubtitlesPage() {
	const queryClient = useQueryClient()
	const [activeTab, setActiveTab] = useState<StepId>('step1')
	const [transcription, setTranscription] = useState<string>('')
	const [translation, setTranslation] = useState<string>('')
	const [selectedModel, setSelectedModel] = useState<WhisperModel>('whisper-medium')
	const [selectedProvider, setSelectedProvider] = useState<TranscriptionProvider>('local')
	const [selectedAIModel, setSelectedAIModel] = useState<AIModelId>(
		AIModelIds[0],
	)
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
					logger.info('transcription', 'Transcription completed successfully on client')
					setTranscription(data.transcription)
					setActiveTab('step2')
				}
			},
			onError: (error) => {
				logger.error('transcription', `Transcription failed: ${error.message}`)
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
		logger.info('transcription', `User started transcription: ${selectedProvider}/${selectedModel} for media ${mediaId}`)
		transcribeMutation.mutate({
			mediaId,
			model: selectedModel,
			provider: selectedProvider
		})
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
		<div className="p-4 space-y-4">
			{/* Header */}
			<PageHeader
				backHref={`/media/${mediaId}`}
				backText="Back to Video"
				title="Generate Subtitles"
			/>

			{/* Step Navigation - Always Visible */}
			<Stepper
				activeTab={activeTab}
				hasTranscription={!!transcription}
				hasTranslation={!!translation}
				hasRenderedVideo={hasRenderedVideo}
				onChange={(step) => setActiveTab(step)}
			/>

			{/* Main Content */}
			{activeTab === 'step1' && (
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<FileText className="h-5 w-5" />
									Step 1: Generate Subtitles
								</CardTitle>
								<CardDescription>
									Transcribe audio to text using Whisper AI
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Step1Transcribe
									selectedModel={selectedModel}
									selectedProvider={selectedProvider}
									onModelChange={(m) => setSelectedModel(m)}
									onProviderChange={(p) => setSelectedProvider(p)}
									isPending={transcribeMutation.isPending}
									onStart={handleStartTranscription}
									transcription={transcription}
									errorMessage={
										transcribeMutation.isError
											? transcribeMutation.error.message
											: undefined
									}
								/>
							</CardContent>
						</Card>
					)}

					{activeTab === 'step2' && (
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Languages className="h-5 w-5" />
									Step 2: Translate Subtitles
								</CardTitle>
								<CardDescription>
									Translate subtitles to your target language
								</CardDescription>
							</CardHeader>
							<CardContent>
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
							</CardContent>
						</Card>
					)}

					{activeTab === 'step3' && (
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Video className="h-5 w-5" />
									Step 3: Render Video
								</CardTitle>
								<CardDescription>
									Render the final video with embedded subtitles
								</CardDescription>
							</CardHeader>
							<CardContent>
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
							</CardContent>
						</Card>
					)}

					{activeTab === 'step4' && (
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Play className="h-5 w-5" />
									Step 4: Preview Video
								</CardTitle>
								<CardDescription>
									Preview and download your rendered video
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Step4Preview
									mediaId={mediaId}
									hasRenderedVideo={hasRenderedVideo}
									thumbnail={media?.thumbnail ?? undefined}
									cacheBuster={renderCacheBuster}
								/>
							</CardContent>
						</Card>
					)}
		</div>
	)
}
