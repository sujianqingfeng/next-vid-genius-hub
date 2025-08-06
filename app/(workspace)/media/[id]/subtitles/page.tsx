'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
	AlertCircle,
	CheckCircle,
	FileText,
	Languages,
	Loader2,
	Video,
} from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MediaInfoCard } from '~/components/business/media/media-info-card'
import { MobileDetailsCard } from '~/components/business/media/mobile-details-card'
import { PageHeader } from '~/components/layout'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { Textarea } from '~/components/ui/textarea'
import { type AIModelId, AIModelIds } from '~/lib/ai/models'
import { queryOrpc } from '~/lib/orpc/query-client'

type Model = 'whisper-large' | 'whisper-medium'

export default function SubtitlesPage() {
	const queryClient = useQueryClient()
	const [activeTab, setActiveTab] = useState('step1')
	const [transcription, setTranscription] = useState<string>('')
	const [translation, setTranslation] = useState<string>('')
	const [selectedModel, setSelectedModel] = useState<Model>('whisper-medium')
	const [selectedAIModel, setSelectedAIModel] = useState<AIModelId>(
		AIModelIds[0],
	)
	const [isMobileDetailsOpen, setIsMobileDetailsOpen] = useState(false)
	const params = useParams()
	const mediaId = params.id as string

	const mediaQuery = useQuery(
		queryOrpc.media.byId.queryOptions({ input: { id: mediaId } }),
	)

	useEffect(() => {
		if (mediaQuery.data?.transcription) {
			setTranscription(mediaQuery.data.transcription)
			setActiveTab('step2')
		}
		if (mediaQuery.data?.translation) {
			setTranslation(mediaQuery.data.translation)
			setActiveTab('step3')
		}
	}, [mediaQuery.data])

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

	const {
		mutate: renderMutate,
		isPending: isRendering,
		error: renderError,
	} = useMutation(queryOrpc.subtitle.render.mutationOptions())

	const handleStartTranscription = () => {
		transcribeMutation.mutate({ mediaId, model: selectedModel })
	}

	const handleStartTranslation = () => {
		if (transcription) {
			translateMutation.mutate({ mediaId, model: selectedAIModel })
		}
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

	const media = mediaQuery.data

	return (
		<div className="container mx-auto max-w-7xl p-6 space-y-6">
			{/* Header */}
			<PageHeader
				backHref={`/media/${mediaId}`}
				backText="Back to Video"
				title="Generate Subtitles"
			/>

			{/* Main Layout - Grid with Media Info and Content */}
			<div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
				{/* Media Info Card - Desktop Only */}
				<div className="lg:block hidden">
					{media && <MediaInfoCard media={media} />}
				</div>

				{/* Main Content Area */}
				<div className="lg:col-span-3 space-y-6">
					{/* Mobile Details Card - Mobile Only */}
					<div className="lg:hidden">
						{media && (
							<MobileDetailsCard
								media={media}
								isOpen={isMobileDetailsOpen}
								onClose={() => setIsMobileDetailsOpen(false)}
							/>
						)}
						{/* Mobile Toggle Button */}
						<Button
							variant="outline"
							size="sm"
							onClick={() => setIsMobileDetailsOpen(!isMobileDetailsOpen)}
							className="w-full mb-4"
						>
							<FileText className="h-4 w-4 mr-2" />
							{isMobileDetailsOpen ? 'Hide' : 'Show'} Media Details
						</Button>
					</div>

					{/* Progress Steps */}
					<div className="flex items-center justify-center mb-8">
						<div className="flex items-center space-x-4">
							{[
								{
									id: 'step1',
									label: 'Transcribe',
									icon: FileText,
									completed: !!transcription,
								},
								{
									id: 'step2',
									label: 'Translate',
									icon: Languages,
									completed: !!translation,
								},
								{ id: 'step3', label: 'Render', icon: Video, completed: false },
							].map((step, index) => (
								<div key={step.id} className="flex items-center">
									<div
										className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
											step.completed
												? 'bg-green-500 border-green-500 text-white'
												: activeTab === step.id
													? 'bg-primary border-primary text-primary-foreground'
													: 'bg-muted border-muted-foreground text-muted-foreground'
										}`}
									>
										{step.completed ? (
											<CheckCircle className="h-5 w-5" />
										) : (
											<step.icon className="h-5 w-5" />
										)}
									</div>
									<span
										className={`ml-2 text-sm font-medium ${
											step.completed
												? 'text-green-600'
												: activeTab === step.id
													? 'text-primary'
													: 'text-muted-foreground'
										}`}
									>
										{step.label}
									</span>
									{index < 2 && (
										<div
											className={`w-8 h-0.5 mx-4 ${
												step.completed ? 'bg-green-500' : 'bg-muted'
											}`}
										/>
									)}
								</div>
							))}
						</div>
					</div>

					{/* Main Content */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								{activeTab === 'step1' && <FileText className="h-5 w-5" />}
								{activeTab === 'step2' && <Languages className="h-5 w-5" />}
								{activeTab === 'step3' && <Video className="h-5 w-5" />}
								{activeTab === 'step1' && 'Step 1: Generate Subtitles'}
								{activeTab === 'step2' && 'Step 2: Translate Subtitles'}
								{activeTab === 'step3' && 'Step 3: Render Video'}
							</CardTitle>
							<CardDescription>
								{activeTab === 'step1' &&
									'Transcribe audio to text using Whisper AI'}
								{activeTab === 'step2' &&
									'Translate subtitles to your target language'}
								{activeTab === 'step3' &&
									'Render the final video with embedded subtitles'}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Tabs
								value={activeTab}
								onValueChange={setActiveTab}
								className="w-full"
							>
								<TabsList className="grid w-full grid-cols-3 mb-6">
									<TabsTrigger
										value="step1"
										className="flex items-center gap-2"
									>
										<FileText className="h-4 w-4" />
										<span className="hidden sm:inline">Transcribe</span>
									</TabsTrigger>
									<TabsTrigger
										value="step2"
										disabled={!transcription}
										className="flex items-center gap-2"
									>
										<Languages className="h-4 w-4" />
										<span className="hidden sm:inline">Translate</span>
									</TabsTrigger>
									<TabsTrigger
										value="step3"
										disabled={!translation}
										className="flex items-center gap-2"
									>
										<Video className="h-4 w-4" />
										<span className="hidden sm:inline">Render</span>
									</TabsTrigger>
								</TabsList>

								<TabsContent value="step1" className="space-y-6">
									<div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
										<Select
											value={selectedModel}
											onValueChange={(value) =>
												setSelectedModel(value as Model)
											}
											disabled={transcribeMutation.isPending}
										>
											<SelectTrigger className="w-full sm:w-[200px]">
												<SelectValue placeholder="Select model" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="whisper-medium">
													Whisper Medium
												</SelectItem>
												<SelectItem value="whisper-large">
													Whisper Large
												</SelectItem>
											</SelectContent>
										</Select>
										<Button
											onClick={handleStartTranscription}
											disabled={transcribeMutation.isPending}
											className="w-full sm:w-auto"
										>
											{transcribeMutation.isPending && (
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											)}
											{transcribeMutation.isPending
												? 'Generating...'
												: 'Start Transcription'}
										</Button>
									</div>

									{transcription && (
										<div className="space-y-3">
											<div className="flex items-center gap-2">
												<h3 className="text-lg font-semibold">
													Transcription Result
												</h3>
												<Badge variant="secondary" className="text-xs">
													{transcription.split(' ').length} words
												</Badge>
											</div>
											<Textarea
												value={transcription}
												readOnly
												rows={12}
												className="font-mono text-sm"
											/>
										</div>
									)}

									{transcribeMutation.isError && (
										<div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
											<AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
											<div>
												<h3 className="font-semibold text-red-800">
													Transcription Error
												</h3>
												<p className="text-red-700 text-sm">
													{transcribeMutation.error.message}
												</p>
											</div>
										</div>
									)}
								</TabsContent>

								<TabsContent value="step2" className="space-y-6">
									<div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
										<Select
											value={selectedAIModel}
											onValueChange={(value) =>
												setSelectedAIModel(value as AIModelId)
											}
											disabled={translateMutation.isPending}
										>
											<SelectTrigger className="w-full sm:w-[200px]">
												<SelectValue placeholder="Select model" />
											</SelectTrigger>
											<SelectContent>
												{AIModelIds.map((id) => (
													<SelectItem key={id} value={id}>
														{id}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Button
											onClick={handleStartTranslation}
											disabled={translateMutation.isPending || !transcription}
											className="w-full sm:w-auto"
										>
											{translateMutation.isPending && (
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											)}
											{translateMutation.isPending
												? 'Translating...'
												: 'Start Translation'}
										</Button>
									</div>

									{translation && (
										<div className="space-y-3">
											<div className="flex items-center gap-2">
												<h3 className="text-lg font-semibold">
													Translation Result
												</h3>
												<Badge variant="secondary" className="text-xs">
													{translation.split(' ').length} words
												</Badge>
											</div>
											<Textarea
												value={translation}
												readOnly
												rows={12}
												className="font-mono text-sm"
											/>
										</div>
									)}

									{translateMutation.isError && (
										<div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
											<AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
											<div>
												<h3 className="font-semibold text-red-800">
													Translation Error
												</h3>
												<p className="text-red-700 text-sm">
													{translateMutation.error.message}
												</p>
											</div>
										</div>
									)}
								</TabsContent>

								<TabsContent value="step3" className="space-y-6">
									<div className="text-center space-y-4">
										<div className="p-6 bg-muted/50 rounded-lg">
											<Video className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
											<h3 className="text-lg font-semibold mb-2">
												Ready to Render
											</h3>
											<p className="text-muted-foreground mb-4">
												Your video will be rendered with embedded subtitles.
												This process may take several minutes.
											</p>
											<Button
												onClick={() => {
													renderMutate({ mediaId })
												}}
												disabled={isRendering}
												size="lg"
											>
												{isRendering && (
													<Loader2 className="h-4 w-4 mr-2 animate-spin" />
												)}
												{isRendering ? 'Rendering...' : 'Start Rendering'}
											</Button>
										</div>
									</div>

									{renderError && (
										<div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
											<AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
											<div>
												<h3 className="font-semibold text-red-800">
													Rendering Error
												</h3>
												<p className="text-red-700 text-sm">
													{renderError.message}
												</p>
											</div>
										</div>
									)}
								</TabsContent>
							</Tabs>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}
