'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
	ExternalLink,
	FileText,
	Globe,
	Loader2,
	Play,
	Plus,
	Trash2,
	Twitter,
	Video,
	Youtube,
} from 'lucide-react'
import { useConfirmDialog } from '~/components/business/layout/confirm-dialog-provider'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '~/components/ui/card'
import { useEnhancedMutation } from '~/lib/shared/hooks/useEnhancedMutation'
import { useTranslations } from '~/lib/shared/i18n'
import { queryOrpc } from '~/orpc'

export function ThreadsListPage() {
	const qc = useQueryClient()
	const confirmDialog = useConfirmDialog()
	const t = useTranslations('Threads.list')

	const threadsQuery = useQuery(queryOrpc.thread.list.queryOptions())
	const items = threadsQuery.data?.items ?? []

	const deleteMutation = useEnhancedMutation(
		queryOrpc.thread.deleteById.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({ queryKey: queryOrpc.thread.list.key() })
			},
		}),
		{
			successToast: t('toasts.deleted'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
		},
	)

	const deletingId = deleteMutation.isPending
		? deleteMutation.variables?.id
		: null

	const getSourceIcon = (source: string) => {
		const s = source.toLowerCase()
		if (s.includes('youtube')) return <Youtube className="h-3 w-3" />
		if (s.includes('twitter') || s.includes('x.com'))
			return <Twitter className="h-3 w-3" />
		if (s.includes('video')) return <Video className="h-3 w-3" />
		if (s.includes('web') || s.includes('http'))
			return <Globe className="h-3 w-3" />
		return <FileText className="h-3 w-3" />
	}

	return (
		<div className="min-h-screen bg-background font-sans text-foreground">
			<div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
				<div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
					<div className="flex items-center justify-between gap-4">
						<div>
							<div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
								{t('header.systemLabel')}
							</div>
							<h1 className="font-mono text-xl font-bold uppercase tracking-tight">
								{t('header.title')}
							</h1>
						</div>
						<Button
							asChild
							className="rounded-none font-mono text-xs uppercase shadow-sm"
						>
							<Link to="/threads/new">
								<Plus className="h-4 w-4 mr-2" />
								{t('actions.new')}
							</Link>
						</Button>
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
				{items.length === 0 ? (
					<Card className="rounded-none border-dashed bg-muted/30">
						<CardContent className="flex flex-col items-center justify-center py-16 text-center">
							<div className="rounded-full bg-muted p-4 mb-4">
								<FileText className="h-8 w-8 text-muted-foreground" />
							</div>
							<h3 className="text-lg font-semibold mb-1">{t('empty')}</h3>
							<p className="text-sm text-muted-foreground max-w-xs mb-6">
								Get started by creating your first thread.
							</p>
							<Button asChild variant="outline" className="rounded-none">
								<Link to="/threads/new">
									<Plus className="h-4 w-4 mr-2" />
									{t('actions.new')}
								</Link>
							</Button>
						</CardContent>
					</Card>
				) : (
						<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
							{items.map((thread) => (
								<Card
									key={thread.id}
									className="relative rounded-none group flex flex-col transition-all hover:shadow-md border-border/60 hover:border-border p-0 gap-0"
								>
									<Link
										to="/threads/$id"
										params={{ id: thread.id }}
										aria-label={thread.title}
										className="absolute inset-0 z-0"
									>
										<span className="sr-only">{thread.title}</span>
									</Link>
									<CardHeader className="relative z-10 p-4 pb-2">
										<div className="flex items-start justify-between gap-3">
											<Badge
												variant="outline"
												className="rounded-none font-mono text-[10px] uppercase tracking-wider gap-1.5"
										>
											{getSourceIcon(thread.source)}
											{thread.source}
										</Badge>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="h-6 w-6 -mr-2 -mt-2 rounded-none text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
											aria-label={t('actions.deleteAria')}
											disabled={deleteMutation.isPending}
											onClick={(e) => {
												e.preventDefault()
												e.stopPropagation()
												if (deleteMutation.isPending) return
												void (async () => {
													const ok = await confirmDialog({
														title: t('confirmDelete.title'),
														description: t('confirmDelete.description', {
															title: thread.title,
														}),
														confirmText: t('confirmDelete.confirmText'),
														variant: 'destructive',
													})
													if (!ok) return
													deleteMutation.mutate({ id: thread.id })
												})()
											}}
										>
											{deletingId === thread.id ? (
												<Loader2 className="h-3 w-3 animate-spin" />
											) : (
												<Trash2 className="h-3 w-3" />
											)}
											</Button>
										</div>
									</CardHeader>
									<CardContent className="relative z-10 p-4 pt-2 flex-grow">
										{(thread as any).previewMedia?.length ? (
											<div className="grid grid-cols-3 gap-1 mb-3">
												{((thread as any).previewMedia as any[]).slice(0, 3).map(
													(m, idx) => (
													<Link
														key={`${m.kind}:${m.url ?? 'none'}:${idx}`}
														to="/threads/$id"
														params={{ id: thread.id }}
														className="block"
													>
														<div className="relative aspect-video overflow-hidden border border-border/60 bg-muted/30">
															{m.url ? (
																<img
																	src={String(m.url)}
																	alt=""
																	className="h-full w-full object-cover"
																	loading="lazy"
																/>
															) : (
																<div className="flex h-full w-full items-center justify-center text-muted-foreground">
																	<Video className="h-4 w-4" />
																</div>
															)}
															{m.kind === 'video' ? (
																<div className="absolute inset-0 flex items-center justify-center">
																	<div className="rounded-full bg-background/70 p-1.5 text-foreground shadow-sm">
																		<Play className="h-3 w-3" />
																	</div>
																</div>
															) : null}
														</div>
													</Link>
												),
											)}
										</div>
									) : null}
									<h3 className="font-medium text-lg leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
										<Link
											to="/threads/$id"
											params={{ id: thread.id }}
											className="relative"
										>
											{thread.title}
										</Link>
									</h3>
									{thread.sourceUrl && (
										<div className="flex items-center text-xs text-muted-foreground mt-2 truncate max-w-full relative z-10">
											<ExternalLink className="h-3 w-3 mr-1.5 flex-shrink-0" />
											<a
												href={thread.sourceUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="hover:underline truncate"
												onClick={(e) => e.stopPropagation()}
											>
												{thread.sourceUrl}
											</a>
										</div>
										)}
									</CardContent>
									<CardFooter className="relative z-10 p-4 pt-0 text-[10px] text-muted-foreground font-mono uppercase tracking-widest border-t border-border/40 mt-auto bg-muted/10">
										<div className="py-2 w-full flex justify-between items-center">
											<span>ID: {thread.id.slice(0, 8)}...</span>
										</div>
									</CardFooter>
							</Card>
						))}
					</div>
				)}
			</div>
		</div>
	)
}
