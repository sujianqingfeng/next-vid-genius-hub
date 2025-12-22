import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query'
import { useMemo, useState } from 'react'

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { ADMIN_PRICING_RULES_PAGE_SIZE } from '~/lib/pagination'
import {
	MICRO_POINTS_PER_POINT,
	microPointsPerTokenFromRmbPerMillionTokens,
	rmbPerMillionTokensFromMicroPointsPerToken,
} from '~/lib/points/units'

import { useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'

type Kind = 'llm' | 'asr' | 'download'

type AiProvider = {
	id: string
	name: string
	slug: string
}

type AiModel = {
	id: string
	providerId: string
	label: string
}

type PricingRule = {
	id: string
	resourceType: Kind
	providerId: string | null
	modelId: string | null
	unit: 'token' | 'second' | 'minute'
	pricePerUnit: number
	inputPricePerUnit: number | null
	outputPricePerUnit: number | null
	minCharge: number | null
	updatedAt: Date | null
}

type Editing =
	| {
			mode: 'llm'
			targetProviderId: string | null
			targetModelId: string | null
			targetLabel: string
			inputRmbPerMillion: number
			outputRmbPerMillion: number
			minCharge: number | ''
	  }
	| {
			mode: 'asr' | 'download'
			targetProviderId: string | null
			targetModelId: string | null
			targetLabel: string
			pointsPerMinute: number
			minCharge: number | ''
	  }

function ceilDivBigInt(numerator: bigint, denominator: bigint) {
	const ZERO = BigInt(0)
	const ONE = BigInt(1)
	if (denominator <= ZERO) throw new Error('denominator must be positive')
	if (numerator <= ZERO) return ZERO
	return (numerator + denominator - ONE) / denominator
}

function formatMaybeDate(value: unknown) {
	if (!value) return '—'
	try {
		if (value instanceof Date) return value.toLocaleString()
		if (typeof value === 'number' || typeof value === 'string') {
			return new Date(value).toLocaleString()
		}
		return '—'
	} catch {
		return '—'
	}
}

function normalizeRule(row: unknown): PricingRule {
	const r = row as Record<string, unknown>
	return {
		id: String(r.id ?? ''),
		resourceType: r.resourceType as Kind,
		providerId: r.providerId ? String(r.providerId) : null,
		modelId: r.modelId ? String(r.modelId) : null,
		unit: r.unit as PricingRule['unit'],
		pricePerUnit: Number((r.pricePerUnit as number | undefined) ?? 0),
		inputPricePerUnit:
			typeof r.inputPricePerUnit === 'number' ? r.inputPricePerUnit : null,
		outputPricePerUnit:
			typeof r.outputPricePerUnit === 'number' ? r.outputPricePerUnit : null,
		minCharge: typeof r.minCharge === 'number' ? r.minCharge : null,
		updatedAt: (r.updatedAt as Date | null | undefined) ?? null,
	}
}

function calculateLlmPoints(opts: {
	inputTokens: number
	outputTokens: number
	inputMicroPointsPerToken: number
	outputMicroPointsPerToken: number
	minCharge: number | null
}) {
	const inputTokens = Math.max(0, Math.trunc(opts.inputTokens))
	const outputTokens = Math.max(0, Math.trunc(opts.outputTokens))
	const totalTokens = inputTokens + outputTokens
	if (totalTokens <= 0) return { points: 0, totalTokens, rawPoints: 0 }

	const inputMicro = BigInt(
		Math.max(0, Math.trunc(opts.inputMicroPointsPerToken)),
	)
	const outputMicro = BigInt(
		Math.max(0, Math.trunc(opts.outputMicroPointsPerToken)),
	)
	const rawMicro =
		BigInt(inputTokens) * inputMicro + BigInt(outputTokens) * outputMicro
	const rawPointsBig = ceilDivBigInt(rawMicro, BigInt(MICRO_POINTS_PER_POINT))
	const rawPoints =
		rawPointsBig > BigInt(Number.MAX_SAFE_INTEGER)
			? Number.MAX_SAFE_INTEGER
			: Number(rawPointsBig)
	const minCharge = opts.minCharge ?? 0
	const points = Math.max(rawPoints, minCharge)
	return { points, totalTokens, rawPoints }
}

function calculateTimePoints(opts: {
	durationSeconds: number
	unit: 'second' | 'minute'
	pricePerUnit: number
	minCharge: number | null
}) {
	const seconds = Math.max(0, opts.durationSeconds)
	const units =
		opts.unit === 'minute' ? Math.ceil(seconds / 60) : Math.ceil(seconds)
	const rawPoints = units * Math.max(0, Math.trunc(opts.pricePerUnit))
	const minCharge = opts.minCharge ?? 0
	return { points: Math.max(rawPoints, minCharge), units, rawPoints }
}

export function AdminPointsPricingPage() {
	const t = useTranslations('Admin.pointsPricing')
	const qc = useQueryClient()
	const [kind, setKind] = useState<Kind>('llm')
	const [editing, setEditing] = useState<Editing | null>(null)

	const rulesQuery = useQuery({
		...queryOrpc.admin.listPricingRules.queryOptions({
			input: {
				page: 1,
				limit: ADMIN_PRICING_RULES_PAGE_SIZE,
				resourceType: kind,
			},
		}),
		placeholderData: keepPreviousData,
	})

	const providersQuery = useQuery({
		...queryOrpc.admin.listAiProviders.queryOptions({
			input: { kind: kind === 'asr' ? 'asr' : 'llm', enabledOnly: false },
		}),
		enabled: kind !== 'download',
	})

	const modelsQuery = useQuery({
		...queryOrpc.admin.listAiModels.queryOptions({
			input: { kind: kind === 'asr' ? 'asr' : 'llm', enabledOnly: false },
		}),
		enabled: kind !== 'download',
	})

	const rules = (rulesQuery.data?.items ?? []).map(normalizeRule)
	const globalDefaultRule =
		rules.find((r) => r.modelId == null && r.providerId == null) ?? null

	const providerDefaultByProviderId = new Map<string, PricingRule>()
	for (const rule of rules) {
		if (rule.modelId == null && rule.providerId) {
			providerDefaultByProviderId.set(rule.providerId, rule)
		}
	}

	const ruleByModelId = new Map<string, PricingRule>()
	for (const rule of rules) {
		if (rule.modelId) ruleByModelId.set(rule.modelId, rule)
	}

	const providers = (providersQuery.data?.items ?? []) as AiProvider[]
	const models = (modelsQuery.data?.items ?? []) as AiModel[]

	const providerById = useMemo(() => {
		const m = new Map<string, AiProvider>()
		for (const p of providers) m.set(p.id, p)
		return m
	}, [providers])

	const modelsSorted = useMemo(() => {
		const sorted = [...models]
		sorted.sort((a, b) => {
			const ap = providerById.get(a.providerId)?.slug ?? ''
			const bp = providerById.get(b.providerId)?.slug ?? ''
			if (ap !== bp) return ap.localeCompare(bp)
			return String(a.label ?? a.id).localeCompare(String(b.label ?? b.id))
		})
		return sorted
	}, [models, providerById])

	const invalidate = () => {
		qc.invalidateQueries({
			queryKey: queryOrpc.admin.listPricingRules.key(),
		})
	}

	const upsertRule = useEnhancedMutation(
		queryOrpc.admin.upsertPricingRule.mutationOptions({
			onSuccess: () => {
				invalidate()
				setEditing(null)
			},
		}),
		{
			successToast: t('toast.saved'),
			errorToast: ({ error }) =>
				(error as Error)?.message || t('toast.saveError'),
		},
	)

	const deleteRule = useEnhancedMutation(
		queryOrpc.admin.deletePricingRule.mutationOptions({
			onSuccess: () => invalidate(),
		}),
		{
			successToast: t('toast.deleted'),
			errorToast: ({ error }) =>
				(error as Error)?.message || t('toast.deleteError'),
		},
	)

	const isBusy =
		rulesQuery.isFetching || upsertRule.isPending || deleteRule.isPending

	const openEditDefault = () => {
		if (kind === 'llm') {
			setEditing({
				mode: 'llm',
				targetProviderId: null,
				targetModelId: null,
				targetLabel: t('labels.defaultModel'),
				inputRmbPerMillion: rmbPerMillionTokensFromMicroPointsPerToken(
					globalDefaultRule?.inputPricePerUnit ?? 0,
				),
				outputRmbPerMillion: rmbPerMillionTokensFromMicroPointsPerToken(
					globalDefaultRule?.outputPricePerUnit ?? 0,
				),
				minCharge:
					typeof globalDefaultRule?.minCharge === 'number'
						? globalDefaultRule.minCharge
						: '',
			})
			return
		}

		setEditing({
			mode: kind,
			targetProviderId: null,
			targetModelId: null,
			targetLabel: t('labels.defaultModel'),
			pointsPerMinute:
				globalDefaultRule?.unit === 'minute'
					? globalDefaultRule.pricePerUnit
					: globalDefaultRule
						? globalDefaultRule.pricePerUnit * 60
						: 1,
			minCharge:
				typeof globalDefaultRule?.minCharge === 'number'
					? globalDefaultRule.minCharge
					: '',
		})
	}

	const openEditProviderDefault = (provider: AiProvider) => {
		const direct = providerDefaultByProviderId.get(provider.id) ?? null
		const effective = direct ?? globalDefaultRule

		if (kind === 'llm') {
			setEditing({
				mode: 'llm',
				targetProviderId: provider.id,
				targetModelId: null,
				targetLabel: `${provider.name} · ${t('labels.providerDefault')}`,
				inputRmbPerMillion: rmbPerMillionTokensFromMicroPointsPerToken(
					effective?.inputPricePerUnit ?? 0,
				),
				outputRmbPerMillion: rmbPerMillionTokensFromMicroPointsPerToken(
					effective?.outputPricePerUnit ?? 0,
				),
				minCharge:
					typeof effective?.minCharge === 'number' ? effective.minCharge : '',
			})
			return
		}

		setEditing({
			mode: kind,
			targetProviderId: provider.id,
			targetModelId: null,
			targetLabel: `${provider.name} · ${t('labels.providerDefault')}`,
			pointsPerMinute:
				effective?.unit === 'minute'
					? effective.pricePerUnit
					: effective
						? effective.pricePerUnit * 60
						: 1,
			minCharge:
				typeof effective?.minCharge === 'number' ? effective.minCharge : '',
		})
	}

	const openEditModel = (model: AiModel) => {
		const direct = ruleByModelId.get(model.id) ?? null
		const providerDefault =
			providerDefaultByProviderId.get(model.providerId) ?? null
		const effective = direct ?? providerDefault ?? globalDefaultRule

		if (kind === 'llm') {
			setEditing({
				mode: 'llm',
				targetProviderId: model.providerId,
				targetModelId: model.id,
				targetLabel: model.label || model.id,
				inputRmbPerMillion: rmbPerMillionTokensFromMicroPointsPerToken(
					effective?.inputPricePerUnit ?? 0,
				),
				outputRmbPerMillion: rmbPerMillionTokensFromMicroPointsPerToken(
					effective?.outputPricePerUnit ?? 0,
				),
				minCharge:
					typeof effective?.minCharge === 'number' ? effective.minCharge : '',
			})
			return
		}

		setEditing({
			mode: kind,
			targetProviderId: model.providerId,
			targetModelId: model.id,
			targetLabel: model.label || model.id,
			pointsPerMinute:
				effective?.unit === 'minute'
					? effective.pricePerUnit
					: effective
						? effective.pricePerUnit * 60
						: 1,
			minCharge:
				typeof effective?.minCharge === 'number' ? effective.minCharge : '',
		})
	}

	const handleSave = () => {
		if (!editing) return

		if (editing.mode === 'llm') {
			const inputMicro = microPointsPerTokenFromRmbPerMillionTokens(
				Number.isFinite(editing.inputRmbPerMillion)
					? editing.inputRmbPerMillion
					: 0,
			)
			const outputMicro = microPointsPerTokenFromRmbPerMillionTokens(
				Number.isFinite(editing.outputRmbPerMillion)
					? editing.outputRmbPerMillion
					: 0,
			)

			upsertRule.mutate({
				resourceType: 'llm',
				providerId: editing.targetProviderId,
				modelId: editing.targetModelId,
				unit: 'token',
				pricePerUnit: 0,
				inputPricePerUnit: inputMicro,
				outputPricePerUnit: outputMicro,
				minCharge:
					editing.minCharge === '' ? null : Number(editing.minCharge ?? 0),
			})
			return
		}

		upsertRule.mutate({
			resourceType: editing.mode,
			providerId: editing.mode === 'download' ? null : editing.targetProviderId,
			modelId: editing.mode === 'download' ? null : editing.targetModelId,
			unit: 'minute',
			pricePerUnit: Math.max(0, Math.trunc(editing.pointsPerMinute)),
			inputPricePerUnit: null,
			outputPricePerUnit: null,
			minCharge:
				editing.minCharge === '' ? null : Number(editing.minCharge ?? 0),
		})
	}

	const rows = useMemo(() => {
		const table: Array<{
			key: string
			providerLabel: string
			modelLabel: string
			provider: AiProvider | null
			modelId: string | null
			model: AiModel | null
			direct: PricingRule | null
			effective: PricingRule | null
		}> = []

		table.push({
			key: 'default',
			providerLabel: '—',
			modelLabel: t('labels.defaultModel'),
			provider: null,
			modelId: null,
			model: null,
			direct: globalDefaultRule,
			effective: globalDefaultRule,
		})

		if (kind === 'download') {
			return table
		}

		const seenProviders = new Set<string>()
		for (const model of modelsSorted) {
			if (!seenProviders.has(model.providerId)) {
				seenProviders.add(model.providerId)
				const provider = providerById.get(model.providerId) ?? null
				const direct = provider
					? (providerDefaultByProviderId.get(provider.id) ?? null)
					: null
				const effective = direct ?? globalDefaultRule
				table.push({
					key: `provider:${model.providerId}`,
					providerLabel: provider ? `${provider.name} (${provider.slug})` : '—',
					modelLabel: t('labels.providerDefault'),
					provider,
					modelId: null,
					model: null,
					direct,
					effective,
				})
			}

			const provider = providerById.get(model.providerId) ?? null
			const direct = ruleByModelId.get(model.id) ?? null
			const providerDefault = provider
				? (providerDefaultByProviderId.get(provider.id) ?? null)
				: null

			table.push({
				key: model.id,
				providerLabel: provider ? `${provider.name} (${provider.slug})` : '—',
				modelLabel: model.label || model.id,
				provider,
				modelId: model.id,
				model,
				direct,
				effective: direct ?? providerDefault ?? globalDefaultRule,
			})
		}

		return table
	}, [
		globalDefaultRule,
		kind,
		modelsSorted,
		providerById,
		providerDefaultByProviderId,
		ruleByModelId,
		t,
	])

	const [previewModelId, setPreviewModelId] = useState<string>('__default__')
	const [previewInputTokens, setPreviewInputTokens] = useState<number>(1000)
	const [previewOutputTokens, setPreviewOutputTokens] = useState<number>(500)
	const [previewMinutes, setPreviewMinutes] = useState<number>(1)

	const previewRule = useMemo(() => {
		if (kind === 'download') return globalDefaultRule
		if (previewModelId === '__default__') return globalDefaultRule
		const model = modelsSorted.find((m) => m.id === previewModelId)
		if (!model) return globalDefaultRule
		return (
			ruleByModelId.get(model.id) ??
			providerDefaultByProviderId.get(model.providerId) ??
			globalDefaultRule
		)
	}, [
		globalDefaultRule,
		kind,
		modelsSorted,
		previewModelId,
		providerDefaultByProviderId,
		ruleByModelId,
	])

	const preview = useMemo(() => {
		if (!previewRule)
			return { ok: false as const, points: 0, detail: t('preview.noRule') }

		if (kind === 'llm') {
			const res = calculateLlmPoints({
				inputTokens: previewInputTokens,
				outputTokens: previewOutputTokens,
				inputMicroPointsPerToken: previewRule.inputPricePerUnit ?? 0,
				outputMicroPointsPerToken: previewRule.outputPricePerUnit ?? 0,
				minCharge: previewRule.minCharge,
			})
			return {
				ok: true as const,
				points: res.points,
				detail: t('preview.llmDetail', {
					totalTokens: res.totalTokens,
					rawPoints: res.rawPoints,
					minCharge: previewRule.minCharge ?? 0,
				}),
			}
		}

		const unit: 'minute' = 'minute'
		const durationSeconds = Math.max(0, Math.trunc(previewMinutes)) * 60
		const res = calculateTimePoints({
			durationSeconds,
			unit,
			pricePerUnit: previewRule.pricePerUnit,
			minCharge: previewRule.minCharge,
		})
		return {
			ok: true as const,
			points: res.points,
			detail: t('preview.timeDetail', {
				units: res.units,
				unit,
				rawPoints: res.rawPoints,
				minCharge: previewRule.minCharge ?? 0,
			}),
		}
	}, [
		kind,
		previewInputTokens,
		previewMinutes,
		previewOutputTokens,
		previewRule,
		t,
	])

	const renderPricingTable = () => {
		const isDownload = kind === 'download'
		const showLlmColumns = kind === 'llm'

		return (
			<Card className="border-border/60 shadow-sm">
				<CardHeader className="flex flex-row items-center justify-between gap-3">
					<CardTitle className="text-lg">{t('table.title')}</CardTitle>
					<Button
						variant="secondary"
						onClick={() => openEditDefault()}
						disabled={isBusy}
					>
						{t('actions.editDefault')}
					</Button>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="overflow-x-auto rounded-lg border border-border/60">
						<table className="min-w-full text-sm">
							<thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
								<tr>
									<th className="px-4 py-3 font-medium">
										{t('table.provider')}
									</th>
									<th className="px-4 py-3 font-medium">{t('table.model')}</th>
									{showLlmColumns ? (
										<>
											<th className="px-4 py-3 font-medium">
												{t('table.inputRmbPerMillion')}
											</th>
											<th className="px-4 py-3 font-medium">
												{t('table.outputRmbPerMillion')}
											</th>
										</>
									) : (
										<th className="px-4 py-3 font-medium">
											{t('table.pointsPerMinute')}
										</th>
									)}
									<th className="px-4 py-3 font-medium">
										{t('table.minCharge')}
									</th>
									<th className="px-4 py-3 font-medium">
										{t('table.updatedAt')}
									</th>
									<th className="px-4 py-3 font-medium">{t('table.status')}</th>
									<th className="px-4 py-3 font-medium text-right">
										{t('table.actions')}
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{rows.map((row, idx) => {
									const isProviderRow =
										row.modelId == null && row.provider != null
									const direct = row.direct
									const effective = row.effective

									const inputRmb =
										kind === 'llm'
											? rmbPerMillionTokensFromMicroPointsPerToken(
													effective?.inputPricePerUnit ?? 0,
												)
											: null
									const outputRmb =
										kind === 'llm'
											? rmbPerMillionTokensFromMicroPointsPerToken(
													effective?.outputPricePerUnit ?? 0,
												)
											: null

									const pointsPerMinute =
										kind !== 'llm'
											? effective?.unit === 'minute'
												? effective.pricePerUnit
												: effective
													? effective.pricePerUnit * 60
													: null
											: null

									return (
										<tr key={row.key} className="hover:bg-muted/20">
											<td className="px-4 py-3 text-muted-foreground">
												{row.providerLabel}
											</td>
											<td className="px-4 py-3">
												<div className="font-medium text-foreground">
													{row.modelLabel}
												</div>
												{row.modelId && !isDownload ? (
													<div className="mt-0.5 text-xs text-muted-foreground">
														{row.modelId}
													</div>
												) : null}
											</td>
											{showLlmColumns ? (
												<>
													<td className="px-4 py-3 tabular-nums">
														{inputRmb?.toFixed(2)}
													</td>
													<td className="px-4 py-3 tabular-nums">
														{outputRmb?.toFixed(2)}
													</td>
												</>
											) : (
												<td className="px-4 py-3 tabular-nums">
													{pointsPerMinute ?? '—'}
												</td>
											)}
											<td className="px-4 py-3 tabular-nums">
												{effective?.minCharge ?? '—'}
											</td>
											<td className="px-4 py-3 text-muted-foreground">
												{formatMaybeDate(effective?.updatedAt)}
											</td>
											<td className="px-4 py-3">
												{direct ? (
													<Badge variant="outline">
														{t('status.override')}
													</Badge>
												) : effective ? (
													<Badge variant="secondary">
														{t('status.inherited')}
													</Badge>
												) : (
													<Badge variant="destructive">
														{t('status.missing')}
													</Badge>
												)}
											</td>
											<td className="px-4 py-3 text-right">
												<div className="flex justify-end gap-2">
													<Button
														size="sm"
														variant="secondary"
														onClick={() => {
															if (row.model) {
																openEditModel(row.model)
																return
															}
															if (idx === 0) {
																openEditDefault()
																return
															}
															if (isProviderRow && row.provider) {
																openEditProviderDefault(row.provider)
															}
														}}
														disabled={isBusy}
													>
														{t('actions.edit')}
													</Button>
													{direct ? (
														<Button
															size="sm"
															variant="outline"
															onClick={() =>
																deleteRule.mutate({ id: direct.id })
															}
															disabled={isBusy}
														>
															{t('actions.reset')}
														</Button>
													) : null}
												</div>
											</td>
										</tr>
									)
								})}

								{!rulesQuery.isLoading && rows.length === 0 ? (
									<tr>
										<td
											colSpan={showLlmColumns ? 8 : 7}
											className="px-4 py-6 text-center text-muted-foreground"
										>
											{t('empty')}
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>
		)
	}

	const renderPreview = () => {
		const showModelPicker = kind !== 'download'
		const showLlmInputs = kind === 'llm'

		return (
			<Card className="border-border/60 shadow-sm">
				<CardHeader>
					<CardTitle className="text-lg">{t('preview.title')}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{showModelPicker ? (
						<div className="space-y-2">
							<Label className="text-xs text-muted-foreground">
								{t('preview.model')}
							</Label>
							<Select value={previewModelId} onValueChange={setPreviewModelId}>
								<SelectTrigger className="h-9">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__default__">
										{t('labels.defaultModel')}
									</SelectItem>
									{modelsSorted.map((m) => (
										<SelectItem key={m.id} value={m.id}>
											{m.label || m.id}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					) : null}

					{showLlmInputs ? (
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label className="text-xs text-muted-foreground">
									{t('preview.inputTokens')}
								</Label>
								<Input
									type="number"
									min={0}
									value={previewInputTokens}
									onChange={(e) =>
										setPreviewInputTokens(Number(e.target.value || 0))
									}
								/>
							</div>
							<div className="space-y-2">
								<Label className="text-xs text-muted-foreground">
									{t('preview.outputTokens')}
								</Label>
								<Input
									type="number"
									min={0}
									value={previewOutputTokens}
									onChange={(e) =>
										setPreviewOutputTokens(Number(e.target.value || 0))
									}
								/>
							</div>
						</div>
					) : (
						<div className="space-y-2">
							<Label className="text-xs text-muted-foreground">
								{t('preview.minutes')}
							</Label>
							<Input
								type="number"
								min={0}
								value={previewMinutes}
								onChange={(e) => setPreviewMinutes(Number(e.target.value || 0))}
							/>
							<p className="text-[10px] text-muted-foreground">
								{t('preview.roundingHint')}
							</p>
						</div>
					)}

					<div className="rounded-lg border border-border/60 bg-muted/20 p-3">
						<div className="text-xs text-muted-foreground">
							{t('preview.points')}
						</div>
						<div className="mt-1 text-2xl font-semibold tabular-nums">
							{preview.ok ? preview.points : 0}
						</div>
						<div className="mt-1 text-[10px] text-muted-foreground break-words">
							{preview.detail}
						</div>
					</div>
				</CardContent>
			</Card>
		)
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						{t('title')}
					</h1>
					<p className="text-sm text-muted-foreground">
						{t('subtitle', { total: Number(rulesQuery.data?.total ?? 0) })}
					</p>
				</div>
				<Badge variant="secondary" className="gap-1">
					{t('badge')}
				</Badge>
			</div>

			<Tabs
				value={kind}
				onValueChange={(v) => {
					setKind(v as Kind)
					setPreviewModelId('__default__')
				}}
			>
				<TabsList>
					<TabsTrigger value="llm">{t('filters.resource.llm')}</TabsTrigger>
					<TabsTrigger value="asr">{t('filters.resource.asr')}</TabsTrigger>
					<TabsTrigger value="download">
						{t('filters.resource.download')}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="llm" className="mt-4">
					{kind === 'llm' ? (
						<div className="grid gap-4 lg:grid-cols-3">
							<div className="lg:col-span-2">{renderPricingTable()}</div>
							<div>{renderPreview()}</div>
						</div>
					) : null}
				</TabsContent>
				<TabsContent value="asr" className="mt-4">
					{kind === 'asr' ? (
						<div className="grid gap-4 lg:grid-cols-3">
							<div className="lg:col-span-2">{renderPricingTable()}</div>
							<div>{renderPreview()}</div>
						</div>
					) : null}
				</TabsContent>
				<TabsContent value="download" className="mt-4">
					{kind === 'download' ? (
						<div className="grid gap-4 lg:grid-cols-3">
							<div className="lg:col-span-2">{renderPricingTable()}</div>
							<div>{renderPreview()}</div>
						</div>
					) : null}
				</TabsContent>
			</Tabs>

			<Dialog
				open={Boolean(editing)}
				onOpenChange={(open) => !open && setEditing(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{editing?.targetModelId
								? t('dialogs.editTitleWithTarget', {
										target: editing.targetLabel,
									})
								: t('dialogs.editDefaultTitle')}
						</DialogTitle>
					</DialogHeader>

					{editing ? (
						<div className="space-y-4 pt-2">
							{editing.mode === 'llm' ? (
								<>
									<div className="grid gap-4 sm:grid-cols-2">
										<div className="space-y-2">
											<Label>{t('form.inputRmbPerMillion')}</Label>
											<Input
												type="number"
												min={0}
												step="0.01"
												value={editing.inputRmbPerMillion}
												onChange={(e) =>
													setEditing((prev) =>
														prev && prev.mode === 'llm'
															? {
																	...prev,
																	inputRmbPerMillion: Number(
																		e.target.value || 0,
																	),
																}
															: prev,
													)
												}
											/>
											<p className="text-[10px] text-muted-foreground">
												{t('form.microHint', {
													micro: microPointsPerTokenFromRmbPerMillionTokens(
														editing.inputRmbPerMillion,
													),
												})}
											</p>
										</div>
										<div className="space-y-2">
											<Label>{t('form.outputRmbPerMillion')}</Label>
											<Input
												type="number"
												min={0}
												step="0.01"
												value={editing.outputRmbPerMillion}
												onChange={(e) =>
													setEditing((prev) =>
														prev && prev.mode === 'llm'
															? {
																	...prev,
																	outputRmbPerMillion: Number(
																		e.target.value || 0,
																	),
																}
															: prev,
													)
												}
											/>
											<p className="text-[10px] text-muted-foreground">
												{t('form.microHint', {
													micro: microPointsPerTokenFromRmbPerMillionTokens(
														editing.outputRmbPerMillion,
													),
												})}
											</p>
										</div>
									</div>
									<p className="text-[10px] text-muted-foreground">
										{t('form.llmPricingHint')}
									</p>
								</>
							) : (
								<div className="space-y-2">
									<Label>{t('form.pointsPerMinute')}</Label>
									<Input
										type="number"
										min={0}
										value={editing.pointsPerMinute}
										onChange={(e) =>
											setEditing((prev) =>
												prev && prev.mode !== 'llm'
													? {
															...prev,
															pointsPerMinute: Number(e.target.value || 0),
														}
													: prev,
											)
										}
									/>
								</div>
							)}

							<div className="space-y-2">
								<Label>{t('form.minCharge')}</Label>
								<Input
									type="number"
									min={0}
									value={editing.minCharge ?? ''}
									onChange={(e) =>
										setEditing((prev) =>
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

							{editing.targetModelId &&
							!ruleByModelId.get(editing.targetModelId) ? (
								<p className="text-[10px] text-muted-foreground">
									{t('form.overrideHint')}
								</p>
							) : null}
						</div>
					) : null}

					<DialogFooter className="mt-4">
						<Button
							variant="outline"
							onClick={() => setEditing(null)}
							disabled={isBusy}
						>
							{t('form.cancel')}
						</Button>
						<Button onClick={handleSave} disabled={isBusy}>
							{t('form.save')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
