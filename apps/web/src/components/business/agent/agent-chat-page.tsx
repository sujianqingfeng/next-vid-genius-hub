'use client'

import * as React from 'react'
import { Loader2, Send, Trash2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '~/components/ui/button'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Textarea } from '~/components/ui/textarea'
import { getUserFriendlyErrorMessage } from '~/lib/errors/client'
import { useLocalStorageState } from '~/lib/hooks/useLocalStorageState'
import { useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'
import { cn } from '~/lib/utils'

type ChatRole = 'user' | 'assistant'

type ChatMessage = {
	id: string
	role: ChatRole
	content: string
	createdAt: number
}

const STORAGE_KEY = 'agentChat:messages'
const STORAGE_VERSION = 1
const STORAGE_MODEL_KEY = 'agentChat:modelId'
const STORAGE_MODEL_VERSION = 1

function createId() {
	return (
		globalThis.crypto?.randomUUID?.() ?? `msg_${Date.now()}_${Math.random()}`
	)
}

export function AgentChatPage() {
	const t = useTranslations('Agent')

	const [messages, setMessages, removeMessages] = useLocalStorageState<
		ChatMessage[]
	>(STORAGE_KEY, {
		version: STORAGE_VERSION,
		defaultValue: [],
		migrate: (stored) => {
			if (!Array.isArray(stored)) return []
			return stored
				.filter((x) => x && typeof x === 'object')
				.map((x: any) => ({
					id: typeof x.id === 'string' ? x.id : createId(),
					role: x.role === 'assistant' ? 'assistant' : 'user',
					content: typeof x.content === 'string' ? x.content : '',
					createdAt: typeof x.createdAt === 'number' ? x.createdAt : Date.now(),
				}))
				.filter((m) => m.content.trim().length > 0)
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

	const [draft, setDraft] = React.useState('')
	const [streaming, setStreaming] = React.useState<ChatMessage | null>(null)
	const abortRef = React.useRef<AbortController | null>(null)

	const scrollRef = React.useRef<HTMLDivElement | null>(null)

	React.useEffect(() => {
		const el = scrollRef.current
		if (!el) return
		el.scrollTop = el.scrollHeight
	}, [messages.length, streaming?.content.length])

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

	const canSend = !streaming && draft.trim().length > 0

	const submit = React.useCallback(() => {
		const text = draft.trim()
		if (!text) return
		if (streaming) return

		const userMessage: ChatMessage = {
			id: createId(),
			role: 'user',
			content: text,
			createdAt: Date.now(),
		}
		const assistantId = createId()
		const assistantMessage: ChatMessage = {
			id: assistantId,
			role: 'assistant',
			content: '',
			createdAt: Date.now(),
		}

		const nextHistory = [...messages, userMessage]
		const requestMessages = nextHistory.slice(-20).map((m) => ({
			role: m.role,
			content: m.content,
		}))

		setDraft('')
		setMessages(nextHistory)
		setStreaming({ ...assistantMessage, content: t('status.thinking') })

		const controller = new AbortController()
		abortRef.current = controller

		void (async () => {
			let buffer = ''
			try {
				const res = await fetch('/api/agent/chat-stream', {
					method: 'POST',
					credentials: 'same-origin',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						messages: requestMessages,
						...(modelId ? { modelId } : {}),
					}),
					signal: controller.signal,
				})

				if (!res.ok) {
					const errText = await res.text().catch(() => '')
					throw new Error(errText || `HTTP ${res.status}`)
				}
				if (!res.body) throw new Error('No response body')

				const reader = res.body.getReader()
				const decoder = new TextDecoder()
				setStreaming((prev) => (prev ? { ...prev, content: '' } : prev))

				while (true) {
					const { value, done } = await reader.read()
					if (done) break
					buffer += decoder.decode(value, { stream: true })
					setStreaming((prev) =>
						prev && prev.id === assistantId
							? { ...prev, content: buffer }
							: prev,
					)
				}

				buffer += decoder.decode()
				if (controller.signal.aborted) return
				const finalText = buffer.trim() || t('errors.emptyResponse')
				setMessages((prev) => [
					...prev,
					{ ...assistantMessage, content: finalText },
				])
			} catch (error) {
				if (controller.signal.aborted) return
				const message = getUserFriendlyErrorMessage(error)
				setMessages((prev) => [
					...prev,
					{
						...assistantMessage,
						content: `${t('errors.failedPrefix')}${message}`,
					},
				])
			} finally {
				setStreaming(null)
				abortRef.current = null
			}
		})()
	}, [draft, messages, modelId, setMessages, streaming, t])

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
									Boolean(streaming) ||
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

							<Button
								variant="outline"
								size="sm"
								className="rounded-none font-mono text-xs uppercase tracking-wider"
								type="button"
								onClick={() => {
									setDraft('')
									abortRef.current?.abort()
									abortRef.current = null
									setStreaming(null)
									removeMessages()
								}}
								disabled={messages.length === 0 && draft.length === 0}
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
					{messages.length === 0 && !streaming ? (
						<div className="py-16 text-center text-sm text-muted-foreground">
							{t('empty')}
						</div>
					) : (
						<div className="space-y-3">
							{[...messages, ...(streaming ? [streaming] : [])].map((m) => {
								const isUser = m.role === 'user'
								return (
									<div
										key={m.id}
										className={cn(
											'flex',
											isUser ? 'justify-end' : 'justify-start',
										)}
									>
										<div
											className={cn(
												'max-w-[85%] whitespace-pre-wrap break-words border px-3 py-2 text-sm',
												isUser
													? 'bg-primary text-primary-foreground border-primary'
													: 'bg-secondary text-secondary-foreground border-border',
											)}
										>
											{m.content}
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
						submit()
					}}
				>
					<div className="flex items-end gap-3">
						<Textarea
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							placeholder={t('input.placeholder')}
							className="min-h-20 resize-none rounded-none border-border bg-background font-mono text-xs"
							disabled={Boolean(streaming)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault()
									submit()
								}
							}}
						/>
						<Button
							type="submit"
							className="rounded-none font-mono text-xs uppercase tracking-wider"
							disabled={!canSend}
						>
							{streaming ? (
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
