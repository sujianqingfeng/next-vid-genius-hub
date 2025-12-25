import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from '@tanstack/react-router'
import { Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
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
import { getUserFriendlyErrorMessage } from '~/lib/errors/client'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'

type ProxyRow = {
	id: string
	name?: string | null
	testStatus?: 'pending' | 'success' | 'failed' | null
	responseTime?: number | null
}

const FormSchema = z.object({
	url: z.string().url(),
	quality: z.enum(['1080p', '720p']).default('1080p'),
	proxyId: z.string().optional().default('none'),
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
	const navigate = useNavigate()

	const proxiesQuery = useQuery(
		queryOrpc.proxy.getActiveProxiesForDownload.queryOptions(),
	)
	const proxies = (proxiesQuery.data?.proxies ?? [
		{ id: 'none', name: 'No Proxy', testStatus: null, responseTime: null },
	]) as ProxyRow[]
	const defaultProxyId = proxiesQuery.data?.defaultProxyId ?? 'none'
	const defaultProxy =
		defaultProxyId && defaultProxyId !== 'none'
			? proxies.find((p) => p.id === defaultProxyId)
			: undefined
	const effectiveDefaultProxyId =
		defaultProxy?.testStatus === 'success' ? defaultProxyId : 'none'
	const successProxyIds = new Set(
		proxies
			.filter((p) => p.id !== 'none' && p.testStatus === 'success')
			.map((p) => p.id),
	)
	const hasSuccessProxy = successProxyIds.size > 0

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
			errorToast: ({ error }) => getUserFriendlyErrorMessage(error),
		},
	)

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
									Ingestion System
								</span>
								<span>/</span>
								<span>Resource Acquisition</span>
							</div>
							<h1 className="font-mono text-xl font-bold uppercase tracking-tight">
								{t('page.title')}
							</h1>
						</div>

						<Button
							variant="outline"
							size="sm"
							className="rounded-none font-mono text-xs uppercase tracking-wider"
							asChild
						>
							<Link to="/media">{tMediaDetail('back')}</Link>
						</Button>
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
				<div className="border border-border bg-card">
					<div className="border-b border-border bg-muted/30 px-6 py-3 flex items-center justify-between">
						<div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
							Task_Configuration_Interface
						</div>
						<div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground opacity-50">
							Status: Awaiting_Input
						</div>
					</div>

					<form
						className="p-8"
						onSubmit={(e) => {
							e.preventDefault()
							if (!proxiesQuery.isLoading && !hasSuccessProxy) {
								toast.error(t('page.errors.noProxy'))
								startMutation.reset()
								return
							}
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
						<div className="space-y-3">
							<Label
								htmlFor="url"
								className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
							>
								{t('page.form.urlLabel')}
							</Label>
							<div className="relative">
								<div className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-primary opacity-50">
									»
								</div>
								<Input
									id="url"
									name="url"
									type="url"
									required
									placeholder={t('page.form.urlPlaceholder')}
									disabled={startMutation.isPending}
									className="rounded-none border-border bg-background font-mono text-xs pl-10"
								/>
								<div className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[8px] uppercase text-muted-foreground opacity-30">
									RESOURCE_URI_INPUT
								</div>
							</div>
						</div>

						<div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
							<div className="space-y-3">
								<Label
									htmlFor="quality"
									className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
								>
									{t('page.form.quality')}
								</Label>
								<Select
									name="quality"
									defaultValue="1080p"
									disabled={startMutation.isPending}
								>
									<SelectTrigger
										id="quality"
										className="h-9 rounded-none border-border font-mono text-xs uppercase"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent className="rounded-none">
										<SelectItem
											value="1080p"
											className="font-mono text-xs uppercase"
										>
											{t('page.form.quality1080')}
										</SelectItem>
										<SelectItem
											value="720p"
											className="font-mono text-xs uppercase"
										>
											{t('page.form.quality720')}
										</SelectItem>
									</SelectContent>
								</Select>
								<p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">
									{t('page.form.qualityHint')}
								</p>
							</div>

							<div className="space-y-3">
								<Label
									htmlFor="proxyId"
									className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
								>
									{t('page.form.proxyLabel')}
								</Label>
								<Select
									name="proxyId"
									key={effectiveDefaultProxyId ?? 'none'}
									defaultValue={effectiveDefaultProxyId ?? 'none'}
									disabled={startMutation.isPending || proxiesQuery.isLoading}
								>
									<SelectTrigger
										id="proxyId"
										className="h-9 rounded-none border-border font-mono text-xs uppercase"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent className="rounded-none">
										{proxies.map((p) => (
											<SelectItem
												key={p.id}
												value={p.id}
												disabled={p.id !== 'none' && !successProxyIds.has(p.id)}
												className="font-mono text-xs uppercase"
											>
												<span className="flex w-full items-center justify-between gap-4">
													<span className="truncate">
														{p.id === 'none'
															? t('page.form.proxyAuto')
															: p.name || p.id}
													</span>
													{p.id !== 'none' && p.responseTime && (
														<span className="text-[8px] opacity-50 tracking-tighter">
															[{p.responseTime}ms]
														</span>
													)}
												</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{!proxiesQuery.isLoading && !hasSuccessProxy && (
									<p className="font-mono text-[9px] uppercase text-destructive">
										!! {t('page.errors.noProxy')}
									</p>
								)}
								{proxiesQuery.isLoading && (
									<div className="flex items-center gap-2 font-mono text-[9px] uppercase text-muted-foreground">
										<Loader2 className="h-3 w-3 animate-spin" />
										Polling_Gateways...
									</div>
								)}
							</div>
						</div>

						<div className="mt-12 flex flex-col gap-3 sm:flex-row">
							<Button
								type="submit"
								className="h-10 flex-1 rounded-none font-mono text-xs uppercase tracking-[0.2em]"
								disabled={
									startMutation.isPending ||
									(!proxiesQuery.isLoading && !hasSuccessProxy)
								}
							>
								{startMutation.isPending ? (
									<>
										<Loader2 className="mr-2 h-3 w-3 animate-spin" />
										QUEUING_TASK...
									</>
								) : (
									`[ ${t('page.form.submit')} ]`
								)}
							</Button>
							<Button
								type="reset"
								variant="outline"
								className="h-10 rounded-none font-mono text-xs uppercase tracking-widest px-6"
								onClick={() => startMutation.reset()}
								disabled={startMutation.isPending}
							>
								<RotateCcw className="mr-2 h-3 w-3" />
								{t('page.form.reset')}
							</Button>
						</div>
					</form>

					<div className="border-t border-border bg-muted/5 px-6 py-2">
						<div className="font-mono text-[8px] uppercase tracking-[0.3em] text-muted-foreground text-right">
							Kernel_Awaiting_Job_Dispatch
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
