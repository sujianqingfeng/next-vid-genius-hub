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
import { getUserFriendlyErrorMessage } from '~/lib/shared/errors/client'
import { useLocalStorageState } from '~/lib/shared/hooks/useLocalStorageState'
import { useTranslations } from '~/lib/shared/i18n'
import { queryOrpc } from '~/orpc/client'
import { cn } from '~/lib/shared/utils'
import { createId } from '~/lib/shared/utils/id'

const STORAGE_SETTINGS_KEY = 'agentChat:workflowSettings'
const STORAGE_SETTINGS_VERSION = 1
const AUTO_SESSION_ID_KEY = 'agentChat:autoSessionId'

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
	const autoSessionIdRef = React.useRef<string | null>(null)

	const sessionsQuery = useQuery(
		queryOrpc.agent.listSessions.queryOptions({ input: { limit: 100 } }),
	)

	const createSessionMutation = useMutation(
		queryOrpc.agent.createSession.mutationOptions({
			onSuccess: async (data) => {
				try {
					sessionStorage.removeItem(AUTO_SESSION_ID_KEY)
				} catch {
					// ignore
				}
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
			try {
				sessionStorage.removeItem(AUTO_SESSION_ID_KEY)
			} catch {
				// ignore
			}
			props.onChangeChatId(items[0]!.id)
			return
		}
		if (createSessionMutation.isPending) return

		if (!autoSessionIdRef.current) {
			try {
				autoSessionIdRef.current =
					sessionStorage.getItem(AUTO_SESSION_ID_KEY) || createId()
				sessionStorage.setItem(AUTO_SESSION_ID_KEY, autoSessionIdRef.current)
			} catch {
				autoSessionIdRef.current = createId()
			}
		}

		createSessionMutation.mutate({ sessionId: autoSessionIdRef.current })
	}, [
		chatId,
		createSessionMutation,
		createSessionMutation.isPending,
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
		<div className="flex h-full overflow-hidden bg-background font-sans text-foreground">
			{/* Sidebar */}
			<div className="w-[280px] shrink-0 border-r border-border bg-card flex flex-col">
				<div className="border-b border-border p-4">
					<Button
						className="h-9 w-full rounded-none border border-primary bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-widest hover:bg-primary/90"
						type="button"
						onClick={() => createSessionMutation.mutate({})}
						disabled={createSessionMutation.isPending}
					>
						<Plus className="mr-2 h-3 w-3" />
						{t('sessions.new')}
					</Button>
				</div>

				<div className="flex-1 overflow-y-auto">
					{sessions.length === 0 ? (
						<div className="p-4 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
							{t('sessions.empty')}
						</div>
					) : (
						<div className="flex flex-col">
							{sessions.map((s) => {
								const active = s.id === chatId
								return (
									<div
										key={s.id}
										className={cn(
											'group flex w-full items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-wide transition-colors',
											active
												? 'bg-accent text-accent-foreground'
												: 'bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground',
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
											{(s.title || 'Untitled Session')
												.toUpperCase()
												.replace(/\s+/g, '_')}
										</span>
										<div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
											<button
												className="text-muted-foreground hover:text-foreground"
												onClick={(e) => {
													e.preventDefault()
													e.stopPropagation()
													setRenameDraft(s.title || '')
													setRenameSessionId(s.id)
													setRenameOpen(true)
												}}
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													width="10"
													height="10"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2"
													strokeLinecap="square"
													strokeLinejoin="miter"
												>
													<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
												</svg>
											</button>
											<button
												className="text-muted-foreground hover:text-destructive"
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
												<Trash2 className="h-2.5 w-2.5" />
											</button>
										</div>
									</div>
								)
							})}
						</div>
					)}
				</div>
			</div>

			{/* Main Chat Area */}
			<div className="flex min-w-0 flex-1 flex-col">
				{/* Top Header - Now simplified */}
				<div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-6">
					<div className="flex items-center gap-4">
						<div className="flex items-center gap-2">
							<span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								{t('header.breadcrumb')}
							</span>
							<span className="text-muted-foreground/30">/</span>
							<h1 className="font-sans text-xs font-bold uppercase tracking-widest">
								{t('header.title')}
							</h1>
						</div>
						{activeSession ? (
							<>
								<div className="h-4 w-px bg-border" />
								<div className="font-mono text-[10px] uppercase tracking-widest text-foreground bg-accent px-2 py-0.5 border border-border">
									{(activeSession.title || 'Untitled')
										.toUpperCase()
										.replace(/\s+/g, '_')}
								</div>
							</>
						) : null}
					</div>
				</div>

				{/* Messages Scroll Area */}
				<div
					ref={scrollRef}
					className="flex-1 overflow-y-auto bg-background p-6"
				>
					{chatId && sessionQuery.isLoading ? (
						<div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
							{t('sessions.loading')}
						</div>
					) : chat.messages.length === 0 ? (
						<div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
							{t('empty')}
						</div>
					) : (
						<div className="mx-auto max-w-4xl space-y-8">
							{chat.messages.map((m) => {
								const isUser = m.role === 'user'
								const textParts = (m.parts ?? []).filter(
									(p: any) => p?.type === 'text' && typeof p.text === 'string',
								)
								const actionParts = (m.parts ?? []).filter((p: any) => {
									if (!p || typeof p !== 'object') return false
									if (typeof p.type === 'string' && p.type.startsWith('tool-')) {
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
											'flex gap-4',
											isUser ? 'flex-row-reverse' : 'flex-row',
										)}
									>
										<div
											className={cn(
												'flex h-6 w-10 shrink-0 items-center justify-center border font-mono text-[9px] font-bold uppercase tracking-tighter',
												isUser
													? 'border-primary bg-primary text-primary-foreground'
													: 'border-border bg-card text-muted-foreground',
											)}
										>
											{isUser ? 'USER' : 'GENI'}
										</div>

										<div className="flex max-w-[85%] flex-col gap-3">
											{textParts.length > 0 && (
												<div
													className={cn(
														'border p-4 text-sm leading-relaxed font-mono',
														isUser
															? 'border-primary/20 bg-primary/5 text-foreground'
															: 'border-border bg-card text-foreground',
													)}
												>
													{textParts.map((p: any, idx: number) => (
														<div
															key={idx}
															className="whitespace-pre-wrap break-words"
														>
															{p.text}
														</div>
													))}
												</div>
											)}

											{actionParts.map((p: any, idx: number) => {
												if (p.state === 'output-error') {
													const text =
														typeof p.errorText === 'string'
															? p.errorText
															: 'Tool error'
													return (
														<div
															key={`${m.id}_${idx}_tool_error`}
															className="border border-destructive/50 bg-destructive/5 p-3 font-mono text-xs text-destructive"
														>
															<span className="mr-2 font-bold uppercase tracking-wider">
																[FAULT_ERR]
															</span>
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

				{/* Bottom Input Area - With Controls moved here */}
				<div className="border-t border-border bg-card p-4">
					<form
						className="mx-auto max-w-4xl"
						onSubmit={(e) => {
							e.preventDefault()
							send()
						}}
					>
						<div className="flex flex-col border border-border bg-background transition-all focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
							<textarea
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								placeholder={t('input.placeholder')}
								className="min-h-[80px] w-full resize-none bg-transparent p-4 font-mono text-sm outline-none"
								disabled={!chatId || chat.status !== 'ready'}
								onKeyDown={(e) => {
									if (e.key === 'Enter' && !e.shiftKey) {
										e.preventDefault()
										send()
									}
								}}
							/>
							
							{/* Bottom Toolbar Row */}
							<div className="flex h-10 items-center justify-between border-t border-border bg-card/50 px-3">
								<div className="flex items-center gap-4">
									<div className="flex items-center gap-2">
										<span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">MODEL:</span>
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
											disabled={!chatId || chat.status !== 'ready' || (llmModelsQuery.data?.items ?? []).length === 0}
										>
											<SelectTrigger className="h-6 w-fit min-w-[120px] border-none bg-transparent font-mono text-[9px] uppercase tracking-widest hover:bg-accent focus:ring-0">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="rounded-none border-border">
												{(llmModelsQuery.data?.items ?? []).map((m) => (
													<SelectItem key={m.id} value={m.id} className="rounded-none font-mono text-[10px] uppercase">
														{String(m.label ?? m.id).toUpperCase().replace(/\s+/g, '_')}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									<div className="flex items-center gap-2">
										<span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">MODE:</span>
										<Select
											value={settings.defaultMode}
											onValueChange={(v) => setSettings((prev) => ({ ...prev, defaultMode: v as any }))}
											disabled={chat.status !== 'ready'}
										>
											<SelectTrigger className="h-6 w-fit border-none bg-transparent font-mono text-[9px] uppercase tracking-widest hover:bg-accent focus:ring-0">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="rounded-none border-border">
												<SelectItem value="confirm" className="rounded-none font-mono text-[10px] uppercase">{t('actions.mode.confirm')}</SelectItem>
												<SelectItem value="auto" className="rounded-none font-mono text-[10px] uppercase">{t('actions.mode.auto')}</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>

								<div className="flex items-center gap-2">
									<Dialog>
										<DialogTrigger asChild>
											<button className="flex h-6 items-center gap-1.5 px-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50" disabled={chat.status !== 'ready'}>
												<Settings className="h-3 w-3" />
												{t('actions.settings')}
											</button>
										</DialogTrigger>
										<DialogContent className="max-w-[500px] rounded-none border-border bg-card p-0 shadow-none">
											<DialogHeader className="border-b border-border p-4">
												<DialogTitle className="font-mono text-[10px] uppercase tracking-widest">{t('actions.settingsTitle')}</DialogTitle>
											</DialogHeader>
											<div className="grid gap-6 p-6">
												{/* ... (Keep existing Dialog settings content, just update fonts to mono) */}
												<div className="grid gap-3">
													<Label className="font-mono text-[10px] uppercase tracking-widest">{t('actions.perStepMode')}</Label>
													<div className="grid gap-1 border border-border bg-background p-3">
														{(['download', 'asr', 'optimize', 'translate', 'render'] as const).map((step) => {
															const v = settings.perStepMode?.[step] ?? 'inherit'
															return (
																<div key={step} className="flex items-center justify-between gap-3">
																	<div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{t(`actions.kind.${step}` as any)}</div>
																	<Select value={v} onValueChange={(next) => {
																		setSettings((prev) => {
																			const per = { ...prev.perStepMode } as any
																			if (next === 'inherit') delete per[step]
																			else per[step] = next
																			return { ...prev, perStepMode: Object.keys(per).length > 0 ? per : undefined }
																		})
																	}}>
																		<SelectTrigger className="h-6 w-[100px] rounded-none border-border text-[9px] uppercase tracking-widest"><SelectValue /></SelectTrigger>
																		<SelectContent className="rounded-none">
																			<SelectItem value="inherit" className="rounded-none font-mono text-[9px] uppercase">{t('actions.inherit')}</SelectItem>
																			<SelectItem value="confirm" className="rounded-none font-mono text-[9px] uppercase">{t('actions.mode.confirm')}</SelectItem>
																			<SelectItem value="auto" className="rounded-none font-mono text-[9px] uppercase">{t('actions.mode.auto')}</SelectItem>
																		</SelectContent>
																	</Select>
																</div>
															)
														})}
													</div>
												</div>
												<div className="flex justify-end gap-3 pt-4 border-t border-border">
													<Button variant="ghost" className="rounded-none font-mono text-[9px] uppercase" onClick={() => { removeSettings(); setSettings(DEFAULT_AGENT_WORKFLOW_SETTINGS); }}>{t('actions.reset')}</Button>
												</div>
											</div>
										</DialogContent>
									</Dialog>

									<button 
										type="button"
										className="flex h-6 items-center gap-1.5 px-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-30"
										disabled={!chatId || (chat.messages.length === 0 && draft.length === 0) || chat.status === 'streaming'}
										onClick={() => { if (!chatId) return; setDraft(''); chat.stop(); chat.setMessages([]); setActionsById({}); scheduleSync([]); }}
									>
										<Trash2 className="h-3 w-3" />
										{t('actions.clear')}
									</button>

									<div className="mx-1 h-4 w-px bg-border" />

									<button
										type="submit"
										className="flex h-7 items-center gap-2 bg-primary px-3 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
										disabled={!canSend}
									>
										{chat.status === 'streaming' || chat.status === 'submitted' ? (
											<Loader2 className="h-3 w-3 animate-spin" />
										) : (
											<Send className="h-3 w-3" />
										)}
										{t('actions.send')}
									</button>
								</div>
							</div>
						</div>
						<div className="mt-2 text-right">
							<span className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest opacity-50">
								{t('input.hint')}
							</span>
						</div>
					</form>
				</div>

				{/* Rename Session Dialog */}
				<Dialog open={renameOpen} onOpenChange={(open) => { setRenameOpen(open); if (!open) setRenameSessionId(null); }}>
					<DialogContent className="max-w-[400px] rounded-none border-border p-0 shadow-none">
						<DialogHeader className="border-b border-border p-4">
							<DialogTitle className="font-mono text-[10px] uppercase tracking-widest">{t('sessions.renameTitle')}</DialogTitle>
						</DialogHeader>
						<div className="grid gap-6 p-6">
							<div className="grid gap-2">
								<Label className="font-mono text-[9px] uppercase tracking-widest">{t('sessions.renameLabel')}</Label>
								<Input className="rounded-none border-border font-mono text-xs" value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} placeholder={t('sessions.renamePlaceholder')} />
							</div>
							<div className="flex justify-end gap-3">
								<Button variant="outline" className="rounded-none font-mono text-[9px] uppercase" onClick={() => setRenameOpen(false)}>{t('sessions.cancel')}</Button>
								<Button className="rounded-none font-mono text-[9px] uppercase bg-primary text-primary-foreground" onClick={() => { if (!renameSessionId) return; const title = renameDraft.trim(); if (!title) return; renameSessionMutation.mutate({ sessionId: renameSessionId, title }); setRenameOpen(false); }}>{t('sessions.save')}</Button>
							</div>
						</div>
					</DialogContent>
				</Dialog>
			</div>
		</div>
	)
}
