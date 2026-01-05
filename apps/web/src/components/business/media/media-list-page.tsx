'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FolderOpen, Loader2, Plus, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { useConfirmDialog } from '~/components/business/layout/confirm-dialog-provider'
import { Button } from '~/components/ui/button'
import { useEnhancedMutation } from '~/lib/shared/hooks/useEnhancedMutation'
import { MEDIA_PAGE_SIZE } from '~/lib/shared/pagination'
import { getBcp47Locale, useLocale, useTranslations } from '~/lib/shared/i18n'
import { queryOrpc } from '~/orpc/client'

export const MediaListSearchSchema = z.object({
	page: z.coerce.number().int().min(1).optional().default(1),
})

function toDateLabel(input: unknown, locale: string): string {
	if (input instanceof Date) return input.toLocaleString(locale)
	if (typeof input === 'string' || typeof input === 'number') {
		const d = new Date(input)
		if (!Number.isNaN(d.getTime())) return d.toLocaleString(locale)
	}
	return ''
}

export function MediaListPage(props: {
	page: number
	onChangePage: (page: number) => Promise<void> | void
}) {
	const { page, onChangePage } = props
	const t = useTranslations('Media')
	const tCommon = useTranslations('Common')
	const locale = useLocale()
	const dateLocale = getBcp47Locale(locale)
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
					await onChangePage(page - 1)
				}
			},
		}),
		{
			successToast: t('toasts.deleteSuccess'),
			errorToast: ({ error }) =>
				t('toasts.deleteFail', {
					message:
						error instanceof Error
							? error.message
							: tCommon('fallback.unknown'),
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
			<div className="border-b border-border bg-card">
				<div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-1">
							<div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
								<span className="flex items-center gap-1">
									<span className="h-1.5 w-1.5 rounded-full bg-primary" />
									{t('ui.breadcrumb.system')}
								</span>
								<span>/</span>
								<span>{t('ui.breadcrumb.section')}</span>
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
								{t('ui.labels.totalRecords')}{' '}
								<span className="text-foreground">{total}</span>
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
							{t('ui.loading')}
						</div>
					) : null}

					{listQuery.isError ? (
						<div className="border border-destructive/50 bg-destructive/5 p-8 text-center border-dashed">
							<div className="font-mono text-sm font-bold uppercase tracking-widest text-destructive mb-2">
								{t('ui.errorTitle')}
							</div>
							<div className="font-mono text-[10px] uppercase text-destructive/80 mb-6">
								{t('error.body')}
							</div>
							<Button
								onClick={() => listQuery.refetch()}
								variant="outline"
								className="rounded-none border-destructive text-destructive hover:bg-destructive/10 font-mono text-[10px] uppercase tracking-widest"
							>
								{t('ui.retry')}
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
								<Link to="/media/download">{t('ui.emptyCta')}</Link>
							</Button>
						</div>
					) : null}

					{items.length > 0 ? (
						<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
							{items.map((item) => {
								const createdAt = toDateLabel(item.createdAt, dateLocale)
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
											className="block p-4"
										>
											<div className="space-y-3">
												<div className="flex items-start justify-between gap-3">
													<div className="space-y-1">
														<div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
															ID_{item.id.slice(0, 8)}
														</div>
														<div className="font-mono text-sm font-bold uppercase tracking-tight leading-tight">
															{title}
														</div>
													</div>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														className="h-8 w-8 rounded-none border border-border bg-background/90 text-muted-foreground hover:bg-destructive hover:text-white hover:border-destructive opacity-0 group-hover:opacity-100 transition-all"
														aria-label={t('ui.actions.delete')}
														disabled={deleteMutation.isPending}
														onClick={(e) => {
															e.preventDefault()
															e.stopPropagation()
															if (deleteMutation.isPending) return
															void (async () => {
																const ok = await confirmDialog({
																	title: t('confirmDelete.title'),
																	description: t('confirmDelete.description'),
																	confirmText: t('confirmDelete.confirmText'),
																	variant: 'destructive',
																})
																if (!ok) return
																deleteMutation.mutate({ id: item.id })
															})()
														}}
													>
														{isDeleting ? (
															<Loader2 className="h-4 w-4 animate-spin" />
														) : (
															<Trash2 className="h-4 w-4" />
														)}
													</Button>
												</div>

												<div className="space-y-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
													<div className="flex items-center justify-between">
														<span>{t('ui.labels.createdAt')}</span>
														<span className="text-foreground">{createdAt}</span>
													</div>
													{item.source ? (
														<div className="flex items-center justify-between">
															<span>{t('ui.labels.source')}</span>
															<span className="text-foreground">
																{String(item.source)}
															</span>
														</div>
													) : null}
												</div>
											</div>
										</Link>
									</div>
								)
							})}
						</div>
					) : null}

					{pageCount > 1 ? (
						<div className="flex items-center justify-center gap-2">
							<Button
								variant="outline"
								className="rounded-none font-mono text-[10px] uppercase tracking-widest"
								disabled={page <= 1}
								onClick={() => onChangePage(page - 1)}
							>
								{t('ui.pagination.prev')}
							</Button>
							<div className="border border-border bg-card px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								{t('ui.pagination.page')} {page}/{pageCount}
							</div>
							<Button
								variant="outline"
								className="rounded-none font-mono text-[10px] uppercase tracking-widest"
								disabled={page >= pageCount}
								onClick={() => onChangePage(page + 1)}
							>
								{t('ui.pagination.next')}
							</Button>
						</div>
					) : null}
				</div>
			</div>
		</div>
	)
}

