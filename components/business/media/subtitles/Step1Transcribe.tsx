'use client'

import { AlertCircle, Cloud, Loader2 } from 'lucide-react'
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
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { Label } from '~/components/ui/label'
import type { WhisperModel } from '~/lib/subtitle/config/models'
import { DEFAULT_CHAT_MODEL_ID, type ChatModelId } from '~/lib/ai/models'
import { ChatModelSelect } from '~/components/business/media/subtitles/ChatModelSelect'
import { useEffect, useMemo, useState } from 'react'
import {
	DEFAULT_TRANSCRIPTION_LANGUAGE,
	TRANSCRIPTION_LANGUAGE_OPTIONS,
	type TranscriptionLanguage,
} from '~/lib/subtitle/config/languages'
import { CloudJobProgress } from '~/components/business/jobs/cloud-job-progress'
import { useQuery } from '@tanstack/react-query'
import { queryOrpc } from '~/lib/orpc/query-client'

interface Step1TranscribeProps {
	selectedModel: WhisperModel
	onModelChange: (model: WhisperModel) => void
	isPending: boolean
	onStart: () => void
	transcription: string
	optimizedTranscription?: string
	errorMessage?: string
	// Optimization controls
	mediaId?: string
	canOptimize?: boolean
	isOptimizing?: boolean
	isClearingOptimized?: boolean
	selectedAIModel?: ChatModelId
	onOptimizeModelChange?: (model: ChatModelId) => void
	onOptimize?: (params: {
		pauseThresholdMs: number
		maxSentenceMs: number
		maxChars: number
		lightCleanup?: boolean
		textCorrect?: boolean
	}) => void
	// spelling/grammar correction without changing VTT structure
	// (server will strictly preserve cues and timestamps)
	textCorrectDefault?: boolean
	onRestoreOriginal?: () => void
	selectedLanguage?: TranscriptionLanguage
	onLanguageChange?: (lang: TranscriptionLanguage) => void
	// ASR job status (optional)
	asrStatus?: string
	asrPhase?: string
	asrProgress?: number | null
}

export function Step1Transcribe(props: Step1TranscribeProps) {
	const {
		selectedModel,
		onModelChange,
		isPending,
		onStart,
		transcription,
		errorMessage,
		mediaId,
		canOptimize,
		isOptimizing,
		selectedAIModel,
		onOptimizeModelChange,
		onOptimize,
		isClearingOptimized,
		onRestoreOriginal,
		selectedLanguage,
		onLanguageChange,
		asrStatus,
		asrPhase,
		asrProgress,
	} = props
	const effectiveAIModel = selectedAIModel ?? DEFAULT_CHAT_MODEL_ID
	const asrModelsQuery = useQuery(
		queryOrpc.ai.listModels.queryOptions({
			input: { kind: 'asr', enabledOnly: true },
		}),
	)
	const availableModels = asrModelsQuery.data?.items ?? []
	type AsrCaps = {
		inputFormat?: 'binary' | 'array' | 'base64'
		supportsLanguageHint?: boolean
	}
	const selectedAsrModel = availableModels.find((m) => m.id === selectedModel)
	const asrCaps = selectedAsrModel?.capabilities as AsrCaps | null | undefined
	const supportsLanguageHint = Boolean(asrCaps?.supportsLanguageHint)

	const llmModelsQuery = useQuery(
		queryOrpc.ai.listModels.queryOptions({
			input: { kind: 'llm', enabledOnly: true },
		}),
	)
	const llmModelOptions = (llmModelsQuery.data?.items ?? []).map((m) => ({
		id: m.id as ChatModelId,
		label: m.label,
	}))

	// 使用配置化的模型信息，移除硬编码

	// Optimization params with per-media persistence
	const storageKey = useMemo(
		() => (mediaId ? `subtitleOptimizeParams:${mediaId}` : null),
		[mediaId],
	)
	const [pauseThresholdMs, setPauseThresholdMs] = useState<number>(480)
	const [maxSentenceMs, setMaxSentenceMs] = useState<number>(8000)
	const [maxChars, setMaxChars] = useState<number>(68)
	const [lightCleanup, setLightCleanup] = useState<boolean>(false)
	const [textCorrect, setTextCorrect] = useState<boolean>(false)

	useEffect(() => {
		if (!storageKey) return
		try {
			const raw =
				typeof window !== 'undefined'
					? window.localStorage.getItem(storageKey)
					: null
			if (raw) {
				const obj = JSON.parse(raw)
				if (typeof obj.pauseThresholdMs === 'number')
					setPauseThresholdMs(obj.pauseThresholdMs)
				if (typeof obj.maxSentenceMs === 'number')
					setMaxSentenceMs(obj.maxSentenceMs)
				if (typeof obj.maxChars === 'number') setMaxChars(obj.maxChars)
				if (typeof obj.lightCleanup === 'boolean')
					setLightCleanup(obj.lightCleanup)
				if (typeof obj.textCorrect === 'boolean')
					setTextCorrect(obj.textCorrect)
			}
		} catch {}
	}, [storageKey])

	useEffect(() => {
		if (!storageKey) return
		try {
			if (typeof window !== 'undefined') {
				window.localStorage.setItem(
					storageKey,
					JSON.stringify({
						pauseThresholdMs,
						maxSentenceMs,
						maxChars,
						lightCleanup,
						textCorrect,
					}),
				)
			}
		} catch {}
	}, [
		storageKey,
		pauseThresholdMs,
		maxSentenceMs,
		maxChars,
		lightCleanup,
		textCorrect,
	])

	return (
		<div className="space-y-6">
			{/* Transcription Controls */}
			<div className="space-y-4">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
					<div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
						<div className="space-y-2">
							<label className="text-sm font-medium block">Provider</label>
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Cloud className="h-4 w-4 text-primary" />
								<span>Cloudflare Whisper</span>
							</div>
						</div>

						<div className="space-y-2">
							<label className="text-sm font-medium block">Model</label>
							<Select
								value={selectedModel}
								onValueChange={(value) => onModelChange(value as WhisperModel)}
								disabled={isPending}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select model" />
								</SelectTrigger>
								<SelectContent>
									{availableModels.map((model) => (
										<SelectItem key={model.id} value={model.id}>
											{model.label || model.id}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<label className="text-sm font-medium block">
								Language{' '}
								{selectedModel && !supportsLanguageHint && (
									<span className="text-xs text-muted-foreground">
										(当前模型不支持)
									</span>
								)}
							</label>
							<Select
								value={selectedLanguage ?? DEFAULT_TRANSCRIPTION_LANGUAGE}
								onValueChange={(value) =>
									onLanguageChange?.(
										(value as TranscriptionLanguage) ??
											DEFAULT_TRANSCRIPTION_LANGUAGE,
									)
								}
								disabled={isPending || (selectedModel && !supportsLanguageHint)}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Auto detect" />
								</SelectTrigger>
								<SelectContent>
									{TRANSCRIPTION_LANGUAGE_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								Workers AI 需要单一语言音频；若混用多语言，请显式指定语言。
							</p>
						</div>
					</div>

					<div className="flex w-full items-center gap-3 lg:w-auto">
						<Button
							onClick={onStart}
							disabled={isPending}
							className="w-full min-w-[160px] lg:w-auto"
						>
							{isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
							{isPending ? 'Processing...' : 'Generate'}
						</Button>
						{(asrStatus || typeof asrProgress === 'number') && (
							<CloudJobProgress
								status={asrStatus}
								phase={asrPhase}
								progress={typeof asrProgress === 'number' ? asrProgress : null}
								showPhase={Boolean(asrPhase)}
								showIds={false}
								showCompactLabel={false}
								labels={{ status: 'ASR status', phase: 'Phase' }}
							/>
						)}
					</div>
				</div>

				{/* Pipeline indicator */}
				<div className="space-y-2">
					<div className="text-xs text-muted-foreground flex items-center gap-2">
						<Badge variant="secondary">ASR Pipeline: Cloud</Badge>
						<span>降采样与转写均在 Cloudflare Worker 侧完成。</span>
					</div>
				</div>

				{/* Optimization Controls - Shown when transcription exists */}
				{transcription && canOptimize && (
					<div className="border rounded-lg p-4 bg-muted/30 space-y-4">
						<div className="flex items-center justify-between gap-2">
							<h4 className="font-medium">Optimize Transcription</h4>
							{onRestoreOriginal && props.optimizedTranscription && (
								<Button
									variant="outline"
									size="sm"
									onClick={onRestoreOriginal}
									disabled={!!isClearingOptimized}
								>
									{isClearingOptimized && (
										<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									)}
									Clear Optimized
								</Button>
							)}
						</div>

						<div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
							<div>
								<label className="text-sm font-medium mb-1 block">
									AI Model
								</label>
								<ChatModelSelect
									value={effectiveAIModel}
									onChange={(model) => onOptimizeModelChange?.(model)}
									models={llmModelOptions}
									disabled={isOptimizing}
								/>
							</div>
							<div>
								<label className="text-sm font-medium mb-1 block">
									Pause Threshold (ms)
								</label>
								<Input
									type="number"
									min={0}
									max={5000}
									value={pauseThresholdMs}
									onChange={(e) =>
										setPauseThresholdMs(Number(e.target.value) || 0)
									}
								/>
							</div>
							<div>
								<label className="text-sm font-medium mb-1 block">
									Max Sentence (ms)
								</label>
								<Input
									type="number"
									min={1000}
									max={30000}
									value={maxSentenceMs}
									onChange={(e) =>
										setMaxSentenceMs(Number(e.target.value) || 0)
									}
								/>
							</div>
							<div>
								<label className="text-sm font-medium mb-1 block">
									Max Chars
								</label>
								<Input
									type="number"
									min={10}
									max={160}
									value={maxChars}
									onChange={(e) => setMaxChars(Number(e.target.value) || 0)}
								/>
							</div>
						</div>

						<div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
							<div className="flex items-center gap-4">
								<div className="flex items-center gap-2">
									<Switch
										id="light-cleanup"
										checked={lightCleanup}
										onCheckedChange={setLightCleanup}
									/>
									<Label htmlFor="light-cleanup" className="text-sm">
										Light cleanup
									</Label>
								</div>
								<div className="flex items-center gap-2">
									<Switch
										id="text-correct"
										checked={textCorrect}
										onCheckedChange={setTextCorrect}
									/>
									<Label htmlFor="text-correct" className="text-sm">
										Spelling/grammar
									</Label>
								</div>
							</div>
							<Button
								onClick={() =>
									onOptimize?.({
										pauseThresholdMs,
										maxSentenceMs,
										maxChars,
										lightCleanup,
										textCorrect,
									})
								}
								disabled={isOptimizing}
							>
								{isOptimizing && (
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								)}
								{isOptimizing ? 'Optimizing...' : 'Apply Optimization'}
							</Button>
						</div>
					</div>
				)}

				{/* Optimization unavailable message */}
				{transcription && !canOptimize && (
					<div className="text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg border">
						Optimization unavailable: per-word timings not found. Use Cloudflare
						transcription for optimization support.
					</div>
				)}
			</div>

			{/* Error Message */}
			{errorMessage && (
				<div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
					<AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
					<p className="text-sm text-red-700">{errorMessage}</p>
				</div>
			)}

			{/* Results Section - Moved to bottom */}
			{transcription && (
				<div className="space-y-3">
					<div className="flex items-center gap-2">
						<h3 className="text-lg font-semibold text-foreground">Result</h3>
					</div>

					<div
						className={`grid gap-3 ${props.optimizedTranscription ? 'md:grid-cols-2' : 'grid-cols-1'}`}
					>
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<h4 className="text-sm font-medium text-muted-foreground">
									Original
								</h4>
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

						{props.optimizedTranscription && (
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<h4 className="text-sm font-medium text-muted-foreground">
										Optimized
									</h4>
									<Badge variant="secondary" className="text-xs">
										{props.optimizedTranscription.split(' ').length} words
									</Badge>
								</div>
								<Textarea
									value={props.optimizedTranscription}
									readOnly
									rows={8}
									className="font-mono text-sm"
								/>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	)
}
