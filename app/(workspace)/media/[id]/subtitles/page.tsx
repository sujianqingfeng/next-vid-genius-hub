'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '~/components/ui/button'
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
import { orpc } from '~/lib/orpc/client'
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
	}, [mediaQuery.data])

	const transcribeMutation = useMutation(
		queryOrpc.transcribe.mutationOptions({
			onSuccess: (data) => {
				if (data.transcription) {
					setTranscription(data.transcription)
					setActiveTab('step2')
				}
			},
		}),
	)

	const translateMutation = useMutation({
		mutationFn: orpc.translate.translate,
		onSuccess: (data) => {
			setTranslation(data.translation)
			queryClient.invalidateQueries({
				queryKey: queryOrpc.media.byId.queryKey({ input: { id: mediaId } }),
			})
		},
	})

	const handleStartTranscription = () => {
		transcribeMutation.mutate({ mediaId, model: selectedModel })
	}

	const handleStartTranslation = () => {
		if (transcription) {
			translateMutation.mutate({ text: transcription, model: selectedAIModel })
		}
	}

	return (
		<div className="p-8">
			<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
				<TabsList className="grid w-full grid-cols-2">
					<TabsTrigger value="step1">Step 1: Generate Subtitles</TabsTrigger>
					<TabsTrigger value="step2" disabled={!transcription}>
						Step 2: Translate Subtitles
					</TabsTrigger>
				</TabsList>
				<TabsContent value="step1">
					<div className="space-y-4 py-4">
						<div className="flex items-center gap-4">
							<Select
								value={selectedModel}
								onValueChange={(value) => setSelectedModel(value as Model)}
								disabled={transcribeMutation.isPending}
							>
								<SelectTrigger className="w-[200px]">
									<SelectValue placeholder="Select model" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="whisper-medium">Whisper Medium</SelectItem>
									<SelectItem value="whisper-large">Whisper Large</SelectItem>
								</SelectContent>
							</Select>
							<Button
								onClick={handleStartTranscription}
								disabled={transcribeMutation.isPending}
							>
								{transcribeMutation.isPending
									? 'Generating...'
									: 'Start Transcription'}
							</Button>
						</div>
						{transcription && (
							<div>
								<h2 className="text-xl font-semibold mb-2">
									Transcription Result
								</h2>
								<Textarea value={transcription} readOnly rows={15} />
							</div>
						)}
						{transcribeMutation.isError && (
							<div className="text-red-500">
								<h3 className="font-bold">Transcription Error</h3>
								<p>{transcribeMutation.error.message}</p>
							</div>
						)}
					</div>
				</TabsContent>
				<TabsContent value="step2">
					<div className="space-y-4 py-4">
						<div className="flex items-center gap-4">
							<Select
								value={selectedAIModel}
								onValueChange={(value) =>
									setSelectedAIModel(value as AIModelId)
								}
								disabled={translateMutation.isPending}
							>
								<SelectTrigger className="w-[200px]">
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
							>
								{translateMutation.isPending
									? 'Translating...'
									: 'Start Translation'}
							</Button>
						</div>
						{translation && (
							<div>
								<h2 className="text-xl font-semibold mb-2">
									Translation Result
								</h2>
								<Textarea value={translation} readOnly rows={15} />
							</div>
						)}
						{translateMutation.isError && (
							<div className="text-red-500">
								<h3 className="font-bold">Translation Error</h3>
								<p>{translateMutation.error.message}</p>
							</div>
						)}
					</div>
				</TabsContent>
			</Tabs>
		</div>
	)
}
