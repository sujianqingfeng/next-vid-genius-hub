import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useConfirmDialog } from '~/components/business/layout/confirm-dialog-provider'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
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
import { Switch } from '~/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'

import { useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'
import { cn } from '~/lib/utils'

type ProviderKind = 'llm' | 'asr'
type ProviderType =
	| 'openai_compat'
	| 'deepseek_native'
	| 'cloudflare_asr'
	| 'whisper_api'

type EditingProvider = {
	id?: string
	slug: string
	name: string
	kind: ProviderKind
	type: ProviderType
	baseUrl: string
	apiKey: string
	accountId: string
	maxUploadBytes: string
	enabled: boolean
}

const DEFAULT_PROVIDER: EditingProvider = {
	slug: '',
	name: '',
	kind: 'llm',
	type: 'openai_compat',
	baseUrl: '',
	apiKey: '',
	accountId: '',
	maxUploadBytes: '',
	enabled: true,
}

function isEditingProviderValid(editing: EditingProvider | null): boolean {
	if (!editing) return false
	if (!editing.slug.trim()) return false
	if (!editing.name.trim()) return false
	return true
}

export function AdminAiProvidersPage() {
	const t = useTranslations('Admin.aiProviders')
	const qc = useQueryClient()
	const confirmDialog = useConfirmDialog()
	const [kind, setKind] = useState<ProviderKind>('llm')
	const [editing, setEditing] = useState<EditingProvider | null>(null)

	const listQuery = useQuery(
		queryOrpc.admin.listAiProviders.queryOptions({
			input: { kind, enabledOnly: false },
		}),
	)

	const providers = listQuery.data?.items ?? []

	const invalidateList = () =>
		qc.invalidateQueries({
			queryKey: queryOrpc.admin.listAiProviders.queryKey({
				input: { kind, enabledOnly: false },
			}),
		})

	const upsertProvider = useEnhancedMutation(
		queryOrpc.admin.upsertAiProvider.mutationOptions({
			onSuccess: () => {
				invalidateList()
				setEditing(null)
			},
		}),
		{ successToast: t('toast.saved') },
	)

	const toggleProvider = useEnhancedMutation(
		queryOrpc.admin.toggleAiProvider.mutationOptions({
			onSuccess: () => invalidateList(),
		}),
	)

	const testProvider = useEnhancedMutation(
		queryOrpc.admin.testAiProvider.mutationOptions(),
		{
			successToast: ({ data }) => data?.message || t('toast.testOk'),
			errorToast: t('toast.testFail'),
		},
	)

	const deleteProvider = useEnhancedMutation(
		queryOrpc.admin.deleteAiProvider.mutationOptions({
			onSuccess: () => invalidateList(),
		}),
		{ successToast: t('toast.deleted'), errorToast: t('toast.deleteFail') },
	)

	const typeOptions = useMemo<ProviderType[]>(() => {
		return kind === 'llm'
			? ['openai_compat', 'deepseek_native']
			: ['cloudflare_asr', 'whisper_api']
	}, [kind])

	const isValid = isEditingProviderValid(editing)

	return (
		<div className="space-y-8 font-sans">
			<div className="flex items-end justify-between border-b border-primary pb-4">
				<div>
					<div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
						System / Administration / AI_Providers
					</div>
					<h1 className="text-3xl font-black uppercase tracking-tight">
						{t('title')}
					</h1>
				</div>
				<Button
					variant="primary"
					size="sm"
					className="rounded-none uppercase text-[10px] font-bold tracking-widest px-6 h-9"
					onClick={() => setEditing({ ...DEFAULT_PROVIDER, kind })}
				>
					+ ADD_PROVIDER
				</Button>
			</div>

			<Tabs
				value={kind}
				onValueChange={(v) => setKind(v as ProviderKind)}
				className="space-y-0"
			>
				<TabsList className="h-auto w-full justify-start rounded-none bg-transparent p-0 border-b border-border mb-8">
					<TabsTrigger
						value="llm"
						className="rounded-none border-b-2 border-transparent px-8 py-3 text-xs font-bold uppercase tracking-[0.2em] data-[state=active]:border-primary data-[state=active]:bg-muted/50 data-[state=active]:shadow-none"
					>
						{t('tabs.llm')}
					</TabsTrigger>
					<TabsTrigger
						value="asr"
						className="rounded-none border-b-2 border-transparent px-8 py-3 text-xs font-bold uppercase tracking-[0.2em] data-[state=active]:border-primary data-[state=active]:bg-muted/50 data-[state=active]:shadow-none"
					>
						{t('tabs.asr')}
					</TabsTrigger>
				</TabsList>

				<TabsContent value={kind} className="mt-0 outline-none">
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
						{providers.length === 0 ? (
							<div className="lg:col-span-2 border border-dashed border-border p-12 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
								{t('empty')}
							</div>
						) : (
							providers.map((p) => {
								const meta = (p.metadata ?? {}) as any
								return (
									<div
										key={p.id}
										className="border border-border bg-card p-6 flex flex-col justify-between group"
									>
										<div className="space-y-4">
											<div className="flex items-start justify-between border-b border-border pb-3">
												<div>
													<div className="font-mono text-xs font-black uppercase tracking-wider">
														{p.name}
													</div>
													<div className="font-mono text-[10px] text-muted-foreground mt-1 tracking-tighter lowercase">
														{p.slug} // {p.type}
													</div>
												</div>
												<div
													className={cn(
														'px-2 py-0.5 text-[9px] font-bold uppercase border',
														p.enabled
															? 'bg-primary text-primary-foreground border-primary'
															: 'border-border text-muted-foreground',
													)}
												>
													{p.enabled
														? t('status.enabled')
														: t('status.disabled')}
												</div>
											</div>

											<div className="space-y-2">
												{p.baseUrl ? (
													<div className="font-mono text-[10px] text-muted-foreground break-all bg-muted/30 p-2">
														BASE_URL: {p.baseUrl}
													</div>
												) : null}
												{meta.accountId ? (
													<div className="font-mono text-[10px] text-muted-foreground break-all bg-muted/30 p-2">
														ACCOUNT_ID: {meta.accountId}
													</div>
												) : null}
											</div>
										</div>

										<div className="flex flex-wrap gap-1 mt-6 opacity-40 group-hover:opacity-100 transition-opacity">
											<Button
												variant="outline"
												size="xs"
												className="rounded-none border-border hover:bg-primary hover:text-primary-foreground uppercase text-[9px] font-bold px-3 h-8"
												onClick={() =>
													setEditing({
														id: p.id,
														slug: p.slug,
														name: p.name,
														kind: p.kind,
														type: p.type as ProviderType,
														baseUrl: p.baseUrl ?? '',
														apiKey: '',
														accountId:
															typeof meta?.accountId === 'string'
																? String(meta.accountId)
																: '',
														maxUploadBytes:
															typeof meta?.maxUploadBytes === 'number'
																? String(meta.maxUploadBytes)
																: '',
														enabled: Boolean(p.enabled),
													})
												}
											>
												EDIT
											</Button>
											<Button
												variant="outline"
												size="xs"
												className="rounded-none border-border hover:bg-primary hover:text-primary-foreground uppercase text-[9px] font-bold px-3 h-8"
												onClick={() =>
													toggleProvider.mutate({
														id: p.id,
														enabled: !p.enabled,
													})
												}
											>
												{p.enabled ? t('actions.disable') : t('actions.enable')}
											</Button>
											{p.kind === 'llm' ? (
												<Button
													variant="outline"
													size="xs"
													className="rounded-none border-border hover:bg-primary hover:text-primary-foreground uppercase text-[9px] font-bold px-3 h-8"
													disabled={testProvider.isPending}
													onClick={() =>
														testProvider.mutate({ providerId: p.id })
													}
												>
													TEST_SIG
												</Button>
											) : null}
											<Button
												variant="destructive"
												size="xs"
												className="rounded-none uppercase text-[9px] font-bold px-3 h-8 ml-auto"
												disabled={deleteProvider.isPending}
												onClick={() =>
													void (async () => {
														const ok = await confirmDialog({
															description: t('confirm.delete', {
																name: p.name,
															}),
															variant: 'destructive',
														})
														if (!ok) return
														deleteProvider.mutate({ id: p.id })
													})()
												}
											>
												DEL
											</Button>
										</div>
									</div>
								)
							})
						)}
					</div>
				</TabsContent>
			</Tabs>

			<Dialog
				open={!!editing}
				onOpenChange={(open) => !open && setEditing(null)}
			>
				<DialogContent className="rounded-none border-2 border-primary p-0 overflow-hidden max-w-lg">
					<DialogHeader className="bg-primary p-4 text-primary-foreground">
						<DialogTitle className="text-xs font-bold uppercase tracking-[0.2em]">
							{editing?.id ? 'EDIT_PROVIDER' : 'ADD_NEW_PROVIDER'} //{' '}
							{kind.toUpperCase()}
						</DialogTitle>
					</DialogHeader>
					{editing ? (
						<div className="p-6 space-y-6">
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
										{t('fields.slug')}
									</Label>
									<Input
										value={editing.slug}
										onChange={(e) =>
											setEditing({ ...editing, slug: e.target.value })
										}
										className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
									/>
								</div>
								<div className="space-y-2">
									<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
										{t('fields.name')}
									</Label>
									<Input
										value={editing.name}
										onChange={(e) =>
											setEditing({ ...editing, name: e.target.value })
										}
										className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
									/>
								</div>
							</div>
							<div className="space-y-2">
								<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									{t('fields.type')}
								</Label>
								<Select
									value={editing.type}
									onValueChange={(v) =>
										setEditing({ ...editing, type: v as ProviderType })
									}
								>
									<SelectTrigger className="h-9 rounded-none border-border font-mono text-[10px] uppercase tracking-wider">
										<SelectValue />
									</SelectTrigger>
									<SelectContent className="rounded-none border-border">
										{typeOptions.map((tp) => (
											<SelectItem
												key={tp}
												value={tp}
												className="rounded-none font-mono text-[10px] uppercase tracking-wider"
											>
												{tp}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							{editing.kind === 'llm' ? (
								<div className="space-y-2">
									<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
										{t('fields.baseUrl')}
									</Label>
									<Input
										placeholder="https://api.example.com/v1"
										value={editing.baseUrl}
										onChange={(e) =>
											setEditing({ ...editing, baseUrl: e.target.value })
										}
										className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
									/>
								</div>
							) : null}
							{editing.kind === 'asr' && editing.type === 'whisper_api' ? (
								<div className="space-y-2">
									<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
										{t('fields.baseUrl')}
									</Label>
									<Input
										placeholder="https://vid.temp-drop-files.store"
										value={editing.baseUrl}
										onChange={(e) =>
											setEditing({ ...editing, baseUrl: e.target.value })
										}
										className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
									/>
								</div>
							) : null}
							{editing.kind === 'asr' && editing.type === 'cloudflare_asr' ? (
								<div className="space-y-2">
									<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
										{t('fields.accountId')}
									</Label>
									<Input
										placeholder="CLOUDFLARE_ID"
										value={editing.accountId}
										onChange={(e) =>
											setEditing({ ...editing, accountId: e.target.value })
										}
										className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
									/>
								</div>
							) : null}
							<div className="grid grid-cols-2 gap-4">
								{editing.kind === 'asr' ? (
									<div className="space-y-2">
										<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
											{t('fields.maxUploadBytes')}
										</Label>
										<Input
											placeholder="524288000"
											value={editing.maxUploadBytes}
											onChange={(e) =>
												setEditing({
													...editing,
													maxUploadBytes: e.target.value,
												})
											}
											className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
										/>
									</div>
								) : null}
								<div className="space-y-2 flex-1">
									<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
										{editing.kind === 'asr'
											? t('fields.apiToken')
											: t('fields.apiKey')}
									</Label>
									<Input
										type="password"
										value={editing.apiKey}
										onChange={(e) =>
											setEditing({ ...editing, apiKey: e.target.value })
										}
										className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
									/>
								</div>
							</div>
							<div className="flex items-center gap-3 border border-border p-3 bg-muted/20">
								<Switch
									checked={editing.enabled}
									onCheckedChange={(checked) =>
										setEditing({ ...editing, enabled: checked })
									}
									className="scale-75 data-[state=checked]:bg-primary"
								/>
								<span className="text-[10px] font-bold uppercase tracking-widest">
									{t('fields.enabled')}
								</span>
							</div>
						</div>
					) : null}
					<div className="flex border-t border-border">
						<Button
							variant="ghost"
							onClick={() => setEditing(null)}
							className="flex-1 rounded-none border-r border-border h-12 uppercase text-xs font-bold tracking-widest hover:bg-muted"
						>
							{t('actions.cancel')}
						</Button>
						<Button
							disabled={upsertProvider.isPending || !isValid}
							onClick={() => {
								if (!editing || !isEditingProviderValid(editing)) return
								const maxUploadBytesRaw = editing.maxUploadBytes.trim()
								const maxUploadBytes = maxUploadBytesRaw
									? Number(maxUploadBytesRaw)
									: undefined
								const asrMetadata =
									editing.kind === 'asr'
										? {
												...(editing.accountId.trim()
													? { accountId: editing.accountId.trim() }
													: {}),
												...(typeof maxUploadBytes === 'number' &&
												Number.isFinite(maxUploadBytes) &&
												maxUploadBytes > 0
													? { maxUploadBytes }
													: {}),
											}
										: undefined

								upsertProvider.mutate({
									id: editing.id,
									slug: editing.slug.trim(),
									name: editing.name.trim(),
									kind: editing.kind,
									type: editing.type,
									baseUrl:
										editing.kind === 'llm' || editing.type === 'whisper_api'
											? editing.baseUrl.trim() || null
											: null,
									apiKey: editing.apiKey.trim() || undefined,
									metadata:
										asrMetadata && Object.keys(asrMetadata).length > 0
											? asrMetadata
											: undefined,
									enabled: editing.enabled,
								})
							}}
							className="flex-1 rounded-none h-12 bg-primary text-primary-foreground uppercase text-xs font-bold tracking-widest hover:bg-primary/90"
						>
							{t('actions.save')}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
