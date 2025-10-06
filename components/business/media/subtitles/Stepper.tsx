'use client'

import { CheckCircle, FileText, Languages, Play, Video } from 'lucide-react'
import { cn } from '~/lib/utils'

export type StepId = 'step1' | 'step2' | 'step3' | 'step4'

interface StepperProps {
	activeTab: StepId
	hasTranscription: boolean
	hasTranslation: boolean
	hasRenderedVideo: boolean
	onChange: (step: StepId) => void
	orientation?: 'horizontal' | 'vertical'
}

export function Stepper(props: StepperProps) {
	const {
		activeTab,
		hasTranscription,
		hasTranslation,
		hasRenderedVideo,
		onChange,
		orientation = 'horizontal',
	} = props

	const steps: Array<{
		id: StepId
		label: string
		icon: React.ComponentType<{ className?: string }>
		completed: boolean
		enabled: boolean
	}> = [
		{
			id: 'step1',
			label: 'Transcribe',
			icon: FileText,
			completed: hasTranscription,
			enabled: true,
		},
		{
			id: 'step2',
			label: 'Translate',
			icon: Languages,
			completed: hasTranslation,
			enabled: hasTranscription,
		},
		{
			id: 'step3',
			label: 'Render',
			icon: Video,
			completed: hasRenderedVideo,
			enabled: hasTranslation,
		},
		{
			id: 'step4',
			label: 'Preview',
			icon: Play,
			completed: hasRenderedVideo,
			enabled: hasRenderedVideo,
		},
	]

	if (orientation === 'vertical') {
		return (
			<div className="w-full">
				<div className="relative space-y-3">
					{steps.map((step, index) => {
						const Icon = step.icon
						const isActive = activeTab === step.id
						const isLastStep = index === steps.length - 1

						return (
							<div key={step.id} className="relative flex items-start">
								{/* Connection Line */}
								{!isLastStep && (
									<div
										className={cn(
											'absolute left-4 top-6 w-0.5 h-4',
											step.completed ? 'bg-green-500' : 'bg-muted',
										)}
									/>
								)}

								{/* Step Button */}
								<button
									type="button"
									disabled={!step.enabled}
									aria-current={isActive ? 'step' : undefined}
									onClick={() => step.enabled && onChange(step.id)}
									className={cn(
										'relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-200 flex-shrink-0',
										step.completed
											? 'bg-green-500 border-green-500 text-white shadow-sm'
											: isActive
												? 'bg-primary border-primary text-primary-foreground shadow-md'
												: 'bg-background border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50',
										!step.enabled &&
											!isActive &&
											!step.completed &&
											'opacity-50 cursor-not-allowed',
									)}
								>
									{step.completed ? (
										<CheckCircle className="h-4 w-4" />
									) : (
										<Icon className="h-3 w-3" />
									)}
								</button>

								{/* Step Label */}
								<div className="ml-3 py-1 flex-1">
									<p
										className={cn(
											'text-xs font-medium leading-tight',
											step.completed
												? 'text-green-700'
												: isActive
													? 'text-primary font-semibold'
													: 'text-muted-foreground',
											!step.enabled && 'opacity-50',
										)}
									>
										{step.label}
									</p>
								</div>
							</div>
						)
					})}
				</div>
			</div>
		)
	}

	return (
		<div className="w-full overflow-x-auto">
			<div className="flex items-center justify-center py-2">
				<div className="flex items-center gap-4 sm:gap-6">
					{steps.map((step, index) => {
						const Icon = step.icon
						const isActive = activeTab === step.id
						return (
							<div key={step.id} className="flex items-center">
								<button
									type="button"
									disabled={!step.enabled}
									aria-current={isActive ? 'step' : undefined}
									onClick={() => step.enabled && onChange(step.id)}
									className={cn(
										'flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors',
										step.completed
											? 'bg-green-500 border-green-500 text-white'
											: isActive
												? 'bg-primary border-primary text-primary-foreground'
												: 'bg-muted border-muted-foreground text-muted-foreground',
										!step.enabled &&
											!isActive &&
											!step.completed &&
											'opacity-60 cursor-not-allowed',
									)}
								>
									{step.completed ? (
										<CheckCircle className="h-5 w-5" />
									) : (
										<Icon className="h-5 w-5" />
									)}
								</button>
								<span
									className={cn(
										'ml-2 text-sm font-medium',
										step.completed
											? 'text-green-600'
											: isActive
												? 'text-primary'
												: 'text-muted-foreground',
									)}
								>
									{step.label}
								</span>
								{index < steps.length - 1 && (
									<div
										className={cn(
											'w-8 sm:w-12 h-0.5 mx-2 sm:mx-4',
											step.completed ? 'bg-green-500' : 'bg-muted',
										)}
									/>
								)}
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}
