import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useConfirmDialog } from '~/components/business/layout/confirm-dialog-provider'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'

export const Route = createFileRoute('/threads/')({
	component: ThreadsIndexRoute,
})

function ThreadsIndexRoute() {
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

	const deletingId = deleteMutation.isPending ? deleteMutation.variables?.id : null

	return (
		<div className="min-h-screen bg-background font-sans text-foreground">
			<div className="border-b border-border bg-card">
				<div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
					<div className="flex items-center justify-between gap-4">
						<div>
							<div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
								{t('header.systemLabel')}
							</div>
							<h1 className="font-mono text-xl font-bold uppercase tracking-tight">
								{t('header.title')}
							</h1>
						</div>
						<Button asChild className="rounded-none font-mono text-xs uppercase">
							<Link to="/threads/new">
								<Plus className="h-4 w-4" />
								{t('actions.new')}
							</Link>
						</Button>
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
				<div className="grid grid-cols-1 gap-4">
					{items.map((thread) => (
						<Card key={thread.id} className="rounded-none group">
							<CardHeader>
								<div className="flex items-start justify-between gap-3">
									<CardTitle className="font-mono text-sm uppercase tracking-widest">
										<Link to="/threads/$id" params={{ id: thread.id }}>
											{thread.title}
										</Link>
									</CardTitle>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-7 w-7 rounded-none border border-border bg-background/90 text-muted-foreground hover:bg-destructive hover:text-white hover:border-destructive opacity-0 group-hover:opacity-100 transition-all"
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
							<CardContent className="text-xs text-muted-foreground font-mono">
								<div className="flex flex-wrap gap-3">
									<span>source={thread.source}</span>
									{thread.sourceUrl ? <span>url={thread.sourceUrl}</span> : null}
								</div>
							</CardContent>
						</Card>
					))}

					{items.length === 0 ? (
						<Card className="rounded-none border-dashed">
							<CardContent className="py-10 text-center text-sm text-muted-foreground">
								{t('empty')}
							</CardContent>
						</Card>
					) : null}
				</div>
			</div>
		</div>
	)
}
