import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from '@tanstack/react-router'
import { Loader2, Play, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { ProxyStatusPill } from '~/components/business/proxy/proxy-status-pill'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { useTranslations } from '../integrations/i18n'
import { queryOrpc } from '../integrations/orpc/client'

type ProxyRow = {
	id: string
	name?: string | null
	testStatus?: 'pending' | 'success' | 'failed' | null
	responseTime?: number | null
}

const FormSchema = z.object({
	url: z.string().url(),
	quality: z.enum(['1080p', '720p']).default('1080p'),
	proxyId: z.string().optional(),
})

export const Route = createFileRoute('/media/download')({
	loader: async ({ context, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}

		await context.queryClient.prefetchQuery(
			queryOrpc.proxy.getActiveProxiesForDownload.queryOptions(),
		)
	},
	component: MediaDownloadRoute,
})

function MediaDownloadRoute() {
	const t = useTranslations('Download')
	const tMediaDetail = useTranslations('MediaDetail')
	const tProxySelector = useTranslations('Proxy.selector')
	const navigate = useNavigate()

	const proxiesQuery = useQuery(
		queryOrpc.proxy.getActiveProxiesForDownload.queryOptions(),
	)
	const proxies = (proxiesQuery.data?.proxies ?? [
		{ id: 'none', name: 'No Proxy', testStatus: null, responseTime: null },
	]) as ProxyRow[]
	const defaultProxyId = proxiesQuery.data?.defaultProxyId ?? 'none'

	const startMutation = useEnhancedMutation(
		queryOrpc.download.startCloudDownload.mutationOptions({
			onSuccess: (data) => {
				navigate({
					to: '/media/$id',
					params: { id: data.mediaId },
					replace: true,
				})
			},
		}),
		{
			successToast: t('page.toasts.queued'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : 'Failed',
		},
	)

	return (
		<div className="min-h-screen bg-background selection:bg-primary/10 selection:text-primary">
			<div className="px-4 py-10 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-2xl">
					<div className="mb-8 flex items-center justify-between gap-4">
						<div>
							<h1 className="text-3xl font-semibold tracking-tight">
								{t('page.title')}
							</h1>
							<p className="mt-1 text-sm text-muted-foreground">
								{t('page.form.desc')}
							</p>
						</div>
						<Button variant="secondary" asChild>
							<Link to="/media">{tMediaDetail('back')}</Link>
						</Button>
					</div>

					<form
						className="glass rounded-2xl p-6"
						onSubmit={(e) => {
							e.preventDefault()
							const form = e.currentTarget
							const formData = new FormData(form)
							const raw = {
								url: String(formData.get('url') ?? '').trim(),
								quality: String(formData.get('quality') ?? '1080p'),
								proxyId: String(formData.get('proxyId') ?? 'none'),
							}

							const parsed = FormSchema.safeParse(raw)
							if (!parsed.success) {
								toast.error(t('page.errors.missingUrl'))
								startMutation.reset()
								return
							}

							startMutation.mutate({
								url: parsed.data.url,
								quality: parsed.data.quality,
								proxyId:
									parsed.data.proxyId && parsed.data.proxyId !== 'none'
										? parsed.data.proxyId
										: undefined,
							})
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="url">{t('page.form.urlLabel')}</Label>
							<div className="relative">
								<Play className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									id="url"
									name="url"
									type="url"
									required
									placeholder={t('page.form.urlPlaceholder')}
									disabled={startMutation.isPending}
									className="pl-10"
								/>
							</div>
						</div>

						<div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="quality">{t('page.form.quality')}</Label>
								<Select
									name="quality"
									defaultValue="1080p"
									disabled={startMutation.isPending}
								>
									<SelectTrigger id="quality" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="1080p">
											{t('page.form.quality1080')}
										</SelectItem>
										<SelectItem value="720p">
											{t('page.form.quality720')}
										</SelectItem>
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">
									{t('page.form.qualityHint')}
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="proxyId">{t('page.form.proxyLabel')}</Label>
								<Select
									name="proxyId"
									key={defaultProxyId ?? 'none'}
									defaultValue={defaultProxyId ?? 'none'}
									disabled={startMutation.isPending || proxiesQuery.isLoading}
								>
									<SelectTrigger id="proxyId" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{proxies.map((p) => (
											<SelectItem key={p.id} value={p.id}>
												<span className="flex w-full items-center justify-between gap-2">
													<span className="truncate">
														{p.id === 'none'
															? tProxySelector('direct')
															: p.name || p.id}
													</span>
													{p.id !== 'none' ? (
														<ProxyStatusPill
															status={p.testStatus}
															responseTime={p.responseTime}
														/>
													) : null}
												</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{proxiesQuery.isLoading ? (
									<div className="flex items-center gap-2 text-xs text-muted-foreground">
										<Loader2 className="h-3.5 w-3.5 animate-spin" />
										Loading proxies…
									</div>
								) : null}
							</div>
						</div>

						<div className="mt-8 flex flex-col gap-3 sm:flex-row">
							<Button
								type="submit"
								className="h-11 flex-1"
								disabled={startMutation.isPending}
							>
								{startMutation.isPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										{t('page.form.submitPending')}
									</>
								) : (
									t('page.form.submit')
								)}
							</Button>
							<Button
								type="reset"
								variant="secondary"
								className="h-11"
								onClick={() => startMutation.reset()}
								disabled={startMutation.isPending}
							>
								<RotateCcw className="mr-2 h-4 w-4" />
								{t('page.form.reset')}
							</Button>
						</div>
					</form>
				</div>
			</div>
		</div>
	)
}
