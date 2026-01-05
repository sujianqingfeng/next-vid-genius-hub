import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

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
import { useEnhancedMutation } from '~/lib/shared/hooks/useEnhancedMutation'

import { useTranslations } from '~/lib/shared/i18n'
import { queryOrpc } from '~/orpc/client'
import { cn } from '~/lib/shared/utils'

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
	if (
		editing.kind === 'asr' &&
		editing.id.trim().startsWith('whisper/') &&
		!editing.remoteModelId.trim()
	) {
		return false
	}
	if (!editing.label.trim()) return false
	return true
}

export function AdminAiModelsPage() {
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

	const editingProvider = useMemo(() => {
		if (!editing?.providerId) return null
		return providers.find((p) => p.id === editing.providerId) ?? null
	}, [editing?.providerId, providers])

	const editingProviderType =
		(editingProvider?.type as string | undefined) ?? undefined
	const isWhisperApiAsr = Boolean(
		editing?.kind === 'asr' && editingProviderType === 'whisper_api',
	)

	const isValid = isEditingModelValid(editing)

	return (
		<div className="space-y-8 font-sans">
			<div className="flex items-end justify-between border-b border-primary pb-4">
				<div>
					<div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
						System / Administration / AI_Models
					</div>
					<h1 className="text-3xl font-black uppercase tracking-tight">
						{t('title')}
					</h1>
				</div>
				<Button
					variant="primary"
					size="sm"
					className="rounded-none uppercase text-[10px] font-bold tracking-widest px-6 h-9"
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
					+ ADD_MODEL
				</Button>
			</div>

			<Tabs
				value={kind}
				onValueChange={(v) => setKind(v as ModelKind)}
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
						{models.length === 0 ? (
							<div className="lg:col-span-2 border border-dashed border-border p-12 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
								{t('empty')}
							</div>
						) : (
							models.map((m) => {
								const provider = providers.find((p) => p.id === m.providerId)
								return (
									<div
										key={m.id}
										className="border border-border bg-card p-6 flex flex-col justify-between group"
									>
										<div className="space-y-4">
											<div className="flex items-start justify-between border-b border-border pb-3">
												<div>
													<div className="font-mono text-xs font-black uppercase tracking-wider">
														{m.label}
													</div>
													<div className="font-mono text-[10px] text-muted-foreground mt-1 tracking-tighter lowercase">
														{m.id}
													</div>
												</div>
												<div className="flex gap-1">
													{m.isDefault && (
														<div className="bg-primary text-primary-foreground text-[8px] font-black px-1 uppercase tracking-tighter border border-primary">
															DEFAULT
														</div>
													)}
													<div
														className={cn(
															'px-2 py-0.5 text-[9px] font-bold uppercase border',
															m.enabled
																? 'bg-primary text-primary-foreground border-primary'
																: 'border-border text-muted-foreground',
														)}
													>
														{m.enabled
															? t('status.enabled')
															: t('status.disabled')}
													</div>
												</div>
											</div>

											<div className="space-y-1">
												<div className="font-mono text-[10px] text-muted-foreground uppercase tracking-tighter">
													PROVIDER:{' '}
													<span className="text-foreground font-bold">
														{provider?.slug || '---'}
													</span>
												</div>
												<div className="font-mono text-[10px] text-muted-foreground uppercase tracking-tighter">
													REMOTE_ID:{' '}
													<span className="text-foreground font-bold">
														{m.remoteModelId}
													</span>
												</div>
												{m.description && (
													<div className="font-mono text-[10px] text-muted-foreground bg-muted/30 p-2 mt-2 leading-relaxed">
														{m.description}
													</div>
												)}
											</div>
										</div>

										<div className="flex flex-wrap gap-1 mt-6 opacity-40 group-hover:opacity-100 transition-opacity">
											<Button
												variant="outline"
												size="xs"
												className="rounded-none border-border hover:bg-primary hover:text-primary-foreground uppercase text-[9px] font-bold px-3 h-8"
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
												EDIT
											</Button>
											<Button
												variant="outline"
												size="xs"
												className="rounded-none border-border hover:bg-primary hover:text-primary-foreground uppercase text-[9px] font-bold px-3 h-8"
												onClick={() =>
													toggleModel.mutate({
														id: m.id,
														enabled: !m.enabled,
													})
												}
											>
												{m.enabled ? t('actions.disable') : t('actions.enable')}
											</Button>
											{!m.isDefault ? (
												<Button
													variant="outline"
													size="xs"
													className="rounded-none border-border hover:bg-primary hover:text-primary-foreground uppercase text-[9px] font-bold px-3 h-8"
													onClick={() => setDefault.mutate({ kind, id: m.id })}
												>
													SET_DEF
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

			<Dialog
				open={!!editing}
				onOpenChange={(open) => !open && setEditing(null)}
			>
				<DialogContent className="rounded-none border-2 border-primary p-0 overflow-hidden max-w-lg">
					<DialogHeader className="bg-primary p-4 text-primary-foreground">
						<DialogTitle className="text-xs font-bold uppercase tracking-[0.2em]">
							{editing?.id ? 'EDIT_MODEL' : 'ADD_NEW_MODEL'} //{' '}
							{kind.toUpperCase()}
						</DialogTitle>
					</DialogHeader>
					{editing ? (
						<div className="p-6 space-y-6">
							<div className="space-y-2">
								<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									{t('fields.id')}
								</Label>
								<Input
									placeholder={
										editing.kind === 'asr'
											? isWhisperApiAsr
												? 'whisper/distil-large-v3'
												: '@cf/openai/whisper-...'
											: 'openai/gpt-...'
									}
									value={editing.id}
									onChange={(e) =>
										setEditing({
											...editing,
											id: e.target.value,
											...(isWhisperApiAsr &&
											e.target.value.startsWith('whisper/')
												? {
														remoteModelId: e.target.value.slice(
															'whisper/'.length,
														),
													}
												: {}),
										})
									}
									className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
								/>
							</div>
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
										{t('fields.provider')}
									</Label>
									<Select
										value={editing.providerId}
										onValueChange={(v) =>
											setEditing({ ...editing, providerId: v })
										}
									>
										<SelectTrigger className="h-9 rounded-none border-border font-mono text-[10px] uppercase tracking-wider">
											<SelectValue />
										</SelectTrigger>
										<SelectContent className="rounded-none border-border">
											{providerOptions.map((p) => (
												<SelectItem
													key={p.id}
													value={p.id}
													className="rounded-none font-mono text-[10px] uppercase tracking-wider"
												>
													{p.slug}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								{editing.kind === 'llm' || isWhisperApiAsr ? (
									<div className="space-y-2">
										<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
											{t('fields.remoteModelId')}
										</Label>
										<Input
											placeholder={
												isWhisperApiAsr ? 'distil-large-v3' : 'gpt-4.1-mini'
											}
											value={editing.remoteModelId}
											onChange={(e) =>
												setEditing((prev) => {
													if (!prev) return prev
													const remoteModelId = e.target.value
													if (!isWhisperApiAsr) {
														return { ...prev, remoteModelId }
													}
													const trimmed = remoteModelId.trim()
													return {
														...prev,
														remoteModelId,
														id: trimmed ? `whisper/${trimmed}` : prev.id,
													}
												})
											}
											className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
										/>
									</div>
								) : null}
							</div>
							<div className="space-y-2">
								<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									{t('fields.label')}
								</Label>
								<Input
									value={editing.label}
									onChange={(e) =>
										setEditing({ ...editing, label: e.target.value })
									}
									className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
								/>
							</div>
							<div className="space-y-2">
								<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									{t('fields.description')}
								</Label>
								<Input
									value={editing.description}
									onChange={(e) =>
										setEditing({ ...editing, description: e.target.value })
									}
									className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
								/>
							</div>

							<div className="grid grid-cols-2 gap-4">
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

								<div className="flex items-center gap-3 border border-border p-3 bg-muted/20">
									<Switch
										checked={editing.isDefault}
										onCheckedChange={(checked) =>
											setEditing({ ...editing, isDefault: checked })
										}
										className="scale-75 data-[state=checked]:bg-primary"
									/>
									<span className="text-[10px] font-bold uppercase tracking-widest">
										{t('fields.isDefault')}
									</span>
								</div>
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
							disabled={upsertModel.isPending || !isValid}
							onClick={() => {
								if (!editing || !isEditingModelValid(editing)) return
								upsertModel.mutate({
									id: editing.id.trim(),
									kind: editing.kind,
									providerId: editing.providerId,
									remoteModelId:
										editing.kind === 'asr'
											? isWhisperApiAsr
												? editing.remoteModelId.trim()
												: editing.id.trim()
											: editing.remoteModelId.trim(),
									label: editing.label.trim(),
									description: editing.description.trim() || null,
									enabled: editing.enabled,
									isDefault: editing.isDefault,
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
