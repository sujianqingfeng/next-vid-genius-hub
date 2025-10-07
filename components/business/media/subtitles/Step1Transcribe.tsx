'use client'

import { AlertCircle, Cloud, Loader2, Server } from 'lucide-react'
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
import {
	getAvailableModels,
	getModelLabel,
} from '~/lib/subtitle/config/models'
import type { TranscriptionProvider, WhisperModel } from '~/lib/subtitle/config/models'

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

	// 使用配置化的模型信息，移除硬编码

	return (
		<div className="space-y-6">
			{/* Configuration Section */}
			<div className="flex flex-col sm:flex-row gap-3 items-end">
				<div className="min-w-[140px]">
					<label className="text-sm font-medium mb-2 block">Provider</label>
					<Select
						value={selectedProvider}
						onValueChange={(value) => {
							const newProvider = value as TranscriptionProvider
							onProviderChange(newProvider)
							const newModels = getAvailableModels(newProvider)
							if (newModels.length > 0 && !newModels.includes(selectedModel)) {
								onModelChange(newModels[0])
							}
						}}
						disabled={isPending}
					>
						<SelectTrigger>
							<SelectValue>
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
									Local
								</div>
							</SelectItem>
							<SelectItem value="cloudflare">
								<div className="flex items-center gap-2">
									<Cloud className="h-4 w-4" />
									Cloudflare
								</div>
							</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="min-w-[140px]">
					<label className="text-sm font-medium mb-2 block">Model</label>
					<Select
						value={selectedModel}
						onValueChange={(value) => onModelChange(value as WhisperModel)}
						disabled={isPending}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select model" />
						</SelectTrigger>
						<SelectContent>
							{availableModels.map((model) => (
								<SelectItem key={model} value={model}>
									{getModelLabel(model)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<Button
					onClick={onStart}
					disabled={isPending}
					className="min-w-[140px]"
				>
					{isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
					{isPending ? 'Processing...' : 'Generate'}
				</Button>
			</div>

			
			{/* Results Section */}
			{transcription && (
				<div className="space-y-3">
					<div className="flex items-center gap-2">
						<h3 className="font-semibold text-gray-900">Result</h3>
						<Badge variant="secondary" className="text-xs">
							{transcription.split(' ').length} words
						</Badge>
					</div>
					<Textarea
						value={transcription}
						readOnly
						rows={8}
						className="font-mono text-sm"
					/>
				</div>
			)}

			{/* Error Message */}
			{errorMessage && (
				<div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
					<AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
					<p className="text-sm text-red-700">{errorMessage}</p>
				</div>
			)}
		</div>
	)
}
