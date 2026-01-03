'use client'

import * as React from 'react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { useChat } from '@ai-sdk/react'
import { Loader2, Send, Settings, Trash2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import {
	AgentActionCard,
	type AgentAction,
} from '~/components/business/agent/agent-action-card'
import {
	DEFAULT_AGENT_WORKFLOW_SETTINGS,
	type AgentWorkflowSettings,
} from '~/components/business/agent/agent-workflow'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { getUserFriendlyErrorMessage } from '~/lib/errors/client'
import { useLocalStorageState } from '~/lib/hooks/useLocalStorageState'
import { useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'
import { cn } from '~/lib/utils'

const STORAGE_KEY = 'agentChat:uiMessages'
const STORAGE_VERSION = 2
const STORAGE_MODEL_KEY = 'agentChat:modelId'
const STORAGE_MODEL_VERSION = 1
const STORAGE_SETTINGS_KEY = 'agentChat:workflowSettings'
const STORAGE_SETTINGS_VERSION = 1
const STORAGE_ACTIONS_KEY = 'agentChat:actionsById'
const STORAGE_ACTIONS_VERSION = 1

function createId() {
	return (
		globalThis.crypto?.randomUUID?.() ?? `msg_${Date.now()}_${Math.random()}`
	)
}

function toUiMessageFromLegacy(item: any): UIMessage | null {
	if (!item || typeof item !== 'object') return null
	const role =
		item.role === 'assistant'
			? 'assistant'
			: item.role === 'user'
				? 'user'
				: null
	if (!role) return null
	const content = typeof item.content === 'string' ? item.content : ''
	if (!content.trim()) return null
	return {
		id: typeof item.id === 'string' ? item.id : createId(),
		role,
		parts: [{ type: 'text', text: content }],
	}
}

export function AgentChatPage() {
	const t = useTranslations('Agent')

	const [storedMessages, setStoredMessages, removeStoredMessages] =
		useLocalStorageState<UIMessage[]>(STORAGE_KEY, {
			version: STORAGE_VERSION,
			defaultValue: [],
			migrate: (stored) => {
				if (!Array.isArray(stored)) return []
				return stored
					.map((x: any) => {
						if (x && typeof x === 'object' && Array.isArray(x.parts))
							return x as UIMessage
						return toUiMessageFromLegacy(x)
					})
					.filter(Boolean) as UIMessage[]
			},
		})

	const [modelId, setModelId] = useLocalStorageState<string | null>(
		STORAGE_MODEL_KEY,
		{
			version: STORAGE_MODEL_VERSION,
			defaultValue: null,
			migrate: (stored) => {
				if (typeof stored === 'string') return stored.trim() || null
				return null
			},
		},
	)

	const [settings, setSettings, removeSettings] =
		useLocalStorageState<AgentWorkflowSettings>(STORAGE_SETTINGS_KEY, {
			version: STORAGE_SETTINGS_VERSION,
			defaultValue: DEFAULT_AGENT_WORKFLOW_SETTINGS,
			migrate: (stored) => {
				if (!stored || typeof stored !== 'object')
					return DEFAULT_AGENT_WORKFLOW_SETTINGS
				const s = stored as any
				return {
					...DEFAULT_AGENT_WORKFLOW_SETTINGS,
					...s,
					auto: {
						...DEFAULT_AGENT_WORKFLOW_SETTINGS.auto,
						...(s.auto && typeof s.auto === 'object' ? s.auto : {}),
					},
				} as AgentWorkflowSettings
			},
		})

	const [actionsById, setActionsById, removeActionsById] = useLocalStorageState<
		Record<string, AgentAction>
	>(STORAGE_ACTIONS_KEY, {
		version: STORAGE_ACTIONS_VERSION,
		defaultValue: {},
		migrate: (stored) => {
			if (!stored || typeof stored !== 'object') return {}
			return stored as Record<string, AgentAction>
		},
	})

	const scrollRef = React.useRef<HTMLDivElement | null>(null)

	React.useEffect(() => {
		const el = scrollRef.current
		if (!el) return
		el.scrollTop = el.scrollHeight
	}, [storedMessages.length])

	const llmModelsQuery = useQuery(
		queryOrpc.ai.listModels.queryOptions({
			input: { kind: 'llm', enabledOnly: true },
		}),
	)
	const llmDefaultQuery = useQuery(
		queryOrpc.ai.getDefaultModel.queryOptions({ input: { kind: 'llm' } }),
	)

	React.useEffect(() => {
		if (modelId) return
		const id = llmDefaultQuery.data?.model?.id
		if (!id) return
		setModelId(id)
	}, [llmDefaultQuery.data?.model?.id, modelId, setModelId])

	React.useEffect(() => {
		const items = llmModelsQuery.data?.items ?? []
		if (items.length === 0) return
		if (modelId) return
		if (llmDefaultQuery.data?.model?.id) return
		setModelId(items[0]!.id)
	}, [
		llmDefaultQuery.data?.model?.id,
		llmModelsQuery.data?.items,
		modelId,
		setModelId,
	])

	React.useEffect(() => {
		const items = llmModelsQuery.data?.items ?? []
		if (items.length === 0) return
		if (!modelId) return
		if (items.some((m) => m.id === modelId)) return
		setModelId(items[0]!.id)
	}, [llmModelsQuery.data?.items, modelId, setModelId])

	const transport = React.useMemo(() => {
		return new DefaultChatTransport({
			api: '/api/agent/chat-stream',
			credentials: 'same-origin',
			body: () => (modelId ? { modelId } : {}),
		})
	}, [modelId])

	const chat = useChat({
		transport,
		messages: storedMessages,
		onError: (err) => {
			const msg = getUserFriendlyErrorMessage(err)
			console.error('[agent.chat] error', msg)
		},
	})

	React.useEffect(() => {
		setStoredMessages(chat.messages)
	}, [chat.messages, setStoredMessages])

	React.useEffect(() => {
		const next: Record<string, AgentAction> = {}
		for (const m of chat.messages) {
			for (const part of m.parts ?? []) {
				if (typeof part?.type === 'string' && part.type.startsWith('tool-')) {
					const p = part as any
					if (p.state !== 'output-available') continue
					const out = p.output
					const action = out?.action
					const actionId =
						typeof out?.actionId === 'string'
							? out.actionId
							: typeof action?.id === 'string'
								? action.id
								: null
					if (actionId && action && typeof action === 'object') {
						next[actionId] = action as AgentAction
					}
				}
			}
		}
		if (Object.keys(next).length === 0) return
		setActionsById((prev) => ({ ...prev, ...next }))
	}, [chat.messages, setActionsById])

	const [draft, setDraft] = React.useState('')
	const canSend = chat.status === 'ready' && draft.trim().length > 0
	const suggestRetryRef = React.useRef<Map<string, number>>(new Map())

	const send = React.useCallback(() => {
		const text = draft.trim()
		if (!text) return
		if (chat.status !== 'ready') return
		setDraft('')
		void chat.sendMessage({ text })
	}, [chat, draft])

	const suggestNext = React.useCallback(
		(mediaId: string) => {
			if (!settings.autoSuggestNext) return
			const retryKey = `media_${mediaId}`
			const alreadyHas = Object.values(actionsById).some((a) => {
				if (!a || typeof a !== 'object') return false
				const p: any = a.params
				return (
					(a.status === 'proposed' || a.status === 'running') &&
					typeof p?.mediaId === 'string' &&
					p.mediaId === mediaId
				)
			})
			if (alreadyHas) return

			void (async () => {
				try {
					const res = await fetch('/api/agent/actions/suggest-next', {
						method: 'POST',
						credentials: 'same-origin',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ mediaId }),
					})
					const json = await res.json().catch(() => ({}))
					const action = (json as any)?.action as AgentAction | null
					if (!action || typeof action.id !== 'string') {
						const prev = suggestRetryRef.current.get(retryKey) ?? 0
						if (prev < 5) {
							suggestRetryRef.current.set(retryKey, prev + 1)
							setTimeout(() => suggestNext(mediaId), 1200)
						}
						return
					}
					suggestRetryRef.current.delete(retryKey)
					setActionsById((prev) => ({ ...prev, [action.id]: action }))
					const toolNameByKind: Record<string, string> = {
						download: 'proposeDownload',
						asr: 'proposeAsr',
						optimize: 'proposeOptimize',
						translate: 'proposeTranslate',
						render: 'proposeRender',
					}
					const toolName = toolNameByKind[action.kind]
					if (!toolName) return
					const toolCallId = `suggest_${action.id}`
					const input = (action.params ?? {}) as any
					chat.setMessages((prev) => [
						...prev,
						{
							id: createId(),
							role: 'assistant',
							parts: [
								{
									type: `tool-${toolName}`,
									toolCallId,
									state: 'output-available',
									input,
									output: { actionId: action.id, action },
								},
							],
						} as UIMessage,
					])
				} catch {
					// best-effort
				}
			})()
		},
		[actionsById, chat, settings.autoSuggestNext, setActionsById],
	)

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background font-sans text-foreground selection:bg-primary selection:text-primary-foreground">
			<div className="border-b border-border bg-card">
				<div className="mx-auto max-w-[1200px] px-4 py-4 sm:px-6 lg:px-8">
					<div className="flex items-center justify-between gap-4">
						<div className="min-w-0">
							<div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
								{t('header.breadcrumb')}
							</div>
							<h1 className="truncate font-mono text-xl font-bold uppercase tracking-tight">
								{t('header.title')}
							</h1>
						</div>

						<div className="flex items-center gap-2">
							<Select
								value={modelId ?? ''}
								onValueChange={(v) => setModelId(v)}
								disabled={
									chat.status !== 'ready' ||
									(llmModelsQuery.data?.items ?? []).length === 0
								}
							>
								<SelectTrigger className="h-9 w-[220px] rounded-none font-mono text-xs uppercase tracking-wider">
									<SelectValue placeholder={t('fields.modelPlaceholder')} />
								</SelectTrigger>
								<SelectContent className="rounded-none">
									{(llmModelsQuery.data?.items ?? []).map((m) => (
										<SelectItem
											key={m.id}
											value={m.id}
											className="font-mono text-sm"
										>
											{String(m.label ?? m.id)
												.toUpperCase()
												.replace(/\s+/g, '_')}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							<Select
								value={settings.defaultMode}
								onValueChange={(v) =>
									setSettings((prev) => ({ ...prev, defaultMode: v as any }))
								}
								disabled={chat.status !== 'ready'}
							>
								<SelectTrigger className="h-9 w-[160px] rounded-none font-mono text-xs uppercase tracking-wider">
									<SelectValue placeholder={t('actions.modeLabel')} />
								</SelectTrigger>
								<SelectContent className="rounded-none">
									<SelectItem value="confirm" className="font-mono text-sm">
										{t('actions.mode.confirm')}
									</SelectItem>
									<SelectItem value="auto" className="font-mono text-sm">
										{t('actions.mode.auto')}
									</SelectItem>
								</SelectContent>
							</Select>

							<Dialog>
								<DialogTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="h-9 rounded-none font-mono text-xs uppercase tracking-wider"
										type="button"
										disabled={chat.status !== 'ready'}
									>
										<Settings className="h-4 w-4" />
										{t('actions.settings')}
									</Button>
								</DialogTrigger>
								<DialogContent className="max-w-[560px] rounded-none">
									<DialogHeader>
										<DialogTitle className="font-mono uppercase tracking-wider">
											{t('actions.settingsTitle')}
										</DialogTitle>
										<DialogDescription className="font-mono text-xs">
											{t('actions.settingsDesc')}
										</DialogDescription>
									</DialogHeader>

									<div className="grid gap-4">
										<div className="grid gap-2">
											<Label className="font-mono text-xs uppercase tracking-wider">
												{t('actions.perStepMode')}
											</Label>
											<div className="grid gap-2">
												{(
													[
														'download',
														'asr',
														'optimize',
														'translate',
														'render',
													] as const
												).map((step) => {
													const v = settings.perStepMode?.[step] ?? 'inherit'
													return (
														<div
															key={step}
															className="flex items-center justify-between gap-3"
														>
															<div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
																{t(`actions.kind.${step}` as any)}
															</div>
															<Select
																value={v}
																onValueChange={(next) => {
																	setSettings((prev) => {
																		const per = { ...prev.perStepMode } as any
																		if (next === 'inherit') {
																			delete per[step]
																		} else {
																			per[step] = next
																		}
																		const has = Object.keys(per).length > 0
																		return {
																			...prev,
																			perStepMode: has ? per : undefined,
																		}
																	})
																}}
															>
																<SelectTrigger className="h-9 w-[180px] rounded-none font-mono text-xs uppercase tracking-wider">
																	<SelectValue />
																</SelectTrigger>
																<SelectContent className="rounded-none">
																	<SelectItem
																		value="inherit"
																		className="font-mono text-sm"
																	>
																		{t('actions.inherit')}
																	</SelectItem>
																	<SelectItem
																		value="confirm"
																		className="font-mono text-sm"
																	>
																		{t('actions.mode.confirm')}
																	</SelectItem>
																	<SelectItem
																		value="auto"
																		className="font-mono text-sm"
																	>
																		{t('actions.mode.auto')}
																	</SelectItem>
																</SelectContent>
															</Select>
														</div>
													)
												})}
											</div>
										</div>

										<div className="grid gap-2">
											<Label className="font-mono text-xs uppercase tracking-wider">
												{t('actions.autoDelayMs')}
											</Label>
											<Input
												className="rounded-none font-mono text-xs"
												value={String(settings.auto.delayMs)}
												onChange={(e) => {
													const n = Number(e.target.value)
													setSettings((prev) => ({
														...prev,
														auto: {
															...prev.auto,
															delayMs: Number.isFinite(n)
																? Math.max(0, n)
																: prev.auto.delayMs,
														},
													}))
												}}
											/>
										</div>

										<div className="grid gap-2">
											<Label className="font-mono text-xs uppercase tracking-wider">
												{t('actions.autoMaxPoints')}
											</Label>
											<Input
												className="rounded-none font-mono text-xs"
												value={String(
													settings.auto.maxEstimatedPointsPerAction ?? '',
												)}
												onChange={(e) => {
													const raw = e.target.value.trim()
													const n = raw ? Number(raw) : NaN
													setSettings((prev) => ({
														...prev,
														auto: {
															...prev.auto,
															maxEstimatedPointsPerAction: raw
																? Number.isFinite(n)
																	? Math.max(0, n)
																	: prev.auto.maxEstimatedPointsPerAction
																: undefined,
														},
													}))
												}}
											/>
										</div>

										<div className="grid gap-2">
											<Label className="font-mono text-xs uppercase tracking-wider">
												{t('actions.requireConfirmUnknownCost')}
											</Label>
											<Select
												value={
													settings.auto.requireConfirmOnUnknownCost
														? 'yes'
														: 'no'
												}
												onValueChange={(v) =>
													setSettings((prev) => ({
														...prev,
														auto: {
															...prev.auto,
															requireConfirmOnUnknownCost: v === 'yes',
														},
													}))
												}
											>
												<SelectTrigger className="h-9 rounded-none font-mono text-xs uppercase tracking-wider">
													<SelectValue />
												</SelectTrigger>
												<SelectContent className="rounded-none">
													<SelectItem value="yes" className="font-mono text-sm">
														{t('actions.yes')}
													</SelectItem>
													<SelectItem value="no" className="font-mono text-sm">
														{t('actions.no')}
													</SelectItem>
												</SelectContent>
											</Select>
										</div>

										<div className="flex justify-end gap-2">
											<Button
												variant="outline"
												size="sm"
												className="rounded-none font-mono text-xs uppercase tracking-wider"
												type="button"
												onClick={() => {
													removeSettings()
													setSettings(DEFAULT_AGENT_WORKFLOW_SETTINGS)
												}}
											>
												{t('actions.reset')}
											</Button>
										</div>
									</div>
								</DialogContent>
							</Dialog>

							<Button
								variant="outline"
								size="sm"
								className="rounded-none font-mono text-xs uppercase tracking-wider"
								type="button"
								onClick={() => {
									setDraft('')
									chat.stop()
									chat.setMessages([])
									removeStoredMessages()
									removeActionsById()
								}}
								disabled={chat.messages.length === 0 && draft.length === 0}
							>
								<Trash2 className="h-4 w-4" />
								{t('actions.clear')}
							</Button>
						</div>
					</div>
				</div>
			</div>

			<div className="mx-auto flex w-full max-w-[1200px] flex-1 min-h-0 flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
				<div
					ref={scrollRef}
					className="flex-1 min-h-0 overflow-y-auto border border-border bg-card p-4"
				>
					{chat.messages.length === 0 ? (
						<div className="py-16 text-center text-sm text-muted-foreground">
							{t('empty')}
						</div>
					) : (
						<div className="space-y-3">
							{chat.messages.map((m) => {
								const isUser = m.role === 'user'
								const text = (m.parts ?? [])
									.filter(
										(p: any) =>
											p?.type === 'text' && typeof p.text === 'string',
									)
									.map((p: any) => p.text)
									.join('')
								const actionParts = (m.parts ?? []).filter((p: any) => {
									if (!p || typeof p !== 'object') return false
									if (
										typeof p.type === 'string' &&
										p.type.startsWith('tool-')
									) {
										return (
											p.state === 'output-available' ||
											p.state === 'output-error'
										)
									}
									return false
								})

								return (
									<div
										key={m.id}
										className={cn(
											'flex',
											isUser ? 'justify-end' : 'justify-start',
										)}
									>
										<div className="max-w-[85%] space-y-2">
											{text.trim().length > 0 ? (
												<div
													className={cn(
														'whitespace-pre-wrap break-words border px-3 py-2 text-sm',
														isUser
															? 'bg-primary text-primary-foreground border-primary'
															: 'bg-secondary text-secondary-foreground border-border',
													)}
												>
													{text}
												</div>
											) : null}

											{actionParts.map((p: any, idx: number) => {
												if (p.state === 'output-error') {
													const text =
														typeof p.errorText === 'string'
															? p.errorText
															: 'Tool error'
													return (
														<div
															key={`${m.id}_${idx}_tool_error`}
															className="border border-destructive bg-card p-3 font-mono text-xs text-destructive"
														>
															{text}
														</div>
													)
												}

												const out = p.output
												const actionId =
													typeof out?.actionId === 'string'
														? out.actionId
														: typeof out?.action?.id === 'string'
															? out.action.id
															: null
												if (!actionId) return null
												const action =
													actionsById[actionId] ??
													(out?.action as AgentAction | undefined)
												if (!action) return null
												return (
													<AgentActionCard
														key={`${m.id}_${idx}_${actionId}`}
														action={action}
														settings={settings}
														onUpdateAction={(next) =>
															setActionsById((prev) => ({
																...prev,
																[next.id]: next,
															}))
														}
														onSuggestNext={suggestNext}
													/>
												)
											})}
										</div>
									</div>
								)
							})}
						</div>
					)}
				</div>

				<form
					className="border border-border bg-card p-4"
					onSubmit={(e) => {
						e.preventDefault()
						send()
					}}
				>
					<div className="flex items-end gap-3">
						<textarea
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							placeholder={t('input.placeholder')}
							className="min-h-20 flex-1 resize-none rounded-none border border-border bg-background p-3 font-mono text-xs outline-none"
							disabled={chat.status !== 'ready'}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault()
									send()
								}
							}}
						/>
						<Button
							type="submit"
							className="rounded-none font-mono text-xs uppercase tracking-wider"
							disabled={!canSend}
						>
							{chat.status === 'streaming' || chat.status === 'submitted' ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Send className="h-4 w-4" />
							)}
							{t('actions.send')}
						</Button>
					</div>

					<div className="mt-2 text-[10px] text-muted-foreground">
						{t('input.hint')}
					</div>
				</form>
			</div>
		</div>
	)
}
