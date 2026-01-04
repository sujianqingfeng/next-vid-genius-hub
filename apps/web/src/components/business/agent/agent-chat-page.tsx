'use client'

import * as React from 'react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { useChat } from '@ai-sdk/react'
import { Loader2, Plus, Send, Settings, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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
import { createId } from '~/lib/utils/id'

const STORAGE_SETTINGS_KEY = 'agentChat:workflowSettings'
const STORAGE_SETTINGS_VERSION = 1

function updateMessagesWithAction(messages: UIMessage[], action: AgentAction) {
	let anyChanged = false

	const next = messages.map((m) => {
		if (!m.parts || m.parts.length === 0) return m
		let changed = false

		const parts = m.parts.map((p: any) => {
			if (!p || typeof p !== 'object') return p
			if (typeof p.type !== 'string' || !p.type.startsWith('tool-')) return p
			if (p.state !== 'output-available') return p
			const out = p.output
			const actionId =
				typeof out?.actionId === 'string'
					? out.actionId
					: typeof out?.action?.id === 'string'
						? out.action.id
						: null
			if (actionId !== action.id) return p
			anyChanged = true
			changed = true
			return {
				...p,
				output: { ...(out ?? {}), actionId: action.id, action },
			}
		})

		return changed ? { ...m, parts } : m
	})

	return anyChanged ? next : messages
}

export function AgentChatPage(props: {
	chatId: string | null
	onChangeChatId: (chatId: string | null) => void
}) {
	const t = useTranslations('Agent')
	const qc = useQueryClient()

	const chatId = props.chatId

	const sessionsQuery = useQuery(
		queryOrpc.agent.listSessions.queryOptions({ input: { limit: 100 } }),
	)

	const createSessionMutation = useMutation(
		queryOrpc.agent.createSession.mutationOptions({
			onSuccess: async (data) => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.agent.listSessions.key(),
				})
				props.onChangeChatId(data.session.id)
			},
		}),
	)

	const renameSessionMutation = useMutation(
		queryOrpc.agent.renameSession.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					qc.invalidateQueries({
						queryKey: queryOrpc.agent.listSessions.key(),
					}),
					qc.invalidateQueries({
						queryKey: queryOrpc.agent.getSession.key(),
					}),
				])
			},
		}),
	)

	const deleteSessionMutation = useMutation(
		queryOrpc.agent.deleteSession.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.agent.listSessions.key(),
				})
			},
		}),
	)

	const sessionQuery = useQuery({
		...queryOrpc.agent.getSession.queryOptions({
			input: { sessionId: chatId ?? '' },
		}),
		enabled: Boolean(chatId),
	})

	const [modelId, setModelId] = React.useState<string | null>(null)

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

	const [actionsById, setActionsById] = React.useState<
		Record<string, AgentAction>
	>({})

	const [draft, setDraft] = React.useState('')

	const scrollRef = React.useRef<HTMLDivElement | null>(null)

	const llmModelsQuery = useQuery(
		queryOrpc.ai.listModels.queryOptions({
			input: { kind: 'llm', enabledOnly: true },
		}),
	)
	const llmDefaultQuery = useQuery(
		queryOrpc.ai.getDefaultModel.queryOptions({ input: { kind: 'llm' } }),
	)

	React.useEffect(() => {
		const sessionModel = sessionQuery.data?.session?.modelId ?? null
		setModelId(sessionModel)
	}, [sessionQuery.data?.session?.modelId])

	const setSessionModelMutation = useMutation(
		queryOrpc.agent.setSessionModel.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					qc.invalidateQueries({
						queryKey: queryOrpc.agent.listSessions.key(),
					}),
					qc.invalidateQueries({
						queryKey: queryOrpc.agent.getSession.key(),
					}),
				])
			},
		}),
	)

	React.useEffect(() => {
		if (!chatId) return
		if (modelId) return
		const enabledModels = llmModelsQuery.data?.items ?? []
		const fallback =
			llmDefaultQuery.data?.model?.id ??
			(enabledModels.length > 0 ? enabledModels[0]!.id : null)
		if (!fallback) return
		setModelId(fallback)
		setSessionModelMutation.mutate({ sessionId: chatId, modelId: fallback })
	}, [
		chatId,
		llmDefaultQuery.data?.model?.id,
		llmModelsQuery.data?.items,
		modelId,
		setSessionModelMutation,
	])

	const transport = React.useMemo(() => {
		return new DefaultChatTransport({
			api: '/api/agent/chat-stream',
			credentials: 'same-origin',
			body: () => (modelId ? { modelId } : {}),
		})
	}, [modelId])

	const chat = useChat({
		transport,
		id: chatId ?? 'agent_pending',
		messages: [],
		onError: (err) => {
			const msg = getUserFriendlyErrorMessage(err)
			console.error('[agent.chat] error', msg)
		},
	})

	React.useEffect(() => {
		const el = scrollRef.current
		if (!el) return
		el.scrollTop = el.scrollHeight
	}, [chat.messages.length])

	const loadedSessionRef = React.useRef<string | null>(null)
	React.useEffect(() => {
		loadedSessionRef.current = null
		setActionsById({})
		setDraft('')
	}, [chatId])

	React.useEffect(() => {
		if (!chatId) return
		if (!sessionQuery.data?.session) return
		if (loadedSessionRef.current === chatId) return
		loadedSessionRef.current = chatId
		chat.stop()
		chat.setMessages(sessionQuery.data.messages ?? [])
	}, [chat, chatId, sessionQuery.data?.messages, sessionQuery.data?.session])

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

	const canSend =
		Boolean(chatId) && chat.status === 'ready' && draft.trim().length > 0
	const suggestRetryRef = React.useRef<Map<string, number>>(new Map())

	const syncMessagesMutation = useMutation(
		queryOrpc.agent.syncMessages.mutationOptions(),
	)
	const syncTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
	const syncPayloadRef = React.useRef<UIMessage[] | null>(null)

	const scheduleSync = React.useCallback(
		(messages: UIMessage[]) => {
			if (!chatId) return
			syncPayloadRef.current = messages
			if (syncTimerRef.current) return
			syncTimerRef.current = setTimeout(() => {
				syncTimerRef.current = null
				const payload = syncPayloadRef.current
				syncPayloadRef.current = null
				if (!payload || !chatId) return
				syncMessagesMutation.mutate({
					sessionId: chatId,
					messages: payload as any,
					modelId: modelId ?? null,
				})
			}, 350)
		},
		[chatId, modelId, syncMessagesMutation],
	)

	React.useEffect(() => {
		return () => {
			if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
			syncTimerRef.current = null
			syncPayloadRef.current = null
		}
	}, [])

	React.useEffect(() => {
		if (chatId) return
		if (!sessionsQuery.isSuccess) return
		const items = sessionsQuery.data?.items ?? []
		if (items.length > 0) {
			props.onChangeChatId(items[0]!.id)
			return
		}
		createSessionMutation.mutate({})
	}, [
		chatId,
		createSessionMutation,
		props,
		sessionsQuery.data?.items,
		sessionsQuery.isSuccess,
	])

	const send = React.useCallback(() => {
		const text = draft.trim()
		if (!text) return
		if (chat.status !== 'ready') return
		if (!chatId) return
		setDraft('')
		void chat.sendMessage({ text })
	}, [chat, chatId, draft])

	const suggestNext = React.useCallback(
		(mediaId: string) => {
			if (!settings.autoSuggestNext) return
			if (!chatId) return
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
					chat.setMessages((prev) => {
						const nextMessages = [
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
						]
						scheduleSync(nextMessages)
						return nextMessages
					})
				} catch {
					// best-effort
				}
			})()
		},
		[
			actionsById,
			chat,
			chatId,
			scheduleSync,
			settings.autoSuggestNext,
			setActionsById,
		],
	)

	const [renameOpen, setRenameOpen] = React.useState(false)
	const [renameSessionId, setRenameSessionId] = React.useState<string | null>(
		null,
	)
	const [renameDraft, setRenameDraft] = React.useState('')

	const sessions = sessionsQuery.data?.items ?? []
	const activeSession = sessionQuery.data?.session ?? null

	return (
		<div className="flex h-full overflow-hidden bg-background font-sans text-foreground selection:bg-primary selection:text-primary-foreground">
			<div className="w-[280px] shrink-0 border-r border-border bg-card">
				<div className="border-b border-border p-3">
					<Button
						className="h-9 w-full rounded-none font-mono text-xs uppercase tracking-wider"
						type="button"
						onClick={() => createSessionMutation.mutate({})}
						disabled={createSessionMutation.isPending}
					>
						<Plus className="h-4 w-4" />
						{t('sessions.new')}
					</Button>
				</div>

				<div className="h-full overflow-y-auto p-2">
					{sessions.length === 0 ? (
						<div className="p-3 font-mono text-xs text-muted-foreground">
							{t('sessions.empty')}
						</div>
					) : (
						<div className="space-y-1">
							{sessions.map((s) => {
								const active = s.id === chatId
								return (
									<div
										key={s.id}
										className={cn(
											'group flex w-full items-center justify-between gap-2 border px-3 py-2 text-left font-mono text-xs uppercase tracking-wider',
											active
												? 'border-primary bg-primary text-primary-foreground'
												: 'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
										)}
										role="button"
										tabIndex={0}
										onClick={() => props.onChangeChatId(s.id)}
										onKeyDown={(e) => {
											if (e.key !== 'Enter' && e.key !== ' ') return
											e.preventDefault()
											props.onChangeChatId(s.id)
										}}
									>
										<span className="min-w-0 flex-1 truncate">
											{(s.title || 'New chat')
												.toUpperCase()
												.replace(/\s+/g, '_')}
										</span>
										<span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
											<Button
												variant="outline"
												size="sm"
												className={cn(
													'h-7 rounded-none px-2 font-mono text-[10px] uppercase tracking-wider',
													active
														? 'border-primary-foreground/30 bg-primary text-primary-foreground hover:bg-primary/90'
														: '',
												)}
												type="button"
												onClick={(e) => {
													e.preventDefault()
													e.stopPropagation()
													setRenameDraft(s.title || '')
													setRenameSessionId(s.id)
													setRenameOpen(true)
												}}
											>
												{t('sessions.rename')}
											</Button>
											<Button
												variant="outline"
												size="sm"
												className={cn(
													'h-7 rounded-none px-2 font-mono text-[10px] uppercase tracking-wider',
													active
														? 'border-primary-foreground/30 bg-primary text-primary-foreground hover:bg-primary/90'
														: '',
												)}
												type="button"
												onClick={(e) => {
													e.preventDefault()
													e.stopPropagation()
													if (!confirm(t('sessions.deleteConfirm'))) return
													deleteSessionMutation.mutate(
														{ sessionId: s.id },
														{
															onSuccess: async () => {
																await qc.invalidateQueries({
																	queryKey: queryOrpc.agent.listSessions.key(),
																})
																if (chatId !== s.id) return
																const refreshed = await sessionsQuery.refetch()
																const next =
																	refreshed.data?.items?.[0]?.id ?? null
																props.onChangeChatId(next)
															},
														},
													)
												}}
											>
												{t('sessions.delete')}
											</Button>
										</span>
									</div>
								)
							})}
						</div>
					)}
				</div>
			</div>

			<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
				<div className="border-b border-border bg-card">
					<div className="px-4 py-4 sm:px-6 lg:px-8">
						<div className="flex items-center justify-between gap-4">
							<div className="min-w-0">
								<div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
									{t('header.breadcrumb')}
								</div>
								<div className="flex items-center gap-2">
									<h1 className="truncate font-mono text-xl font-bold uppercase tracking-tight">
										{t('header.title')}
									</h1>
									{activeSession ? (
										<span className="border border-border bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
											{(activeSession.title || 'New chat')
												.toUpperCase()
												.replace(/\s+/g, '_')}
										</span>
									) : null}
								</div>
							</div>

							<div className="flex items-center gap-2">
								<Select
									value={modelId ?? ''}
									onValueChange={(v) => {
										setModelId(v)
										if (!chatId) return
										setSessionModelMutation.mutate({
											sessionId: chatId,
											modelId: v,
										})
									}}
									disabled={
										!chatId ||
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
														<SelectItem
															value="yes"
															className="font-mono text-sm"
														>
															{t('actions.yes')}
														</SelectItem>
														<SelectItem
															value="no"
															className="font-mono text-sm"
														>
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
										if (!chatId) return
										setDraft('')
										chat.stop()
										chat.setMessages([])
										setActionsById({})
										scheduleSync([])
									}}
									disabled={
										!chatId ||
										(chat.messages.length === 0 && draft.length === 0) ||
										chat.status === 'streaming'
									}
								>
									<Trash2 className="h-4 w-4" />
									{t('actions.clear')}
								</Button>
							</div>
						</div>
					</div>
				</div>

				<div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
					<div
						ref={scrollRef}
						className="flex-1 min-h-0 overflow-y-auto border border-border bg-card p-4"
					>
						{chatId && sessionQuery.isLoading ? (
							<div className="py-16 text-center text-sm text-muted-foreground">
								{t('sessions.loading')}
							</div>
						) : chat.messages.length === 0 ? (
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
															onUpdateAction={(next) => {
																setActionsById((prev) => ({
																	...prev,
																	[next.id]: next,
																}))
																chat.setMessages((prev) => {
																	const updated = updateMessagesWithAction(
																		prev,
																		next,
																	)
																	if (updated !== prev) scheduleSync(updated)
																	return updated
																})
															}}
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
								disabled={!chatId || chat.status !== 'ready'}
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

			<Dialog
				open={renameOpen}
				onOpenChange={(open) => {
					setRenameOpen(open)
					if (!open) setRenameSessionId(null)
				}}
			>
				<DialogContent className="max-w-[520px] rounded-none">
					<DialogHeader>
						<DialogTitle className="font-mono uppercase tracking-wider">
							{t('sessions.renameTitle')}
						</DialogTitle>
					</DialogHeader>
					<div className="grid gap-3">
						<div className="grid gap-2">
							<Label className="font-mono text-xs uppercase tracking-wider">
								{t('sessions.renameLabel')}
							</Label>
							<Input
								className="rounded-none font-mono text-xs"
								value={renameDraft}
								onChange={(e) => setRenameDraft(e.target.value)}
								placeholder={t('sessions.renamePlaceholder')}
							/>
						</div>
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								className="rounded-none font-mono text-xs uppercase tracking-wider"
								type="button"
								onClick={() => setRenameOpen(false)}
							>
								{t('sessions.cancel')}
							</Button>
							<Button
								size="sm"
								className="rounded-none font-mono text-xs uppercase tracking-wider"
								type="button"
								onClick={() => {
									if (!renameSessionId) return
									const title = renameDraft.trim()
									if (!title) return
									renameSessionMutation.mutate({
										sessionId: renameSessionId,
										title,
									})
									setRenameOpen(false)
								}}
								disabled={!renameSessionId}
							>
								{t('sessions.save')}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
