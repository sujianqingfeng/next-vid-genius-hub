'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { Switch } from '~/components/ui/switch'
import { queryOrpc } from '~/lib/orpc/query-client'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'

type ProviderKind = 'llm' | 'asr'
type ProviderType = 'openai_compat' | 'deepseek_native' | 'cloudflare_asr'

type EditingProvider = {
	id?: string
	slug: string
	name: string
	kind: ProviderKind
	type: ProviderType
	baseUrl: string
	apiKey: string
	accountId: string
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
	enabled: true,
}

function isEditingProviderValid(editing: EditingProvider | null): boolean {
	if (!editing) return false
	if (!editing.slug.trim()) return false
	if (!editing.name.trim()) return false
	return true
}

export default function AdminAiProvidersPage() {
	const t = useTranslations('Admin.aiProviders')
	const qc = useQueryClient()
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
			: ['cloudflare_asr']
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
									providers.map((p) => (
										<div
											key={p.id}
											className="flex items-center justify-between rounded-md border border-border/60 p-3"
										>
											<div className="space-y-1">
												<div className="flex items-center gap-2">
													<div className="font-medium">{p.name}</div>
													<Badge variant={p.enabled ? 'default' : 'secondary'}>
														{p.enabled ? t('status.enabled') : t('status.disabled')}
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
															type: p.type,
									baseUrl: p.baseUrl ?? '',
									apiKey: '',
									accountId:
										typeof (p.metadata as any)?.accountId === 'string'
											? String((p.metadata as any).accountId)
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
													{p.enabled ? t('actions.disable') : t('actions.enable')}
												</Button>
												<Button
													variant="destructive"
													size="sm"
													disabled={deleteProvider.isPending}
													onClick={() => {
														const ok = window.confirm(
															t('confirm.delete', { name: p.name }),
														)
														if (!ok) return
														deleteProvider.mutate({ id: p.id })
													}}
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
									))
								)}
							</div>
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>

			<Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
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
							{editing.kind === 'asr' ? (
								<div className="space-y-2">
									<Label>{t('fields.accountId')}</Label>
									<Input
										placeholder="Cloudflare account id"
										value={editing.accountId}
										onChange={(e) =>
											setEditing({
												...editing,
												accountId: e.target.value,
											})
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
						<Button
							variant="secondary"
							onClick={() => setEditing(null)}
						>
							{t('actions.cancel')}
						</Button>
						<Button
							disabled={upsertProvider.isPending || !isValid}
							onClick={() => {
								if (!editing || !isEditingProviderValid(editing)) return
								upsertProvider.mutate({
									id: editing.id,
									slug: editing.slug.trim(),
									name: editing.name.trim(),
									kind: editing.kind,
									type: editing.type,
									baseUrl:
										editing.kind === 'llm'
											? editing.baseUrl.trim() || null
											: null,
									apiKey: editing.apiKey.trim() || undefined,
									metadata:
										editing.kind === 'asr' && editing.accountId.trim()
											? { accountId: editing.accountId.trim() }
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
