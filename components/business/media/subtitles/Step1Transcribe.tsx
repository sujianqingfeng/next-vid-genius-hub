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
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { Label } from '~/components/ui/label'
import {
	getAvailableModels,
	getModelLabel,
} from '~/lib/subtitle/config/models'
import type {
	TranscriptionProvider,
	WhisperModel,
} from '~/lib/subtitle/config/models'
import { type ChatModelId } from '~/lib/ai/models'
import { ChatModelSelect } from '~/components/business/media/subtitles/ChatModelSelect'
import type { DownsampleBackend } from '~/lib/subtitle/types'
import { useEffect, useMemo, useState } from 'react'

interface Step1TranscribeProps {
	selectedModel: WhisperModel
	selectedProvider: TranscriptionProvider
	onModelChange: (model: WhisperModel) => void
	onProviderChange: (provider: TranscriptionProvider) => void
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
  onOptimize?: (params: { pauseThresholdMs: number; maxSentenceMs: number; maxChars: number; lightCleanup?: boolean; textCorrect?: boolean }) => void
  // spelling/grammar correction without changing VTT structure
  // (server will strictly preserve cues and timestamps)
  textCorrectDefault?: boolean
  onRestoreOriginal?: () => void
  // Downsample backend selection
  downsampleBackend?: DownsampleBackend
  onDownsampleBackendChange?: (v: DownsampleBackend) => void
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
      mediaId,
      canOptimize,
      isOptimizing,
      selectedAIModel,
      onOptimizeModelChange,
      onOptimize,
      isClearingOptimized,
      onRestoreOriginal,
      downsampleBackend,
      onDownsampleBackendChange,
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

  // Optimization params with per-media persistence
  const storageKey = useMemo(() => (mediaId ? `subtitleOptimizeParams:${mediaId}` : null), [mediaId])
  const [pauseThresholdMs, setPauseThresholdMs] = useState<number>(480)
  const [maxSentenceMs, setMaxSentenceMs] = useState<number>(8000)
  const [maxChars, setMaxChars] = useState<number>(68)
  const [lightCleanup, setLightCleanup] = useState<boolean>(false)
  const [textCorrect, setTextCorrect] = useState<boolean>(false)
  const [downBackend, setDownBackend] = useState<DownsampleBackend>(downsampleBackend || 'auto')

  useEffect(() => {
    if (!storageKey) return
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null
      if (raw) {
        const obj = JSON.parse(raw)
        if (typeof obj.pauseThresholdMs === 'number') setPauseThresholdMs(obj.pauseThresholdMs)
        if (typeof obj.maxSentenceMs === 'number') setMaxSentenceMs(obj.maxSentenceMs)
        if (typeof obj.maxChars === 'number') setMaxChars(obj.maxChars)
        if (typeof obj.lightCleanup === 'boolean') setLightCleanup(obj.lightCleanup)
        if (typeof obj.textCorrect === 'boolean') setTextCorrect(obj.textCorrect)
        if (obj.downsampleBackend === 'auto' || obj.downsampleBackend === 'local' || obj.downsampleBackend === 'cloud') {
          setDownBackend(obj.downsampleBackend)
        }
      }
    } catch {}
  }, [storageKey])

  useEffect(() => {
    if (!storageKey) return
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({ pauseThresholdMs, maxSentenceMs, maxChars, lightCleanup, textCorrect, downsampleBackend: downBackend }),
        )
      }
    } catch {}
  }, [storageKey, pauseThresholdMs, maxSentenceMs, maxChars, lightCleanup, textCorrect, downBackend])

  useEffect(() => {
    if (downsampleBackend && downsampleBackend !== downBackend) setDownBackend(downsampleBackend)
  }, [downsampleBackend, downBackend])

	return (
		<div className="space-y-6">
			{/* Transcription Controls */}
			<div className="space-y-4">
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

            {/* Downsample backend selector */}
            <div className="min-w-[160px]">
              <label className="text-sm font-medium mb-2 block">Downsample</label>
              <Select
                value={downBackend}
                onValueChange={(v) => {
                  const val = v as DownsampleBackend
                  setDownBackend(val)
                  onDownsampleBackendChange?.(val)
                }}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select downsample backend" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="cloud">Cloud</SelectItem>
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

				{/* Pipeline indicator */}
				{selectedProvider === 'cloudflare' && (
					<div className="text-xs text-muted-foreground flex items-center gap-2">
						{downBackend === 'cloud' ? (
							<>
								<Badge variant="secondary">ASR Pipeline: Cloud</Badge>
								<span>转写在 Cloudflare Worker 侧完成（降采样 + Whisper）。</span>
							</>
						) : downBackend === 'local' ? (
							<>
								<Badge variant="outline">ASR Pipeline: Next</Badge>
								<span>由 Next 直连 Workers AI（需要本地 CLOUDFLARE_* 令牌）。</span>
							</>
						) : (
							<>
								<Badge variant="secondary">ASR Pipeline: Auto</Badge>
								<span>Serverless 环境将走 Cloud；本地可能走 Next。</span>
							</>
						)}
					</div>
				)}

				{/* Optimization Controls - Shown when transcription exists */}
				{transcription && canOptimize && (
					<div className="border rounded-lg p-4 bg-muted/30 space-y-3">
						<div className="flex items-center justify-between">
							<h4 className="font-medium">Optimize Transcription</h4>
							{onRestoreOriginal && props.optimizedTranscription && (
								<Button
									variant="outline"
									size="sm"
									onClick={onRestoreOriginal}
									disabled={!!isClearingOptimized}
								>
									{isClearingOptimized && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
									Clear Optimized
								</Button>
							)}
						</div>

						<div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
					<div>
						<label className="text-sm font-medium mb-1 block">AI Model</label>
						<ChatModelSelect
							value={selectedAIModel}
							onChange={(model) => onOptimizeModelChange?.(model)}
							disabled={isOptimizing}
						/>
					</div>
							<div>
								<label className="text-sm font-medium mb-1 block">Pause Threshold (ms)</label>
								<Input
									type="number"
									min={0}
									max={5000}
									value={pauseThresholdMs}
									onChange={(e) => setPauseThresholdMs(Number(e.target.value) || 0)}
								/>
							</div>
							<div>
								<label className="text-sm font-medium mb-1 block">Max Sentence (ms)</label>
								<Input
									type="number"
									min={1000}
									max={30000}
									value={maxSentenceMs}
									onChange={(e) => setMaxSentenceMs(Number(e.target.value) || 0)}
								/>
							</div>
							<div>
								<label className="text-sm font-medium mb-1 block">Max Chars</label>
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
									<Switch id="light-cleanup" checked={lightCleanup} onCheckedChange={setLightCleanup} />
									<Label htmlFor="light-cleanup" className="text-sm">Light cleanup</Label>
								</div>
								<div className="flex items-center gap-2">
									<Switch id="text-correct" checked={textCorrect} onCheckedChange={setTextCorrect} />
									<Label htmlFor="text-correct" className="text-sm">Spelling/grammar</Label>
								</div>
							</div>
							<Button
								onClick={() => onOptimize?.({ pauseThresholdMs, maxSentenceMs, maxChars, lightCleanup, textCorrect })}
								disabled={isOptimizing}
							>
								{isOptimizing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
								{isOptimizing ? 'Optimizing...' : 'Apply Optimization'}
							</Button>
						</div>
					</div>
				)}

				{/* Optimization unavailable message */}
				{transcription && !canOptimize && (
					<div className="text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg border">
						Optimization unavailable: per-word timings not found. Use Cloudflare transcription for optimization support.
					</div>
				)}
			</div>

			{/* Error Message */}
			{errorMessage && (
				<div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
					<AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
					<p className="text-sm text-red-700">{errorMessage}</p>
				</div>
			)}

			{/* Results Section - Moved to bottom */}
			{transcription && (
				<div className="space-y-3">
					<div className="flex items-center gap-2">
						<h3 className="font-semibold text-gray-900">Result</h3>
					</div>

					<div className={`grid gap-3 ${props.optimizedTranscription ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<h4 className="text-sm font-medium text-muted-foreground">Original</h4>
								<Badge variant="secondary" className="text-xs">{transcription.split(' ').length} words</Badge>
							</div>
							<Textarea value={transcription} readOnly rows={8} className="font-mono text-sm" />
						</div>

						{props.optimizedTranscription && (
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<h4 className="text-sm font-medium text-muted-foreground">Optimized</h4>
									<Badge variant="secondary" className="text-xs">{props.optimizedTranscription.split(' ').length} words</Badge>
								</div>
								<Textarea value={props.optimizedTranscription} readOnly rows={8} className="font-mono text-sm" />
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	)
}
