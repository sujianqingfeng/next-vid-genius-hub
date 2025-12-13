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

type ModelKind = 'llm' | 'asr'

type EditingModel = {
	id: string
	kind: ModelKind
	providerId: string
	remoteModelId: string
	label: string
	description: string
	enabled: boolean
	isDefault: boolean
}

function isEditingModelValid(editing: EditingModel | null): boolean {
	if (!editing) return false
	if (!editing.id.trim()) return false
	if (!editing.providerId) return false
	if (editing.kind === 'llm' && !editing.remoteModelId.trim()) return false
	if (!editing.label.trim()) return false
	return true
}

export default function AdminAiModelsPage() {
	const t = useTranslations('Admin.aiModels')
	const qc = useQueryClient()
	const [kind, setKind] = useState<ModelKind>('llm')
	const [editing, setEditing] = useState<EditingModel | null>(null)

	const providersQuery = useQuery(
		queryOrpc.admin.listAiProviders.queryOptions({
			input: { kind, enabledOnly: false },
		}),
	)
	const providers = providersQuery.data?.items ?? []

	const modelsQuery = useQuery(
		queryOrpc.admin.listAiModels.queryOptions({
			input: { kind, enabledOnly: false },
		}),
	)
	const models = modelsQuery.data?.items ?? []

	const invalidateList = () =>
		qc.invalidateQueries({
			queryKey: queryOrpc.admin.listAiModels.queryKey({
				input: { kind, enabledOnly: false },
			}),
		})

	const upsertModel = useEnhancedMutation(
		queryOrpc.admin.upsertAiModel.mutationOptions({
			onSuccess: () => {
				invalidateList()
				setEditing(null)
			},
		}),
		{ successToast: t('toast.saved') },
	)

	const toggleModel = useEnhancedMutation(
		queryOrpc.admin.toggleAiModel.mutationOptions({
			onSuccess: () => invalidateList(),
		}),
	)

	const setDefault = useEnhancedMutation(
		queryOrpc.admin.setDefaultAiModel.mutationOptions({
			onSuccess: () => invalidateList(),
		}),
		{ successToast: t('toast.defaultSet') },
	)

	const providerOptions = useMemo(
		() => providers.filter((p) => p.kind === kind),
		[kind, providers],
	)

	const isValid = isEditingModelValid(editing)

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle>{t('title')}</CardTitle>
					<Button
						onClick={() =>
							setEditing({
								id: '',
								kind,
								providerId: providerOptions[0]?.id ?? '',
								remoteModelId: '',
								label: '',
								description: '',
								enabled: true,
								isDefault: false,
							})
						}
					>
						{t('actions.add')}
					</Button>
				</CardHeader>
				<CardContent>
					<Tabs value={kind} onValueChange={(v) => setKind(v as ModelKind)}>
						<TabsList>
							<TabsTrigger value="llm">{t('tabs.llm')}</TabsTrigger>
							<TabsTrigger value="asr">{t('tabs.asr')}</TabsTrigger>
						</TabsList>
						<TabsContent value={kind}>
							<div className="mt-4 space-y-3">
								{models.length === 0 ? (
									<div className="text-sm text-muted-foreground">
										{t('empty')}
									</div>
								) : (
									models.map((m) => {
										const provider = providers.find(
											(p) => p.id === m.providerId,
										)
										return (
											<div
												key={m.id}
												className="flex items-center justify-between rounded-md border border-border/60 p-3"
											>
												<div className="space-y-1">
													<div className="flex items-center gap-2">
														<div className="font-medium">
															{m.label}
														</div>
														{m.isDefault ? (
															<Badge>{t('status.default')}</Badge>
														) : null}
														<Badge
															variant={
																m.enabled
																	? 'default'
																	: 'secondary'
															}
														>
															{m.enabled
																? t('status.enabled')
																: t('status.disabled')}
														</Badge>
													</div>
													<div className="text-xs text-muted-foreground">
														{m.id}
													</div>
													<div className="text-xs text-muted-foreground">
														{provider?.slug} · {m.remoteModelId}
													</div>
												</div>
												<div className="flex items-center gap-2">
													<Button
														variant="secondary"
														size="sm"
														onClick={() =>
															setEditing({
																id: m.id,
																kind: m.kind,
																providerId: m.providerId,
																remoteModelId: m.remoteModelId,
																label: m.label,
																description: m.description ?? '',
																enabled: Boolean(m.enabled),
																isDefault: Boolean(m.isDefault),
															})
														}
													>
														{t('actions.edit')}
													</Button>
													<Button
														variant="outline"
														size="sm"
														onClick={() =>
															toggleModel.mutate({
																id: m.id,
																enabled: !m.enabled,
															})
														}
													>
														{m.enabled
															? t('actions.disable')
															: t('actions.enable')}
													</Button>
													{!m.isDefault ? (
														<Button
															variant="outline"
															size="sm"
															onClick={() =>
																setDefault.mutate({
																	kind,
																	id: m.id,
																})
															}
														>
															{t('actions.setDefault')}
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
								<Label>{t('fields.id')}</Label>
								<Input
									placeholder={
										editing.kind === 'asr'
											? '@cf/openai/whisper-...'
											: 'openai/gpt-...'
									}
									value={editing.id}
									onChange={(e) =>
										setEditing({ ...editing, id: e.target.value })
									}
								/>
							</div>
							<div className="space-y-2">
								<Label>{t('fields.provider')}</Label>
								<Select
									value={editing.providerId}
									onValueChange={(v) =>
										setEditing({ ...editing, providerId: v })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{providerOptions.map((p) => (
											<SelectItem key={p.id} value={p.id}>
												{p.slug}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							{editing.kind === 'llm' ? (
								<div className="space-y-2">
									<Label>{t('fields.remoteModelId')}</Label>
									<Input
										placeholder="gpt-4.1-mini"
										value={editing.remoteModelId}
										onChange={(e) =>
											setEditing({
												...editing,
												remoteModelId: e.target.value,
											})
										}
									/>
								</div>
							) : null}
							<div className="space-y-2">
								<Label>{t('fields.label')}</Label>
								<Input
									value={editing.label}
									onChange={(e) =>
										setEditing({ ...editing, label: e.target.value })
									}
								/>
							</div>
							<div className="space-y-2">
								<Label>{t('fields.description')}</Label>
								<Input
									value={editing.description}
									onChange={(e) =>
										setEditing({
											...editing,
											description: e.target.value,
										})
									}
								/>
							</div>

							<div className="flex items-center gap-2">
								<Switch
									checked={editing.enabled}
									onCheckedChange={(checked) =>
										setEditing({ ...editing, enabled: checked })
									}
								/>
								<span className="text-sm">{t('fields.enabled')}</span>
							</div>

							<div className="flex items-center gap-2">
								<Switch
									checked={editing.isDefault}
									onCheckedChange={(checked) =>
										setEditing({ ...editing, isDefault: checked })
									}
								/>
								<span className="text-sm">{t('fields.isDefault')}</span>
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
							disabled={upsertModel.isPending || !isValid}
							onClick={() => {
								if (!editing || !isEditingModelValid(editing)) return
								upsertModel.mutate({
									id: editing.id.trim(),
									kind: editing.kind,
									providerId: editing.providerId,
									remoteModelId:
										editing.kind === 'asr'
											? editing.id.trim()
											: editing.remoteModelId.trim(),
									label: editing.label.trim(),
									description:
										editing.description.trim() || null,
									enabled: editing.enabled,
									isDefault: editing.isDefault,
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
