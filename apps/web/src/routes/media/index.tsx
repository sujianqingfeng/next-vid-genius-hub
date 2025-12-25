import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { FolderOpen, Loader2, Plus, Trash2 } from 'lucide-react'
import { z } from 'zod'

import { useConfirmDialog } from '~/components/business/layout/confirm-dialog-provider'
import { Button } from '~/components/ui/button'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { MEDIA_PAGE_SIZE } from '~/lib/pagination'
import { useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'

const SearchSchema = z.object({
	page: z.coerce.number().int().min(1).optional().default(1),
})

export const Route = createFileRoute('/media/')({
	validateSearch: SearchSchema,
	loaderDeps: ({ search }) => ({ page: search.page }),
	loader: async ({ context, deps, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}

		await context.queryClient.prefetchQuery(
			queryOrpc.media.list.queryOptions({
				input: { page: deps.page, limit: MEDIA_PAGE_SIZE },
			}),
		)
	},
	component: MediaIndexRoute,
})

function toDateLabel(input: unknown): string {
	if (input instanceof Date) return input.toLocaleString()
	if (typeof input === 'string' || typeof input === 'number') {
		const d = new Date(input)
		if (!Number.isNaN(d.getTime())) return d.toLocaleString()
	}
	return ''
}

function MediaIndexRoute() {
	const t = useTranslations('Media')
	const navigate = Route.useNavigate()
	const { page } = Route.useSearch()
	const qc = useQueryClient()
	const confirmDialog = useConfirmDialog()

	const listQuery = useQuery(
		queryOrpc.media.list.queryOptions({
			input: { page, limit: MEDIA_PAGE_SIZE },
		}),
	)

	const deleteMutation = useEnhancedMutation(
		queryOrpc.media.deleteById.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({ queryKey: queryOrpc.media.list.key() })
				const refreshed = await listQuery.refetch()
				const nextItems = refreshed.data?.items ?? []
				if (page > 1 && nextItems.length === 0) {
					await navigate({ to: '/media', search: { page: page - 1 } })
				}
			},
		}),
		{
			successToast: t('toasts.deleteSuccess'),
			errorToast: ({ error }) =>
				t('toasts.deleteFail', {
					message: error instanceof Error ? error.message : 'Unknown',
				}),
		},
	)

	const items = listQuery.data?.items ?? []
	const total = listQuery.data?.total ?? 0
	const pageCount = Math.max(1, Math.ceil(total / MEDIA_PAGE_SIZE))
	const deletingId = deleteMutation.isPending
		? deleteMutation.variables?.id
		: null

	return (
		<div className="min-h-screen bg-background text-foreground font-sans p-6 md:p-12">
			<div className="mx-auto max-w-7xl border border-border bg-card">
				{/* Header */}
				<div className="flex flex-col gap-4 border-b border-border p-6 sm:flex-row sm:items-center sm:justify-between bg-secondary/5">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<h1 className="text-xl font-bold uppercase tracking-wide">
								{t('title')}
							</h1>
							<span className="border border-border bg-background px-2 py-0.5 text-xs font-mono text-muted-foreground">
								PAGE {page}
							</span>
						</div>
						<p className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
							Total Items: {total}
						</p>
					</div>
					<Button 
						asChild 
						className="rounded-none h-10 px-6 uppercase tracking-wide text-xs font-bold"
					>
						<Link to="/media/download">
							<Plus className="mr-2 h-4 w-4" />
							{t('downloadCta')}
						</Link>
					</Button>
				</div>

				<div className="p-6">
					{listQuery.isLoading ? (
						<div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground font-mono uppercase tracking-wide">
							<Loader2 className="h-4 w-4 animate-spin" />
							Loading Data...
						</div>
					) : null}

					{listQuery.isError ? (
						<div className="border border-destructive/50 bg-destructive/5 p-8 text-center">
							<div className="text-lg font-bold uppercase tracking-wide text-destructive">{t('error.title')}</div>
							<div className="mt-2 text-sm font-mono text-destructive/80">
								{t('error.body')}
							</div>
							<div className="mt-6">
								<Button 
									onClick={() => listQuery.refetch()}
									variant="outline"
									className="rounded-none border-destructive/50 text-destructive hover:bg-destructive/10 uppercase text-xs"
								>
									{t('error.retry')}
								</Button>
							</div>
						</div>
					) : null}

					{!listQuery.isLoading && !listQuery.isError && items.length === 0 ? (
						<div className="border border-dashed border-border p-12 text-center bg-secondary/5">
							<div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center border border-border bg-background">
								<FolderOpen className="h-8 w-8 text-muted-foreground" strokeWidth={1} />
							</div>
							<div className="text-lg font-bold uppercase tracking-wide">{t('empty.title')}</div>
							<div className="mt-2 text-sm font-mono text-muted-foreground">
								{t('empty.body')}
							</div>
							<div className="mt-8">
								<Button 
									asChild
									className="rounded-none uppercase tracking-wide text-xs"
								>
									<Link to="/media/download">{t('downloadCta')}</Link>
								</Button>
							</div>
						</div>
					) : null}

					{items.length > 0 ? (
						<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{items.map((item) => {
								const createdAt = toDateLabel(item.createdAt)
								const title =
									item.translatedTitle || item.title || item.id || 'Untitled'
								const isDeleting = deletingId === item.id
								return (
									<div key={item.id} className="group relative border border-border bg-background transition-colors hover:border-primary/50">
										<Link
											to="/media/$id"
											params={{ id: item.id }}
											className="block"
										>
											{/* Thumbnail Area */}
											<div className="aspect-video w-full border-b border-border bg-secondary/10 relative overflow-hidden">
												{item.thumbnail ? (
													<img
														src={item.thumbnail}
														alt={title}
														className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
														loading="lazy"
													/>
												) : (
													<div className="flex h-full w-full items-center justify-center text-muted-foreground/20">
														<FolderOpen className="h-12 w-12" strokeWidth={1} />
													</div>
												)}
												
												{/* Overlay Status Badges */}
												<div className="absolute bottom-2 left-2 flex gap-1">
													{item.quality && (
														<span className="bg-background/90 backdrop-blur-sm border border-border px-1.5 py-0.5 text-[10px] font-mono uppercase text-foreground">
															{item.quality}
														</span>
													)}
												</div>
											</div>

											{/* Card Content */}
											<div className="p-4 space-y-3">
												<div className="line-clamp-2 text-sm font-medium leading-relaxed uppercase tracking-wide group-hover:text-primary transition-colors h-10">
													{title}
												</div>
												
												<div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-muted-foreground border-t border-border pt-3">
													<div>
														<span className="block text-muted-foreground/50 uppercase">Source</span>
														<span className="uppercase text-foreground">{item.source}</span>
													</div>
													<div className="text-right">
														<span className="block text-muted-foreground/50 uppercase">Date</span>
														<span>{createdAt.split(',')[0]}</span>
													</div>
												</div>
											</div>
										</Link>

										{/* Delete Action */}
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											className="absolute right-2 top-2 z-10 h-8 w-8 rounded-none border border-border bg-background/90 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
											aria-label={t('actions.delete')}
											disabled={isDeleting}
											onClick={(e) => {
												e.preventDefault()
												e.stopPropagation()
												if (deleteMutation.isPending) return
												void (async () => {
													const ok = await confirmDialog({
														title: t('actions.delete'),
														description: t('confirmDelete', { title }),
														confirmText: t('actions.delete'),
														variant: 'destructive',
													})
													if (!ok) return
													deleteMutation.mutate({ id: item.id })
												})()
											}}
										>
											{isDeleting ? (
												<Loader2 className="h-3 w-3 animate-spin" />
											) : (
												<Trash2 className="h-3 w-3" />
											)}
										</Button>
									</div>
								)
							})}
						</div>
					) : null}

					{/* Pagination */}
					{pageCount > 1 ? (
						<div className="mt-12 flex items-center justify-center gap-2 border-t border-border pt-8">
							<Button 
								variant="outline" 
								disabled={page <= 1}
								asChild={page > 1}
								className="rounded-none border-border h-9 uppercase text-xs w-24"
							>
								{page > 1 ? (
									<Link to="/media" search={{ page: page - 1 }}>
										Previous
									</Link>
								) : (
									<span>Previous</span>
								)}
							</Button>
							
							<div className="px-4 font-mono text-xs text-muted-foreground border border-border h-9 flex items-center bg-secondary/5">
								PAGE {page} / {pageCount}
							</div>
							
							<Button 
								variant="outline" 
								disabled={page >= pageCount}
								asChild={page < pageCount}
								className="rounded-none border-border h-9 uppercase text-xs w-24"
							>
								{page < pageCount ? (
									<Link to="/media" search={{ page: page + 1 }}>
										Next
									</Link>
								) : (
									<span>Next</span>
								)}
							</Button>
						</div>
					) : null}
				</div>
			</div>
		</div>
	)
}