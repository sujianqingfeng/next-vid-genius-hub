'use client'

import { AlertCircle, Cloud, FileText, Loader2, Server } from 'lucide-react'
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
import type { TranscriptionProvider, WhisperModel } from '~/lib/asr/whisper'

// Client-side model mapping
const getAvailableModels = (provider: TranscriptionProvider): WhisperModel[] => {
	if (provider === 'cloudflare') {
		return ['whisper-tiny-en', 'whisper-large-v3-turbo', 'whisper-medium']
	} else {
		return ['whisper-medium', 'whisper-large']
	}
}

interface Step1TranscribeProps {
	selectedModel: WhisperModel
	selectedProvider: TranscriptionProvider
	onModelChange: (model: WhisperModel) => void
	onProviderChange: (provider: TranscriptionProvider) => void
	isPending: boolean
	onStart: () => void
	transcription: string
	errorMessage?: string
}

export function Step1Transcribe(props: Step1TranscribeProps) {
	const {
		selectedModel,
		selectedProvider,
		onModelChange,
		onProviderChange,
		isPending,
		onStart,
		transcription,
		errorMessage,
	} = props

	const availableModels = getAvailableModels(selectedProvider)

	const getProviderIcon = (provider: TranscriptionProvider) => {
		return provider === 'cloudflare' ? (
			<Cloud className="h-4 w-4" />
		) : (
			<Server className="h-4 w-4" />
		)
	}

	const getProviderLabel = (provider: TranscriptionProvider) => {
		return provider === 'cloudflare' ? 'Cloudflare API' : 'Local Whisper'
	}

	const getModelLabel = (model: WhisperModel) => {
		switch (model) {
			case 'whisper-tiny-en':
				return 'Whisper Tiny (EN)'
			case 'whisper-large-v3-turbo':
				return 'Whisper Large v3 Turbo'
			case 'whisper-medium':
				return 'Whisper Medium'
			case 'whisper-large':
				return 'Whisper Large'
			default:
				return model
		}
	}

	const getModelDescription = (model: WhisperModel) => {
		switch (model) {
			case 'whisper-tiny-en':
				return 'Fast, English only'
			case 'whisper-large-v3-turbo':
				return 'High quality, faster'
			case 'whisper-medium':
				return 'Balanced quality'
			case 'whisper-large':
				return 'Best quality'
			default:
				return ''
		}
	}

	return (
		<div className="space-y-6">
			{/* Provider and Model Selection */}
			<div className="space-y-4">
				<div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
					{/* Provider Selection */}
					<div className="flex flex-col space-y-2">
						<label className="text-sm font-medium text-gray-700">
							Transcription Provider
						</label>
						<Select
							value={selectedProvider}
							onValueChange={(value) => {
								const newProvider = value as TranscriptionProvider
								onProviderChange(newProvider)
								// Auto-select first available model for new provider
								const newModels = getAvailableModels(newProvider)
								if (newModels.length > 0 && !newModels.includes(selectedModel)) {
									onModelChange(newModels[0])
								}
							}}
							disabled={isPending}
						>
							<SelectTrigger className="w-full sm:w-[180px]">
								<SelectValue placeholder="Select provider">
									<div className="flex items-center gap-2">
										{getProviderIcon(selectedProvider)}
										{getProviderLabel(selectedProvider)}
									</div>
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="local">
									<div className="flex items-center gap-2">
										<Server className="h-4 w-4" />
										Local Whisper
									</div>
								</SelectItem>
								<SelectItem value="cloudflare">
									<div className="flex items-center gap-2">
										<Cloud className="h-4 w-4" />
										Cloudflare API
									</div>
								</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Model Selection */}
					<div className="flex flex-col space-y-2">
						<label className="text-sm font-medium text-gray-700">
							Model
						</label>
						<Select
							value={selectedModel}
							onValueChange={(value) => onModelChange(value as WhisperModel)}
							disabled={isPending}
						>
							<SelectTrigger className="w-full sm:w-[200px]">
								<SelectValue placeholder="Select model" />
							</SelectTrigger>
							<SelectContent>
								{availableModels.map((model) => (
									<SelectItem key={model} value={model}>
										<div className="flex flex-col items-start">
											<span className="font-medium">
												{getModelLabel(model)}
											</span>
											<span className="text-xs text-gray-500">
												{getModelDescription(model)}
											</span>
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Start Button */}
					<div className="flex flex-col justify-end">
						<Button
							onClick={onStart}
							disabled={isPending}
							className="w-full sm:w-auto mt-6 sm:mt-0"
						>
							{isPending && (
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
							)}
							{isPending ? 'Generating...' : 'Start Transcription'}
						</Button>
					</div>
				</div>

				{/* Provider Info */}
				<div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
					{selectedProvider === 'cloudflare' ? (
						<div className="flex items-start gap-2">
							<Cloud className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" />
							<div>
								<p className="font-medium text-blue-700">
									Cloudflare Workers AI
								</p>
								<p className="text-blue-600">
									Fast, cloud-based transcription with pay-per-minute pricing.
									Requires Cloudflare API configuration.
								</p>
							</div>
						</div>
					) : (
						<div className="flex items-start gap-2">
							<Server className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-500" />
							<div>
								<p className="font-medium text-green-700">
									Local Whisper
								</p>
								<p className="text-green-600">
									Offline transcription using local Whisper.cpp installation.
									No additional costs but requires local setup.
								</p>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Transcription Result */}
			{transcription && (
				<div className="space-y-3">
					<div className="flex items-center gap-2">
						<FileText className="h-5 w-5 text-green-600" />
						<h3 className="text-lg font-semibold">Transcription Result</h3>
						<Badge variant="secondary" className="text-xs">
							{transcription.split(' ').length} words
						</Badge>
						<Badge variant="outline" className="text-xs">
							{getProviderLabel(selectedProvider)}
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

			{/* Error Message */}
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
