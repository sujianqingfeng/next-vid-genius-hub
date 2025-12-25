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
		<div className="min-h-screen bg-background font-sans text-foreground selection:bg-primary selection:text-primary-foreground">
			{/* Header Section */}
			<div className="border-b border-border bg-card">
				<div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-1">
							<div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
								<span className="flex items-center gap-1">
									<span className="h-1.5 w-1.5 rounded-full bg-primary" />
									Library System
								</span>
								<span>/</span>
								<span>Media Inventory</span>
							</div>
							<div className="flex items-center gap-3">
								<h1 className="font-mono text-xl font-bold uppercase tracking-tight">
									{t('title')}
								</h1>
								<span className="border border-border bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
									VOL_PAGE_{page}
								</span>
							</div>
							<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground opacity-70">
								Total_Records: <span className="text-foreground">{total}</span>
							</div>
						</div>

						<Button
							asChild
							variant="outline"
							className="h-9 rounded-none border-border font-mono text-xs uppercase tracking-widest px-6"
						>
							<Link to="/media/download">
								<Plus className="mr-2 h-3 w-3" />
								{t('downloadCta')}
							</Link>
						</Button>
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
				<div className="space-y-8">
					{listQuery.isLoading ? (
						<div className="flex h-64 items-center justify-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Polling_Storage_System...
						</div>
					) : null}

					{listQuery.isError ? (
						<div className="border border-destructive/50 bg-destructive/5 p-8 text-center border-dashed">
							<div className="font-mono text-sm font-bold uppercase tracking-widest text-destructive mb-2">
								System_Fault: Interface_Failure
							</div>
							<div className="font-mono text-[10px] uppercase text-destructive/80 mb-6">
								{t('error.body')}
							</div>
							<Button
								onClick={() => listQuery.refetch()}
								variant="outline"
								className="rounded-none border-destructive text-destructive hover:bg-destructive/10 font-mono text-[10px] uppercase tracking-widest"
							>
								[ RETRY_HANDSHAKE ]
							</Button>
						</div>
					) : null}

					{!listQuery.isLoading && !listQuery.isError && items.length === 0 ? (
						<div className="border border-dashed border-border p-20 text-center bg-muted/5">
							<div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center border border-border bg-background">
								<FolderOpen
									className="h-8 w-8 text-muted-foreground opacity-30"
									strokeWidth={1}
								/>
							</div>
							<div className="font-mono text-sm font-bold uppercase tracking-widest mb-2">
								{t('empty.title')}
							</div>
							<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-8">
								{t('empty.body')}
							</div>
							<Button
								asChild
								variant="outline"
								className="rounded-none font-mono text-[10px] uppercase tracking-widest"
							>
								<Link to="/media/download">[ INITIATE_INGESTION ]</Link>
							</Button>
						</div>
					) : null}

					{items.length > 0 ? (
						<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
							{items.map((item) => {
								const createdAt = toDateLabel(item.createdAt)
								const title =
									item.translatedTitle || item.title || item.id || 'Untitled'
								const isDeleting = deletingId === item.id
								return (
									<div
										key={item.id}
										className="group relative border border-border bg-card transition-colors hover:border-primary"
									>
										<Link
											to="/media/$id"
											params={{ id: item.id }}
											className="block"
										>
											{/* Thumbnail Area */}
											<div className="aspect-video w-full border-b border-border bg-muted relative overflow-hidden">
												{item.thumbnail ? (
													<img
														src={item.thumbnail}
														alt={title}
														className="h-full w-full object-cover grayscale opacity-80 transition-all duration-500 group-hover:opacity-100 group-hover:scale-105"
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
														<span className="bg-background border border-border px-1.5 py-0.5 text-[8px] font-mono uppercase font-bold tracking-tighter text-foreground">
															{item.quality}
														</span>
													)}
												</div>

												<div className="absolute top-2 left-2">
													<div className="bg-background/80 border border-border px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-tighter text-muted-foreground">
														ID: {item.id.slice(0, 8)}
													</div>
												</div>
											</div>

											{/* Card Content */}
											<div className="p-4 space-y-4">
												<div className="line-clamp-2 font-mono text-[11px] font-bold leading-relaxed uppercase tracking-tight group-hover:text-primary transition-colors h-10">
													{title}
												</div>

												<div className="grid grid-cols-2 gap-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground border-t border-border pt-3">
													<div className="space-y-1">
														<span className="block opacity-50">
															SRC_PROVIDER
														</span>
														<span className="text-foreground font-bold">
															{item.source || 'INTERNAL'}
														</span>
													</div>
													<div className="text-right space-y-1">
														<span className="block opacity-50">REG_DATE</span>
														<span className="text-foreground">
															{createdAt.split(',')[0]}
														</span>
													</div>
												</div>
											</div>
										</Link>

										{/* Delete Action */}
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="absolute right-2 top-2 z-10 h-7 w-7 rounded-none border border-border bg-background/90 text-muted-foreground hover:bg-destructive hover:text-white hover:border-destructive opacity-0 group-hover:opacity-100 transition-all"
											aria-label={t('actions.delete')}
											disabled={isDeleting}
											onClick={(e) => {
												e.preventDefault()
												e.stopPropagation()
												if (deleteMutation.isPending) return
												void (async () => {
													const ok = await confirmDialog({
														title: 'SECURITY_WARNING: DESTRUCTIVE_ACTION',
														description: t('confirmDelete', { title }),
														confirmText: 'PURGE_RECORD',
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
						<div className="mt-12 border-t border-border pt-8">
							<div className="flex items-center justify-center gap-3">
								<Button
									variant="outline"
									disabled={page <= 1}
									asChild={page > 1}
									className="rounded-none border-border h-9 font-mono text-[10px] uppercase tracking-widest px-6"
								>
									{page > 1 ? (
										<Link to="/media" search={{ page: page - 1 }}>
											[ PREV_VOL ]
										</Link>
									) : (
										<span>PREV_VOL</span>
									)}
								</Button>

								<div className="px-6 font-mono text-[10px] text-muted-foreground border border-border h-9 flex items-center bg-muted/10 uppercase tracking-widest font-bold">
									VOL_UNIT {page} / {pageCount}
								</div>

								<Button
									variant="outline"
									disabled={page >= pageCount}
									asChild={page < pageCount}
									className="rounded-none border-border h-9 font-mono text-[10px] uppercase tracking-widest px-6"
								>
									{page < pageCount ? (
										<Link to="/media" search={{ page: page + 1 }}>
											[ NEXT_VOL ]
										</Link>
									) : (
										<span>NEXT_VOL</span>
									)}
								</Button>
							</div>
							<div className="mt-4 font-mono text-[8px] uppercase tracking-[0.4em] text-muted-foreground text-center opacity-50">
								END_OF_STREAM_INDEX
							</div>
						</div>
					) : null}
				</div>
			</div>
		</div>
	)
}
