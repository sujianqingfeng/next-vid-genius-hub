'use client'

import { AlertCircle, FileText, Loader2 } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Textarea } from '~/components/ui/textarea'

export type WhisperModel = 'whisper-large' | 'whisper-medium'

interface Step1TranscribeProps {
	selectedModel: WhisperModel
	onModelChange: (model: WhisperModel) => void
	isPending: boolean
	onStart: () => void
	transcription: string
	errorMessage?: string
}

export function Step1Transcribe(props: Step1TranscribeProps) {
	const {
		selectedModel,
		onModelChange,
		isPending,
		onStart,
		transcription,
		errorMessage,
	} = props

	return (
		<div className="space-y-6">
			<div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
				<Select
					value={selectedModel}
					onValueChange={(value) => onModelChange(value as WhisperModel)}
					disabled={isPending}
				>
					<SelectTrigger className="w-full sm:w-[200px]">
						<SelectValue placeholder="Select model" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="whisper-medium">Whisper Medium</SelectItem>
						<SelectItem value="whisper-large">Whisper Large</SelectItem>
					</SelectContent>
				</Select>
				<Button
					onClick={onStart}
					disabled={isPending}
					className="w-full sm:w-auto"
				>
					{isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
					{isPending ? 'Generating...' : 'Start Transcription'}
				</Button>
			</div>

			{transcription && (
				<div className="space-y-3">
					<div className="flex items-center gap-2">
						<h3 className="text-lg font-semibold">Transcription Result</h3>
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

			{errorMessage && (
				<div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
					<AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
					<div>
						<h3 className="font-semibold text-red-800">Transcription Error</h3>
						<p className="text-red-700 text-sm">{errorMessage}</p>
					</div>
				</div>
			)}
		</div>
	)
}
