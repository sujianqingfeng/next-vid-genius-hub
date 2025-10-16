'use client'

import { AlertCircle, Loader2, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { type ChatModelId, ChatModelIds } from '~/lib/ai/models'
import { parseVttCues } from '~/lib/subtitle/utils/vtt'

interface Step2TranslateProps {
	selectedAIModel: ChatModelId
	onModelChange: (model: ChatModelId) => void
	isPending: boolean
	onStart: () => void
	translation: string
	onDeleteCue?: (index: number) => void
	canStart: boolean
	errorMessage?: string
}

export function Step2Translate(props: Step2TranslateProps) {
	const {
		selectedAIModel,
		onModelChange,
		isPending,
		onStart,
		translation,
		onDeleteCue,
		canStart,
		errorMessage,
	} = props

	const cues = useMemo(
		() => (translation ? parseVttCues(translation) : []),
		[translation],
	)

	return (
		<div className="flex flex-col h-full gap-6">
			<div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
				<Select
					value={selectedAIModel}
					onValueChange={(value) => onModelChange(value as ChatModelId)}
					disabled={isPending}
				>
					<SelectTrigger className="w-full sm:w-[200px]">
						<SelectValue placeholder="Select model" />
					</SelectTrigger>
					<SelectContent>
						{ChatModelIds.map((id) => (
							<SelectItem key={id} value={id}>
								{id}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					onClick={onStart}
					disabled={isPending || !canStart}
					className="w-full sm:w-auto"
				>
					{isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
					{isPending ? 'Translating...' : 'Start Translation'}
				</Button>
			</div>

			{translation && (
				<div className="flex flex-col flex-1 gap-3 min-h-0">
					<div className="flex items-center gap-2">
						<h3 className="text-lg font-semibold">Translation Result</h3>
						<Badge variant="secondary" className="text-xs">
							{cues.length} cues
						</Badge>
					</div>
					<div className="flex-1 overflow-y-auto rounded-md border bg-background">
						{cues.map((cue, idx) => (
							<div
								key={`${cue.start}-${cue.end}-${idx}`}
								className="flex items-start justify-between gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors"
							>
								<div className="flex-1 min-w-0">
									<div className="text-xs text-muted-foreground font-mono">{`${cue.start} --> ${cue.end}`}</div>
									<div className="mt-2 space-y-1">
										{cue.lines.map((l, i) => (
											<div key={i} className="text-sm font-mono break-words">
												{l}
											</div>
										))}
									</div>
								</div>
								{onDeleteCue && (
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => onDeleteCue(idx)}
										aria-label="Delete cue"
										title="Delete this subtitle"
										className="text-destructive hover:text-destructive flex-shrink-0"
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								)}
							</div>
						))}
					</div>
				</div>
			)}

			{errorMessage && (
				<div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
					<AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
					<div>
						<h3 className="font-semibold text-red-800">Translation Error</h3>
						<p className="text-red-700 text-sm">{errorMessage}</p>
					</div>
				</div>
			)}
		</div>
	)
}
