'use client'

import { AlertCircle, Loader2, Video } from 'lucide-react'
import { Button } from '~/components/ui/button'

interface Step3RenderProps {
	isRendering: boolean
	onStart: () => void
	errorMessage?: string
}

export function Step3Render(props: Step3RenderProps) {
	const { isRendering, onStart, errorMessage } = props

	return (
		<div className="space-y-6">
			<div className="text-center space-y-4">
				<div className="p-6 bg-muted/50 rounded-lg">
					<Video className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
					<h3 className="text-lg font-semibold mb-2">Ready to Render</h3>
					<p className="text-muted-foreground mb-4">
						Your video will be rendered with embedded subtitles. This process
						may take several minutes.
					</p>
					<Button onClick={onStart} disabled={isRendering} size="lg">
						{isRendering && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
						{isRendering ? 'Rendering...' : 'Start Rendering'}
					</Button>
				</div>
			</div>

			{errorMessage && (
				<div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
					<AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
					<div>
						<h3 className="font-semibold text-red-800">Rendering Error</h3>
						<p className="text-red-700 text-sm">{errorMessage}</p>
					</div>
				</div>
			)}
		</div>
	)
}
