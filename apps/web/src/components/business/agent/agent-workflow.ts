'use client'

export type AgentWorkflowStep =
	| 'download'
	| 'asr'
	| 'optimize'
	| 'translate'
	| 'render'
export type AgentWorkflowMode = 'confirm' | 'auto'

export type AgentWorkflowSettings = {
	autoSuggestNext: boolean
	defaultMode: AgentWorkflowMode
	perStepMode?: Partial<Record<AgentWorkflowStep, AgentWorkflowMode>>
	auto: {
		delayMs: number
		maxEstimatedPointsPerAction?: number
		requireConfirmOnUnknownCost: boolean
	}
}

export const DEFAULT_AGENT_WORKFLOW_SETTINGS: AgentWorkflowSettings = {
	autoSuggestNext: true,
	defaultMode: 'confirm',
	auto: {
		delayMs: 2000,
		maxEstimatedPointsPerAction: 50,
		requireConfirmOnUnknownCost: true,
	},
}

export function resolveStepMode(
	settings: AgentWorkflowSettings,
	step: AgentWorkflowStep,
): AgentWorkflowMode {
	return settings.perStepMode?.[step] ?? settings.defaultMode
}
