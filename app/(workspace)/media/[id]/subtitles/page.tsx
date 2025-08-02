'use client'

import { useMutation } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Textarea } from '~/components/ui/textarea'
import { queryOrpc as orpc } from '~/lib/orpc/query-client'

type Model = 'whisper-large' | 'whisper-medium'

export default function SubtitlesPage() {
	const [transcription, setTranscription] = useState<string>('')
	const [selectedModel, setSelectedModel] = useState<Model>('whisper-medium')
	const params = useParams()
	const mediaId = params.id as string

	const transcribeMutation = useMutation(
		orpc.transcribe.mutationOptions({
			onSuccess: (data) => {
				if (data.transcription) {
					setTranscription(data.transcription)
				}
			},
		}),
	)

	const handleStartTranscription = () => {
		transcribeMutation.mutate({ mediaId, model: selectedModel })
	}

	return (
		<div className="p-8">
			<h1 className="text-2xl font-bold mb-4">Generate Subtitles</h1>

			<div className="mb-8 flex items-center gap-4">
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
					<h2 className="text-xl font-semibold mb-4">Transcription Result</h2>
					<Textarea value={transcription} readOnly rows={20} />
				</div>
			)}

			{transcribeMutation.isError && (
				<div className="text-red-500">
					<h3 className="font-bold">Error</h3>
					<p>{transcribeMutation.error.message}</p>
				</div>
			)}
		</div>
	)
}
