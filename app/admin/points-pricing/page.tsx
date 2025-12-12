'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { Input } from '~/components/ui/input'
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
import { queryOrpc } from '~/lib/orpc/query-client'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { ChatModelIds } from '~/lib/ai/models'
import { WHISPER_MODEL_IDS, getModelLabel } from '~/lib/subtitle/config/models'

type ResourceFilter = 'all' | 'llm' | 'asr' | 'download'

type EditingRule = {
	id?: string
	resourceType: 'llm' | 'asr' | 'download'
	modelId: string
	unit: 'token' | 'second' | 'minute'
	pricePerUnit: number
	inputPricePerUnit: number
	outputPricePerUnit: number
	minCharge: number | ''
}

const DEFAULT_EDITING_RULE: EditingRule = {
	resourceType: 'download',
	modelId: '',
	unit: 'minute',
	pricePerUnit: 1,
	inputPricePerUnit: 1,
	outputPricePerUnit: 1,
	minCharge: 1,
}

export default function AdminPointsPricingPage() {
	const t = useTranslations('Admin.pointsPricing')
	const qc = useQueryClient()
	const [page, setPage] = useState(1)
	const [resourceFilter, setResourceFilter] = useState<ResourceFilter>('all')
	const [editingRule, setEditingRule] = useState<EditingRule | null>(null)

	const listQuery = useQuery({
		...queryOrpc.admin.listPricingRules.queryOptions({
			input: {
				page,
				limit: 50,
				resourceType: resourceFilter === 'all' ? undefined : resourceFilter,
			},
		}),
		keepPreviousData: true,
	})

	const invalidateList = () =>
		qc.invalidateQueries({ queryKey: queryOrpc.admin.listPricingRules.key() })

	const upsertRule = useEnhancedMutation(
		queryOrpc.admin.upsertPricingRule.mutationOptions({
			onSuccess: () => {
				invalidateList()
				setEditingRule(null)
			},
		}),
		{
			successToast: t('toast.saved'),
			errorToast: ({ error }) => (error as Error)?.message || t('toast.saveError'),
		},
	)

	const deleteRule = useEnhancedMutation(
		queryOrpc.admin.deletePricingRule.mutationOptions({
			onSuccess: invalidateList,
		}),
		{
			successToast: t('toast.deleted'),
			errorToast: ({ error }) => (error as Error)?.message || t('toast.deleteError'),
		},
	)

	const rules = listQuery.data?.items ?? []
	const pageCount = listQuery.data?.pageCount ?? 1
	const total = listQuery.data?.total ?? 0

	const isBusy = listQuery.isFetching || upsertRule.isPending || deleteRule.isPending

	const summary = useMemo(
		() => ({
			total,
		}),
		[total],
	)

	const handleOpenNew = () => {
		setEditingRule(DEFAULT_EDITING_RULE)
	}

		const handleEdit = (rule: any) => {
			setEditingRule({
				id: rule.id,
				resourceType: rule.resourceType,
				modelId: rule.modelId ?? '',
				unit: rule.unit,
				pricePerUnit: rule.pricePerUnit,
				inputPricePerUnit: typeof rule.inputPricePerUnit === 'number' ? rule.inputPricePerUnit : 0,
				outputPricePerUnit: typeof rule.outputPricePerUnit === 'number' ? rule.outputPricePerUnit : 0,
				minCharge: typeof rule.minCharge === 'number' ? rule.minCharge : '',
			})
		}

		const handleSave = () => {
			if (!editingRule) return
			const payload = {
				id: editingRule.id,
				resourceType: editingRule.resourceType,
				modelId:
					editingRule.resourceType === 'download'
						? null
						: editingRule.modelId.trim() || null,
				unit: editingRule.unit,
				pricePerUnit:
					editingRule.resourceType === 'llm'
						? 0
						: Number.isFinite(editingRule.pricePerUnit)
								? editingRule.pricePerUnit
								: 0,
				inputPricePerUnit:
					editingRule.resourceType === 'llm'
						? (Number.isFinite(editingRule.inputPricePerUnit) ? editingRule.inputPricePerUnit : 0)
						: null,
				outputPricePerUnit:
					editingRule.resourceType === 'llm'
						? (Number.isFinite(editingRule.outputPricePerUnit) ? editingRule.outputPricePerUnit : 0)
						: null,
				minCharge:
					editingRule.minCharge === '' ? null : Number(editingRule.minCharge ?? 0),
			}
			upsertRule.mutate(payload as any)
		}

	const handleDelete = (id: string) => {
		if (!id) return
		deleteRule.mutate({ id } as any)
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
					<p className="text-sm text-muted-foreground">
						{t('subtitle', { total: summary.total })}
					</p>
				</div>
				<Badge variant="secondary" className="gap-1">
					{t('badge')}
				</Badge>
			</div>

			<Card className="border-border/60 shadow-sm">
				<CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<CardTitle className="text-lg">{t('table.title')}</CardTitle>
					<div className="flex flex-wrap items-center gap-3">
						<Select
							value={resourceFilter}
							onValueChange={(v) => {
								setPage(1)
								setResourceFilter(v as ResourceFilter)
							}}
						>
							<SelectTrigger className="w-[180px]">
								<SelectValue placeholder={t('filters.resource.all')} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">{t('filters.resource.all')}</SelectItem>
								<SelectItem value="llm">{t('filters.resource.llm')}</SelectItem>
								<SelectItem value="asr">{t('filters.resource.asr')}</SelectItem>
								<SelectItem value="download">
									{t('filters.resource.download')}
								</SelectItem>
							</SelectContent>
						</Select>
						<Button
							variant="secondary"
							onClick={handleOpenNew}
							disabled={isBusy}
							className="ml-auto"
						>
							{t('actions.add')}
						</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="overflow-x-auto rounded-lg border border-border/60">
						<table className="min-w-full text-sm">
							<thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
								<tr>
									<th className="px-4 py-3 font-medium">
										{t('table.resourceType')}
									</th>
										<th className="px-4 py-3 font-medium">
											{t('table.modelId')}
										</th>
										<th className="px-4 py-3 font-medium">{t('table.unit')}</th>
										{resourceFilter === 'llm' ? (
											<>
												<th className="px-4 py-3 font-medium">
													{t('table.inputPricePerUnit')}
												</th>
												<th className="px-4 py-3 font-medium">
													{t('table.outputPricePerUnit')}
												</th>
											</>
										) : (
											<th className="px-4 py-3 font-medium">
												{t('table.pricePerUnit')}
											</th>
										)}
										<th className="px-4 py-3 font-medium">
											{t('table.minCharge')}
										</th>
									<th className="px-4 py-3 font-medium">
										{t('table.updatedAt')}
									</th>
									<th className="px-4 py-3 font-medium text-right">
										{t('table.actions')}
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{rules.map((rule: any) => (
									<tr key={rule.id} className="hover:bg-muted/30">
										<td className="px-4 py-3 font-medium">
											<Badge variant="outline" className="uppercase">
												{rule.resourceType}
											</Badge>
										</td>
										<td className="px-4 py-3 text-muted-foreground">
											{rule.modelId || t('labels.defaultModel')}
										</td>
											<td className="px-4 py-3 text-muted-foreground">{rule.unit}</td>
											{resourceFilter === 'llm' ? (
												<>
													<td className="px-4 py-3 text-muted-foreground">
														{rule.inputPricePerUnit ?? 0}
													</td>
													<td className="px-4 py-3 text-muted-foreground">
														{rule.outputPricePerUnit ?? 0}
													</td>
												</>
											) : (
												<td className="px-4 py-3 text-muted-foreground">
													{rule.resourceType === 'llm'
														? `${rule.inputPricePerUnit ?? 0} / ${rule.outputPricePerUnit ?? 0}`
														: rule.pricePerUnit}
												</td>
											)}
											<td className="px-4 py-3 text-muted-foreground">
												{rule.minCharge ?? t('labels.none')}
											</td>
										<td className="px-4 py-3 text-muted-foreground">
											{rule.updatedAt
												? new Date(rule.updatedAt).toLocaleString()
												: '—'}
										</td>
										<td className="px-4 py-3 text-right">
											<div className="flex justify-end gap-2">
												<Button
													size="sm"
													variant="secondary"
													onClick={() => handleEdit(rule)}
													disabled={isBusy}
												>
													{t('actions.edit')}
												</Button>
												<Button
													size="sm"
													variant="outline"
													onClick={() => handleDelete(rule.id)}
													disabled={isBusy}
												>
													{t('actions.delete')}
												</Button>
											</div>
										</td>
									</tr>
								))}
								{!listQuery.isLoading && rules.length === 0 && (
									<tr>
										<td
											colSpan={7}
											className="px-4 py-6 text-center text-muted-foreground"
										>
											{t('empty')}
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>

					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<p className="text-xs text-muted-foreground">
							{t('pagination', { page, pages: pageCount, total: summary.total })}
						</p>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={page === 1 || listQuery.isFetching}
								onClick={() => setPage((p) => Math.max(1, p - 1))}
							>
								{t('prev')}
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={page >= pageCount || listQuery.isFetching}
								onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
							>
								{t('next')}
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			<Dialog open={Boolean(editingRule)} onOpenChange={(open) => !open && setEditingRule(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{editingRule?.id ? t('dialogs.editTitle') : t('dialogs.addTitle')}
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-4 pt-2">
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<label className="text-xs font-medium text-muted-foreground">
									{t('form.resourceType')}
								</label>
										<Select
											value={editingRule?.resourceType ?? 'download'}
											onValueChange={(v) =>
												setEditingRule((prev) =>
													prev
														? prev.resourceType === v
															? prev
															: {
																	...prev,
																	resourceType: v as any,
																	modelId: '',
																	unit: v === 'llm' ? 'token' : 'minute',
																}
														: prev,
												)
											}
										>
									<SelectTrigger className="h-9">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="llm">
											{t('filters.resource.llm')}
										</SelectItem>
										<SelectItem value="asr">
											{t('filters.resource.asr')}
										</SelectItem>
										<SelectItem value="download">
											{t('filters.resource.download')}
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<label className="text-xs font-medium text-muted-foreground">
									{t('form.unit')}
								</label>
									<Select
										value={editingRule?.unit ?? 'minute'}
										onValueChange={(v) =>
											setEditingRule((prev) =>
												prev ? { ...prev, unit: v as any } : prev,
											)
										}
										disabled={editingRule?.resourceType === 'llm'}
									>
									<SelectTrigger className="h-9">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="token">{t('form.units.token')}</SelectItem>
										<SelectItem value="second">{t('form.units.second')}</SelectItem>
										<SelectItem value="minute">{t('form.units.minute')}</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
							<div className="space-y-2">
								<label className="text-xs font-medium text-muted-foreground">
									{t('form.modelId')}
								</label>
								<Select
									value={editingRule?.modelId ?? ''}
									onValueChange={(v) =>
										setEditingRule((prev) =>
											prev ? { ...prev, modelId: v } : prev,
										)
									}
									disabled={editingRule?.resourceType === 'download'}
								>
									<SelectTrigger className="h-9">
										<SelectValue placeholder={t('form.modelIdPlaceholder')} />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="">
											{t('labels.defaultModel')}
										</SelectItem>
										{editingRule?.resourceType === 'llm' &&
											ChatModelIds.map((modelId) => (
												<SelectItem key={modelId} value={modelId}>
													{modelId}
												</SelectItem>
											))}
										{editingRule?.resourceType === 'asr' &&
											WHISPER_MODEL_IDS.map((modelId) => (
												<SelectItem key={modelId} value={modelId}>
													{getModelLabel(modelId)}
												</SelectItem>
											))}
									</SelectContent>
								</Select>
								<p className="text-[10px] text-muted-foreground">
									{t('form.modelIdHint')}
								</p>
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<label className="text-xs font-medium text-muted-foreground">
										{t('form.pricePerUnit')}
									</label>
									{editingRule?.resourceType === 'llm' ? (
										<div className="grid gap-3 sm:grid-cols-2">
											<div className="space-y-1">
												<label className="text-[10px] text-muted-foreground">
													{t('form.inputPricePerUnit')}
												</label>
												<Input
													type="number"
													min={0}
													value={editingRule?.inputPricePerUnit ?? 0}
													onChange={(e) =>
														setEditingRule((prev) =>
															prev
																? {
																		...prev,
																		inputPricePerUnit: Number(e.target.value || 0),
																	}
																: prev,
														)
													}
												/>
											</div>
											<div className="space-y-1">
												<label className="text-[10px] text-muted-foreground">
													{t('form.outputPricePerUnit')}
												</label>
												<Input
													type="number"
													min={0}
													value={editingRule?.outputPricePerUnit ?? 0}
													onChange={(e) =>
														setEditingRule((prev) =>
															prev
																? {
																		...prev,
																		outputPricePerUnit: Number(e.target.value || 0),
																	}
																: prev,
														)
													}
												/>
											</div>
										</div>
									) : (
										<Input
											type="number"
											min={0}
											value={editingRule?.pricePerUnit ?? 0}
											onChange={(e) =>
												setEditingRule((prev) =>
													prev
														? {
																...prev,
																pricePerUnit: Number(e.target.value || 0),
															}
														: prev,
												)
											}
										/>
									)}
								</div>
								<div className="space-y-2">
									<label className="text-xs font-medium text-muted-foreground">
										{t('form.minCharge')}
									</label>
								<Input
									type="number"
									min={0}
									value={editingRule?.minCharge ?? ''}
									onChange={(e) =>
										setEditingRule((prev) =>
											prev
												? {
														...prev,
														minCharge:
															e.target.value === ''
																? ''
																: Number(e.target.value),
													}
												: prev,
										)
									}
								/>
							</div>
						</div>
					</div>
					<DialogFooter className="mt-4">
						<Button
							variant="outline"
							onClick={() => setEditingRule(null)}
							disabled={upsertRule.isPending}
						>
							{t('form.cancel')}
						</Button>
						<Button onClick={handleSave} disabled={upsertRule.isPending}>
							{t('form.save')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
