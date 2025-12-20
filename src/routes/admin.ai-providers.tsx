import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useConfirmDialog } from '~/components/business/layout/confirm-dialog-provider'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogFooter,
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

import { useTranslations } from '../integrations/i18n'
import { queryOrpcNext } from '../integrations/orpc/next-client'

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

export const Route = createFileRoute('/admin/ai-providers')({
	loader: async ({ context }) => {
		await context.queryClient.prefetchQuery(
			queryOrpcNext.admin.listAiProviders.queryOptions({
				input: { kind: 'llm', enabledOnly: false },
			}),
		)
	},
	component: AdminAiProvidersPage,
})

function AdminAiProvidersPage() {
	const t = useTranslations('Admin.aiProviders')
	const qc = useQueryClient()
	const confirmDialog = useConfirmDialog()
	const [kind, setKind] = useState<ProviderKind>('llm')
	const [editing, setEditing] = useState<EditingProvider | null>(null)

	const listQuery = useQuery(
		queryOrpcNext.admin.listAiProviders.queryOptions({
			input: { kind, enabledOnly: false },
		}),
	)

	const providers = listQuery.data?.items ?? []

	const invalidateList = () =>
		qc.invalidateQueries({
			queryKey: queryOrpcNext.admin.listAiProviders.queryKey({
				input: { kind, enabledOnly: false },
			}),
		})

	const upsertProvider = useEnhancedMutation(
		queryOrpcNext.admin.upsertAiProvider.mutationOptions({
			onSuccess: () => {
				invalidateList()
				setEditing(null)
			},
		}),
		{ successToast: t('toast.saved') },
	)

	const toggleProvider = useEnhancedMutation(
		queryOrpcNext.admin.toggleAiProvider.mutationOptions({
			onSuccess: () => invalidateList(),
		}),
	)

	const testProvider = useEnhancedMutation(
		queryOrpcNext.admin.testAiProvider.mutationOptions(),
		{
			successToast: ({ data }) => data?.message || t('toast.testOk'),
			errorToast: t('toast.testFail'),
		},
	)

	const deleteProvider = useEnhancedMutation(
		queryOrpcNext.admin.deleteAiProvider.mutationOptions({
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
		<div className="space-y-6">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle>{t('title')}</CardTitle>
					<Button onClick={() => setEditing({ ...DEFAULT_PROVIDER, kind })}>
						{t('actions.add')}
					</Button>
				</CardHeader>
				<CardContent>
					<Tabs value={kind} onValueChange={(v) => setKind(v as ProviderKind)}>
						<TabsList>
							<TabsTrigger value="llm">{t('tabs.llm')}</TabsTrigger>
							<TabsTrigger value="asr">{t('tabs.asr')}</TabsTrigger>
						</TabsList>
						<TabsContent value={kind}>
							<div className="mt-4 space-y-3">
								{providers.length === 0 ? (
									<div className="text-sm text-muted-foreground">
										{t('empty')}
									</div>
								) : (
									providers.map((p) => {
										const meta = (p.metadata ?? {}) as any
										return (
											<div
												key={p.id}
												className="flex items-center justify-between rounded-md border border-border/60 p-3"
											>
												<div className="space-y-1">
													<div className="flex items-center gap-2">
														<div className="font-medium">{p.name}</div>
														<Badge
															variant={p.enabled ? 'default' : 'secondary'}
														>
															{p.enabled
																? t('status.enabled')
																: t('status.disabled')}
														</Badge>
													</div>
													<div className="text-xs text-muted-foreground">
														{p.slug} · {p.type}
													</div>
													{p.baseUrl ? (
														<div className="text-xs text-muted-foreground">
															{p.baseUrl}
														</div>
													) : null}
												</div>
												<div className="flex items-center gap-2">
													<Button
														variant="secondary"
														size="sm"
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
														{t('actions.edit')}
													</Button>
													<Button
														variant="outline"
														size="sm"
														onClick={() =>
															toggleProvider.mutate({
																id: p.id,
																enabled: !p.enabled,
															})
														}
													>
														{p.enabled
															? t('actions.disable')
															: t('actions.enable')}
													</Button>
													<Button
														variant="destructive"
														size="sm"
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
														{t('actions.delete')}
													</Button>
													{p.kind === 'llm' ? (
														<Button
															variant="outline"
															size="sm"
															disabled={testProvider.isPending}
															onClick={() =>
																testProvider.mutate({ providerId: p.id })
															}
														>
															{t('actions.test')}
														</Button>
													) : null}
												</div>
											</div>
										)
									})
								)}
							</div>
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>

			<Dialog
				open={!!editing}
				onOpenChange={(open) => !open && setEditing(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{editing?.id ? t('dialog.editTitle') : t('dialog.addTitle')}
						</DialogTitle>
					</DialogHeader>
					{editing ? (
						<div className="space-y-4">
							<div className="space-y-2">
								<Label>{t('fields.slug')}</Label>
								<Input
									value={editing.slug}
									onChange={(e) =>
										setEditing({ ...editing, slug: e.target.value })
									}
								/>
							</div>
							<div className="space-y-2">
								<Label>{t('fields.name')}</Label>
								<Input
									value={editing.name}
									onChange={(e) =>
										setEditing({ ...editing, name: e.target.value })
									}
								/>
							</div>
							<div className="space-y-2">
								<Label>{t('fields.type')}</Label>
								<Select
									value={editing.type}
									onValueChange={(v) =>
										setEditing({ ...editing, type: v as ProviderType })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{typeOptions.map((tp) => (
											<SelectItem key={tp} value={tp}>
												{tp}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							{editing.kind === 'llm' ? (
								<div className="space-y-2">
									<Label>{t('fields.baseUrl')}</Label>
									<Input
										placeholder="https://api.example.com/v1"
										value={editing.baseUrl}
										onChange={(e) =>
											setEditing({ ...editing, baseUrl: e.target.value })
										}
									/>
								</div>
							) : null}
							{editing.kind === 'asr' && editing.type === 'whisper_api' ? (
								<div className="space-y-2">
									<Label>{t('fields.baseUrl')}</Label>
									<Input
										placeholder="https://vid.temp-drop-files.store"
										value={editing.baseUrl}
										onChange={(e) =>
											setEditing({ ...editing, baseUrl: e.target.value })
										}
									/>
								</div>
							) : null}
							{editing.kind === 'asr' && editing.type === 'cloudflare_asr' ? (
								<div className="space-y-2">
									<Label>{t('fields.accountId')}</Label>
									<Input
										placeholder="Cloudflare account id"
										value={editing.accountId}
										onChange={(e) =>
											setEditing({ ...editing, accountId: e.target.value })
										}
									/>
								</div>
							) : null}
							{editing.kind === 'asr' ? (
								<div className="space-y-2">
									<Label>{t('fields.maxUploadBytes')}</Label>
									<Input
										placeholder={
											editing.type === 'whisper_api'
												? String(500 * 1024 * 1024)
												: String(4 * 1024 * 1024)
										}
										value={editing.maxUploadBytes}
										onChange={(e) =>
											setEditing({ ...editing, maxUploadBytes: e.target.value })
										}
									/>
								</div>
							) : null}
							{editing.kind === 'llm' || editing.kind === 'asr' ? (
								<div className="space-y-2">
									<Label>
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
									/>
								</div>
							) : null}
							<div className="flex items-center gap-2">
								<Switch
									checked={editing.enabled}
									onCheckedChange={(checked) =>
										setEditing({ ...editing, enabled: checked })
									}
								/>
								<span className="text-sm">{t('fields.enabled')}</span>
							</div>
						</div>
					) : null}
					<DialogFooter>
						<Button variant="secondary" onClick={() => setEditing(null)}>
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
						>
							{t('actions.save')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
