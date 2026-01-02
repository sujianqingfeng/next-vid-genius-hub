'use client'

import * as React from 'react'
import { Loader2, Send, Trash2 } from 'lucide-react'

import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'
import { getUserFriendlyErrorMessage } from '~/lib/errors/client'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
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

function createId() {
	return globalThis.crypto?.randomUUID?.() ?? `msg_${Date.now()}_${Math.random()}`
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
					createdAt:
						typeof x.createdAt === 'number' ? x.createdAt : Date.now(),
				}))
				.filter((m) => m.content.trim().length > 0)
		},
	})

	const [draft, setDraft] = React.useState('')
	const [pendingAssistantId, setPendingAssistantId] = React.useState<
		string | null
	>(null)

	const scrollRef = React.useRef<HTMLDivElement | null>(null)

	React.useEffect(() => {
		const el = scrollRef.current
		if (!el) return
		el.scrollTop = el.scrollHeight
	}, [messages.length])

	const chatMutation = useEnhancedMutation(
		queryOrpc.ai.chat.mutationOptions({
			onSuccess: (data) => {
				const text = String(data.text ?? '').trim()
				if (!pendingAssistantId) return
				setMessages((prev) =>
					prev.map((m) =>
						m.id === pendingAssistantId
							? { ...m, content: text || t('errors.emptyResponse') }
							: m,
					),
				)
				setPendingAssistantId(null)
			},
			onError: (error) => {
				if (!pendingAssistantId) return
				const message = getUserFriendlyErrorMessage(error)
				setMessages((prev) =>
					prev.map((m) =>
						m.id === pendingAssistantId
							? { ...m, content: `${t('errors.failedPrefix')}${message}` }
							: m,
					),
				)
				setPendingAssistantId(null)
			},
		}),
		{
			errorToast: ({ error }) => getUserFriendlyErrorMessage(error),
		},
	)

	const canSend =
		!chatMutation.isPending &&
		!pendingAssistantId &&
		draft.trim().length > 0

	const submit = React.useCallback(() => {
		const text = draft.trim()
		if (!text) return
		if (chatMutation.isPending || pendingAssistantId) return

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
			content: t('status.thinking'),
			createdAt: Date.now(),
		}

		const nextHistory = [...messages, userMessage]
		const requestMessages = nextHistory.slice(-20).map((m) => ({
			role: m.role,
			content: m.content,
		}))

		setDraft('')
		setPendingAssistantId(assistantId)
		setMessages([...nextHistory, assistantMessage])

		chatMutation.mutate({
			messages: requestMessages,
		})
	}, [chatMutation, draft, messages, pendingAssistantId, setMessages, t])

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

						<Button
							variant="outline"
							size="sm"
							className="rounded-none font-mono text-xs uppercase tracking-wider"
							type="button"
							onClick={() => {
								setDraft('')
								setPendingAssistantId(null)
								chatMutation.reset()
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

			<div className="mx-auto flex w-full max-w-[1200px] flex-1 min-h-0 flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
				<div
					ref={scrollRef}
					className="flex-1 min-h-0 overflow-y-auto border border-border bg-card p-4"
				>
					{messages.length === 0 ? (
						<div className="py-16 text-center text-sm text-muted-foreground">
							{t('empty')}
						</div>
					) : (
						<div className="space-y-3">
							{messages.map((m) => {
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
							disabled={chatMutation.isPending || Boolean(pendingAssistantId)}
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
							{chatMutation.isPending || pendingAssistantId ? (
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
