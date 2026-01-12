import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { useEnhancedMutation } from '~/lib/shared/hooks/useEnhancedMutation'
import { ADMIN_PRICING_RULES_PAGE_SIZE } from '~/lib/shared/pagination'
import {
	MICRO_POINTS_PER_POINT,
	rmbPerMillionTokensFromMicroPointsPerToken,
} from '~/lib/domain/points/units'
import {
	derivePricingRuleFromCostMarkup,
	markupPercentToBps,
	rmbToFen,
} from '~/lib/domain/points/cost-markup'

import { useTranslations } from '~/lib/shared/i18n'
import { queryOrpc } from '~/orpc'
import { cn } from '~/lib/shared/utils'

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
	pricingMode: 'cost_markup' | 'legacy_manual' | null
	markupBps: number | null
	costInputFenPer1M: number | null
	costOutputFenPer1M: number | null
	costFenPerMinute: number | null
	minChargeCostFen: number | null
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
			markupPercent: number
			costInputRmbPerMillion: number
			costOutputRmbPerMillion: number
			minChargeCostRmb: number | ''
			baseline: PricingRule | null
	  }
	| {
			mode: 'asr' | 'download'
			targetProviderId: string | null
			targetModelId: string | null
			targetLabel: string
			markupPercent: number
			costRmbPerMinute: number
			minChargeCostRmb: number | ''
			baseline: PricingRule | null
	  }

function ceilDivBigInt(numerator: bigint, denominator: bigint) {
	const ZERO = BigInt(0)
	const ONE = BigInt(1)
	if (denominator <= ZERO) throw new Error('denominator must be positive')
	if (numerator <= ZERO) return ZERO
	return (numerator + denominator - ONE) / denominator
}

function formatMaybeDate(value: unknown) {
	if (!value) return '---'
	try {
		const d = value instanceof Date ? value : new Date(value as any)
		if (Number.isNaN(d.getTime())) return '---'
		return d.toISOString().replace('T', ' ').split('.')[0]
	} catch {
		return '---'
	}
}

function normalizeRule(row: unknown): PricingRule {
	const r = row as Record<string, unknown>
	return {
		id: String(r.id ?? ''),
		resourceType: r.resourceType as Kind,
		providerId: r.providerId ? String(r.providerId) : null,
		modelId: r.modelId ? String(r.modelId) : null,
		pricingMode:
			r.pricingMode === 'cost_markup' || r.pricingMode === 'legacy_manual'
				? r.pricingMode
				: null,
		markupBps: typeof r.markupBps === 'number' ? r.markupBps : null,
		costInputFenPer1M:
			typeof r.costInputFenPer1M === 'number' ? r.costInputFenPer1M : null,
		costOutputFenPer1M:
			typeof r.costOutputFenPer1M === 'number' ? r.costOutputFenPer1M : null,
		costFenPerMinute:
			typeof r.costFenPerMinute === 'number' ? r.costFenPerMinute : null,
		minChargeCostFen:
			typeof r.minChargeCostFen === 'number' ? r.minChargeCostFen : null,
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
			const effective = globalDefaultRule
			const sellInputRmbPerMillion = rmbPerMillionTokensFromMicroPointsPerToken(
				effective?.inputPricePerUnit ?? 0,
			)
			const sellOutputRmbPerMillion = rmbPerMillionTokensFromMicroPointsPerToken(
				effective?.outputPricePerUnit ?? 0,
			)
			const markupPercent =
				typeof effective?.markupBps === 'number'
					? effective.markupBps / 100
					: 0

			setEditing({
				mode: 'llm',
				targetProviderId: null,
				targetModelId: null,
				targetLabel: t('labels.defaultModel'),
				markupPercent,
				costInputRmbPerMillion:
					typeof effective?.costInputFenPer1M === 'number'
						? effective.costInputFenPer1M / 100
						: sellInputRmbPerMillion,
				costOutputRmbPerMillion:
					typeof effective?.costOutputFenPer1M === 'number'
						? effective.costOutputFenPer1M / 100
						: sellOutputRmbPerMillion,
				minChargeCostRmb:
					typeof effective?.minChargeCostFen === 'number'
						? effective.minChargeCostFen / 100
						: typeof effective?.minCharge === 'number'
							? effective.minCharge / 100
							: '',
				baseline: effective,
			})
			return
		}

		const effective = globalDefaultRule
		const pointsPerMinute =
			effective?.unit === 'minute'
				? effective.pricePerUnit
				: effective
					? effective.pricePerUnit * 60
					: 0
		const markupPercent =
			typeof effective?.markupBps === 'number' ? effective.markupBps / 100 : 0

		setEditing({
			mode: kind,
			targetProviderId: null,
			targetModelId: null,
			targetLabel: t('labels.defaultModel'),
			markupPercent,
			costRmbPerMinute:
				typeof effective?.costFenPerMinute === 'number'
					? effective.costFenPerMinute / 100
					: pointsPerMinute / 100,
			minChargeCostRmb:
				typeof effective?.minChargeCostFen === 'number'
					? effective.minChargeCostFen / 100
					: typeof effective?.minCharge === 'number'
						? effective.minCharge / 100
						: '',
			baseline: effective,
		})
	}

	const openEditProviderDefault = (provider: AiProvider) => {
		const direct = providerDefaultByProviderId.get(provider.id) ?? null
		const effective = direct ?? globalDefaultRule

		if (kind === 'llm') {
			const sellInputRmbPerMillion = rmbPerMillionTokensFromMicroPointsPerToken(
				effective?.inputPricePerUnit ?? 0,
			)
			const sellOutputRmbPerMillion = rmbPerMillionTokensFromMicroPointsPerToken(
				effective?.outputPricePerUnit ?? 0,
			)
			const markupPercent =
				typeof effective?.markupBps === 'number' ? effective.markupBps / 100 : 0

			setEditing({
				mode: 'llm',
				targetProviderId: provider.id,
				targetModelId: null,
				targetLabel: `${provider.name} · ${t('labels.providerDefault')}`,
				markupPercent,
				costInputRmbPerMillion:
					typeof effective?.costInputFenPer1M === 'number'
						? effective.costInputFenPer1M / 100
						: sellInputRmbPerMillion,
				costOutputRmbPerMillion:
					typeof effective?.costOutputFenPer1M === 'number'
						? effective.costOutputFenPer1M / 100
						: sellOutputRmbPerMillion,
				minChargeCostRmb:
					typeof effective?.minChargeCostFen === 'number'
						? effective.minChargeCostFen / 100
						: typeof effective?.minCharge === 'number'
							? effective.minCharge / 100
							: '',
				baseline: effective,
			})
			return
		}

		const pointsPerMinute =
			effective?.unit === 'minute'
				? effective.pricePerUnit
				: effective
					? effective.pricePerUnit * 60
					: 0
		const markupPercent =
			typeof effective?.markupBps === 'number' ? effective.markupBps / 100 : 0

		setEditing({
			mode: kind,
			targetProviderId: provider.id,
			targetModelId: null,
			targetLabel: `${provider.name} · ${t('labels.providerDefault')}`,
			markupPercent,
			costRmbPerMinute:
				typeof effective?.costFenPerMinute === 'number'
					? effective.costFenPerMinute / 100
					: pointsPerMinute / 100,
			minChargeCostRmb:
				typeof effective?.minChargeCostFen === 'number'
					? effective.minChargeCostFen / 100
					: typeof effective?.minCharge === 'number'
						? effective.minCharge / 100
						: '',
			baseline: effective,
		})
	}

	const openEditModel = (model: AiModel) => {
		const direct = ruleByModelId.get(model.id) ?? null
		const providerDefault =
			providerDefaultByProviderId.get(model.providerId) ?? null
		const effective = direct ?? providerDefault ?? globalDefaultRule

		if (kind === 'llm') {
			const sellInputRmbPerMillion = rmbPerMillionTokensFromMicroPointsPerToken(
				effective?.inputPricePerUnit ?? 0,
			)
			const sellOutputRmbPerMillion = rmbPerMillionTokensFromMicroPointsPerToken(
				effective?.outputPricePerUnit ?? 0,
			)
			const markupPercent =
				typeof effective?.markupBps === 'number' ? effective.markupBps / 100 : 0

			setEditing({
				mode: 'llm',
				targetProviderId: model.providerId,
				targetModelId: model.id,
				targetLabel: model.label || model.id,
				markupPercent,
				costInputRmbPerMillion:
					typeof effective?.costInputFenPer1M === 'number'
						? effective.costInputFenPer1M / 100
						: sellInputRmbPerMillion,
				costOutputRmbPerMillion:
					typeof effective?.costOutputFenPer1M === 'number'
						? effective.costOutputFenPer1M / 100
						: sellOutputRmbPerMillion,
				minChargeCostRmb:
					typeof effective?.minChargeCostFen === 'number'
						? effective.minChargeCostFen / 100
						: typeof effective?.minCharge === 'number'
							? effective.minCharge / 100
							: '',
				baseline: effective,
			})
			return
		}

		const pointsPerMinute =
			effective?.unit === 'minute'
				? effective.pricePerUnit
				: effective
					? effective.pricePerUnit * 60
					: 0
		const markupPercent =
			typeof effective?.markupBps === 'number' ? effective.markupBps / 100 : 0

		setEditing({
			mode: kind,
			targetProviderId: model.providerId,
			targetModelId: model.id,
			targetLabel: model.label || model.id,
			markupPercent,
			costRmbPerMinute:
				typeof effective?.costFenPerMinute === 'number'
					? effective.costFenPerMinute / 100
					: pointsPerMinute / 100,
			minChargeCostRmb:
				typeof effective?.minChargeCostFen === 'number'
					? effective.minChargeCostFen / 100
					: typeof effective?.minCharge === 'number'
						? effective.minCharge / 100
						: '',
			baseline: effective,
		})
	}

	const handleSave = () => {
		if (!editing) return

		if (editing.mode === 'llm') {
			upsertRule.mutate({
				resourceType: 'llm',
				providerId: editing.targetProviderId,
				modelId: editing.targetModelId,
				markupPercent: editing.markupPercent,
				costInputRmbPerMillion: editing.costInputRmbPerMillion,
				costOutputRmbPerMillion: editing.costOutputRmbPerMillion,
				minChargeCostRmb:
					editing.minChargeCostRmb === ''
						? null
						: Number(editing.minChargeCostRmb ?? 0),
			})
			return
		}

		upsertRule.mutate({
			resourceType: editing.mode,
			providerId: editing.mode === 'download' ? null : editing.targetProviderId,
			modelId: editing.mode === 'download' ? null : editing.targetModelId,
			markupPercent: editing.markupPercent,
			costRmbPerMinute: editing.costRmbPerMinute,
			minChargeCostRmb:
				editing.minChargeCostRmb === ''
					? null
					: Number(editing.minChargeCostRmb ?? 0),
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
			providerLabel: '---',
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
					providerLabel: provider
						? `${provider.name} (${provider.slug})`
						: '---',
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
				providerLabel: provider ? `${provider.name} (${provider.slug})` : '---',
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

		const unit = 'minute' as const
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

	const draftDerived = useMemo(() => {
		if (!editing) return null
		try {
			const markupBps = markupPercentToBps(editing.markupPercent)
			const minChargeCostFen =
				editing.minChargeCostRmb === ''
					? null
					: rmbToFen(Number(editing.minChargeCostRmb ?? 0))

			if (editing.mode === 'llm') {
				return derivePricingRuleFromCostMarkup({
					resourceType: 'llm',
					markupBps,
					costInputFenPer1M: rmbToFen(editing.costInputRmbPerMillion ?? 0),
					costOutputFenPer1M: rmbToFen(editing.costOutputRmbPerMillion ?? 0),
					minChargeCostFen,
				})
			}

			return derivePricingRuleFromCostMarkup({
				resourceType: editing.mode,
				markupBps,
				costFenPerMinute: rmbToFen(editing.costRmbPerMinute ?? 0),
				minChargeCostFen,
			})
		} catch {
			return null
		}
	}, [editing])

	const renderPricingTable = () => {
		const showLlmColumns = kind === 'llm'

		return (
			<div className="border border-border bg-card">
				<div className="flex flex-row items-center justify-between gap-3 p-4 border-b border-border bg-muted/30">
					<div className="text-xs font-bold uppercase tracking-widest">
						{t('table.title')}
					</div>
					<Button
						variant="outline"
						size="sm"
						className="rounded-none uppercase text-[10px] font-bold tracking-widest"
						onClick={() => openEditDefault()}
						disabled={isBusy}
					>
						{t('actions.editDefault')}
					</Button>
				</div>
				<div className="overflow-x-auto">
					<table className="min-w-full border-collapse">
						<thead>
							<tr className="border-b border-border bg-muted/50">
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">
									{t('table.provider')}
								</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">
									{t('table.model')}
								</th>
								{showLlmColumns ? (
									<>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">
											{t('table.inputRmbPerMillion')}
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">
											{t('table.outputRmbPerMillion')}
										</th>
									</>
								) : (
									<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">
										{t('table.pointsPerMinute')}
									</th>
								)}
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">
									{t('table.minCharge')}
								</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">
									{t('table.updatedAt')}
								</th>
								<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-r border-border">
									{t('table.status')}
								</th>
								<th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									{t('table.actions')}
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
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
									<tr
										key={row.key}
										className="hover:bg-muted/30 transition-none group"
									>
										<td className="px-4 py-3 border-r border-border font-mono text-[10px] text-muted-foreground">
											{row.providerLabel}
										</td>
										<td className="px-4 py-3 border-r border-border font-mono text-xs font-bold uppercase">
											{row.modelLabel}
											{row.modelId && kind !== 'download' ? (
												<div className="mt-0.5 text-[9px] font-normal lowercase opacity-60">
													{row.modelId}
												</div>
											) : null}
										</td>
										{showLlmColumns ? (
											<>
												<td className="px-4 py-3 border-r border-border font-mono text-xs text-right">
													{inputRmb?.toFixed(2)}
												</td>
												<td className="px-4 py-3 border-r border-border font-mono text-xs text-right">
													{outputRmb?.toFixed(2)}
												</td>
											</>
										) : (
											<td className="px-4 py-3 border-r border-border font-mono text-xs text-right">
												{pointsPerMinute ?? '---'}
											</td>
										)}
										<td className="px-4 py-3 border-r border-border font-mono text-xs text-right">
											{effective?.minCharge ?? '---'}
										</td>
										<td className="px-4 py-3 border-r border-border font-mono text-[10px] text-muted-foreground">
											{formatMaybeDate(effective?.updatedAt)}
										</td>
										<td className="px-4 py-3 border-r border-border">
											<div
												className={cn(
													'inline-block px-2 py-0.5 text-[9px] font-bold uppercase border',
													direct
														? 'bg-primary text-primary-foreground border-primary'
														: effective
															? 'border-border text-muted-foreground'
															: 'border-destructive text-destructive',
												)}
											>
												{direct
													? t('status.override')
													: effective
														? t('status.inherited')
														: t('status.missing')}
											</div>
										</td>
										<td className="px-4 py-3 text-right">
											<div className="flex justify-end gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
												<Button
													size="xs"
													variant="outline"
													className="rounded-none border-border hover:bg-primary hover:text-primary-foreground uppercase text-[9px] font-bold px-2 h-7"
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
													EDIT
												</Button>
												{direct && idx !== 0 ? (
													<Button
														size="xs"
														variant="outline"
														className="rounded-none border-border hover:bg-destructive hover:text-destructive-foreground uppercase text-[9px] font-bold px-2 h-7"
														onClick={() => deleteRule.mutate({ id: direct.id })}
														disabled={isBusy}
													>
														RESET
													</Button>
												) : null}
											</div>
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			</div>
		)
	}

	const renderPreview = () => {
		const showModelPicker = kind !== 'download'
		const showLlmInputs = kind === 'llm'

		return (
			<div className="border border-border bg-card h-full">
				<div className="p-4 border-b border-border bg-muted/30">
					<div className="text-xs font-bold uppercase tracking-widest">
						{t('preview.title')}
					</div>
				</div>
				<div className="p-4 space-y-6">
					{showModelPicker ? (
						<div className="space-y-2">
							<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								{t('preview.model')}
							</Label>
							<Select value={previewModelId} onValueChange={setPreviewModelId}>
								<SelectTrigger className="h-9 rounded-none border-border font-mono text-[10px] uppercase tracking-wider">
									<SelectValue />
								</SelectTrigger>
								<SelectContent className="rounded-none border-border">
									<SelectItem
										value="__default__"
										className="rounded-none font-mono text-[10px] uppercase tracking-wider"
									>
										{t('labels.defaultModel')}
									</SelectItem>
									{modelsSorted.map((m) => (
										<SelectItem
											key={m.id}
											value={m.id}
											className="rounded-none font-mono text-[10px] uppercase tracking-wider"
										>
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
								<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									{t('preview.inputTokens')}
								</Label>
								<Input
									type="number"
									min={0}
									value={previewInputTokens}
									onChange={(e) =>
										setPreviewInputTokens(Number(e.target.value || 0))
									}
									className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
								/>
							</div>
							<div className="space-y-2">
								<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									{t('preview.outputTokens')}
								</Label>
								<Input
									type="number"
									min={0}
									value={previewOutputTokens}
									onChange={(e) =>
										setPreviewOutputTokens(Number(e.target.value || 0))
									}
									className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
								/>
							</div>
						</div>
					) : (
						<div className="space-y-2">
							<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								{t('preview.minutes')}
							</Label>
							<Input
								type="number"
								min={0}
								value={previewMinutes}
								onChange={(e) => setPreviewMinutes(Number(e.target.value || 0))}
								className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
							/>
							<p className="text-[9px] text-muted-foreground uppercase tracking-tighter">
								{t('preview.roundingHint')}
							</p>
						</div>
					)}

					<div className="border border-primary bg-primary/5 p-4">
						<div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-2">
							PREVIEW_CALCULATION
						</div>
						<div className="font-mono text-3xl font-black tabular-nums">
							{preview.ok
								? preview.points.toString().padStart(6, '0')
								: '000000'}
						</div>
						<div className="mt-2 text-[10px] font-mono text-muted-foreground leading-relaxed uppercase break-all border-t border-primary/20 pt-2">
							{preview.detail}
						</div>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-8 font-sans">
			<div className="flex items-end justify-between border-b border-primary pb-4">
				<div>
					<div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
						System / Administration / Pricing
					</div>
					<h1 className="text-3xl font-black uppercase tracking-tight">
						{t('title')}
					</h1>
				</div>
				<div className="text-right">
					<div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
						Active Rules
					</div>
					<div className="font-mono text-xl font-bold">
						{Number(rulesQuery.data?.total ?? 0)
							.toString()
							.padStart(4, '0')}
					</div>
				</div>
			</div>

			<Tabs
				value={kind}
				onValueChange={(v) => {
					setKind(v as Kind)
					setPreviewModelId('__default__')
				}}
				className="space-y-0"
			>
				<TabsList className="h-auto w-full justify-start rounded-none bg-transparent p-0 border-b border-border mb-8">
					<TabsTrigger
						value="llm"
						className="rounded-none border-b-2 border-transparent px-8 py-3 text-xs font-bold uppercase tracking-[0.2em] data-[state=active]:border-primary data-[state=active]:bg-muted/50 data-[state=active]:shadow-none"
					>
						{t('filters.resource.llm')}
					</TabsTrigger>
					<TabsTrigger
						value="asr"
						className="rounded-none border-b-2 border-transparent px-8 py-3 text-xs font-bold uppercase tracking-[0.2em] data-[state=active]:border-primary data-[state=active]:bg-muted/50 data-[state=active]:shadow-none"
					>
						{t('filters.resource.asr')}
					</TabsTrigger>
					<TabsTrigger
						value="download"
						className="rounded-none border-b-2 border-transparent px-8 py-3 text-xs font-bold uppercase tracking-[0.2em] data-[state=active]:border-primary data-[state=active]:bg-muted/50 data-[state=active]:shadow-none"
					>
						{t('filters.resource.download')}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="llm" className="mt-0 outline-none">
					{kind === 'llm' ? (
						<div className="grid gap-6 lg:grid-cols-3">
							<div className="lg:col-span-2">{renderPricingTable()}</div>
							<div>{renderPreview()}</div>
						</div>
					) : null}
				</TabsContent>
				<TabsContent value="asr" className="mt-0 outline-none">
					{kind === 'asr' ? (
						<div className="grid gap-6 lg:grid-cols-3">
							<div className="lg:col-span-2">{renderPricingTable()}</div>
							<div>{renderPreview()}</div>
						</div>
					) : null}
				</TabsContent>
				<TabsContent value="download" className="mt-0 outline-none">
					{kind === 'download' ? (
						<div className="grid gap-6 lg:grid-cols-3">
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
				<DialogContent className="rounded-none border-2 border-primary p-0 overflow-hidden max-w-md">
					<DialogHeader className="bg-primary p-4 text-primary-foreground">
						<DialogTitle className="text-xs font-bold uppercase tracking-[0.2em]">
							EDIT_PRICING // {editing?.targetLabel}
						</DialogTitle>
					</DialogHeader>

					{editing ? (
						<div className="p-6 space-y-6">
							<div className="space-y-2">
								<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									{t('form.markupPercent')}
								</Label>
								<Input
									type="number"
									min={0}
									step="0.01"
									value={editing.markupPercent}
									onChange={(e) =>
										setEditing((prev) =>
											prev
												? {
														...prev,
														markupPercent: Number(e.target.value || 0),
													}
												: prev,
										)
									}
									className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
								/>
							</div>

							{editing.mode === 'llm' ? (
								<>
									<div className="grid gap-4 sm:grid-cols-2">
										<div className="space-y-2">
											<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
												{t('form.costInputRmbPerMillion')}
											</Label>
											<Input
												type="number"
												min={0}
												step="0.01"
												value={editing.costInputRmbPerMillion}
												onChange={(e) =>
													setEditing((prev) =>
														prev && prev.mode === 'llm'
															? {
																	...prev,
																	costInputRmbPerMillion: Number(
																		e.target.value || 0,
																	),
																}
															: prev,
													)
												}
												className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
											/>
											{draftDerived && draftDerived.resourceType === 'llm' ? (
												<p className="text-[9px] font-mono text-muted-foreground">
													{t('form.derivedMicroHint', {
														micro: draftDerived.inputPricePerUnit,
														rmbPerMillion:
															rmbPerMillionTokensFromMicroPointsPerToken(
																draftDerived.inputPricePerUnit,
															).toFixed(2),
													})}
												</p>
											) : null}
										</div>
										<div className="space-y-2">
											<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
												{t('form.costOutputRmbPerMillion')}
											</Label>
											<Input
												type="number"
												min={0}
												step="0.01"
												value={editing.costOutputRmbPerMillion}
												onChange={(e) =>
													setEditing((prev) =>
														prev && prev.mode === 'llm'
															? {
																	...prev,
																	costOutputRmbPerMillion: Number(
																		e.target.value || 0,
																	),
																}
															: prev,
													)
												}
												className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
											/>
											{draftDerived && draftDerived.resourceType === 'llm' ? (
												<p className="text-[9px] font-mono text-muted-foreground">
													{t('form.derivedMicroHint', {
														micro: draftDerived.outputPricePerUnit,
														rmbPerMillion:
															rmbPerMillionTokensFromMicroPointsPerToken(
																draftDerived.outputPricePerUnit,
															).toFixed(2),
													})}
												</p>
											) : null}
										</div>
									</div>
									<p className="text-[9px] text-muted-foreground uppercase tracking-tighter">
										{t('form.costMarkupHint')}
									</p>
								</>
							) : (
								<div className="space-y-2">
									<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
										{t('form.costRmbPerMinute')}
									</Label>
									<Input
										type="number"
										min={0}
										step="0.01"
										value={editing.costRmbPerMinute}
										onChange={(e) =>
											setEditing((prev) =>
												prev && prev.mode !== 'llm'
													? {
															...prev,
															costRmbPerMinute: Number(e.target.value || 0),
														}
													: prev,
											)
										}
										className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
									/>
									{draftDerived && draftDerived.resourceType !== 'llm' ? (
										<p className="text-[9px] font-mono text-muted-foreground">
											{t('form.derivedPointsPerMinuteHint', {
												pointsPerMinute: draftDerived.pricePerUnit,
												rmbPerMinute: (draftDerived.pricePerUnit / 100).toFixed(2),
											})}
										</p>
									) : null}
								</div>
							)}

							<div className="space-y-2">
								<Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									{t('form.minChargeCostRmb')}
								</Label>
								<Input
									type="number"
									min={0}
									step="0.01"
									value={editing.minChargeCostRmb ?? ''}
									onChange={(e) =>
										setEditing((prev) =>
											prev
												? {
														...prev,
														minChargeCostRmb:
															e.target.value === ''
																? ''
																: Number(e.target.value),
													}
												: prev,
										)
									}
									className="rounded-none border-border font-mono focus-visible:ring-0 focus-visible:border-primary"
								/>
								{draftDerived ? (
									<p className="text-[9px] font-mono text-muted-foreground">
										{t('form.derivedMinChargeHint', {
											points: draftDerived.minCharge ?? 0,
										})}
									</p>
								) : null}
							</div>

							<div className="border border-primary bg-primary/5 p-4 space-y-3">
								<div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
									{t('form.draftPreviewTitle')}
								</div>

								{draftDerived ? (
									<div className="space-y-2">
										<div className="grid grid-cols-4 gap-2 text-[10px] font-mono uppercase text-muted-foreground">
											<div>{t('form.previewCols.scenario')}</div>
											<div className="text-right">{t('form.previewCols.current')}</div>
											<div className="text-right">{t('form.previewCols.draft')}</div>
											<div className="text-right">{t('form.previewCols.delta')}</div>
										</div>

										{editing.mode === 'llm'
											? [
													{ key: 'S', inputTokens: 1000, outputTokens: 500 },
													{ key: 'M', inputTokens: 4000, outputTokens: 1000 },
													{ key: 'L', inputTokens: 32000, outputTokens: 8000 },
												].map((s) => {
													const base = editing.baseline
													const baseOk =
														base &&
														base.resourceType === 'llm' &&
														typeof base.inputPricePerUnit === 'number' &&
														typeof base.outputPricePerUnit === 'number'
													const basePoints = baseOk
														? calculateLlmPoints({
																inputTokens: s.inputTokens,
																outputTokens: s.outputTokens,
																inputMicroPointsPerToken: base.inputPricePerUnit ?? 0,
																outputMicroPointsPerToken: base.outputPricePerUnit ?? 0,
																minCharge: base.minCharge,
															}).points
														: null
													const draftPoints = calculateLlmPoints({
														inputTokens: s.inputTokens,
														outputTokens: s.outputTokens,
														inputMicroPointsPerToken:
															draftDerived.resourceType === 'llm'
																? draftDerived.inputPricePerUnit
																: 0,
														outputMicroPointsPerToken:
															draftDerived.resourceType === 'llm'
																? draftDerived.outputPricePerUnit
																: 0,
														minCharge: draftDerived.minCharge,
													}).points
													const delta =
														typeof basePoints === 'number' ? draftPoints - basePoints : null

													return (
														<div
															key={s.key}
															className="grid grid-cols-4 gap-2 font-mono text-xs"
														>
															<div>{`${s.key} ${s.inputTokens}/${s.outputTokens}`}</div>
															<div className="text-right">
																{basePoints == null ? '---' : basePoints}
															</div>
															<div className="text-right">{draftPoints}</div>
															<div className="text-right">
																{delta == null ? '---' : delta >= 0 ? `+${delta}` : delta}
															</div>
														</div>
													)
												})
											: [
													{ key: '1m', minutes: 1 },
													{ key: '5m', minutes: 5 },
													{ key: '30m', minutes: 30 },
													{ key: '2h', minutes: 120 },
												].map((s) => {
													const base = editing.baseline
													const baseOk =
														base &&
														(base.resourceType === 'asr' ||
															base.resourceType === 'download') &&
														(base.unit === 'minute' || base.unit === 'second')
													const durationSeconds = s.minutes * 60
													const basePoints = baseOk
														? calculateTimePoints({
																durationSeconds,
																unit: base.unit as any,
																pricePerUnit: base.pricePerUnit,
																minCharge: base.minCharge,
															}).points
														: null
													const draftPoints = calculateTimePoints({
														durationSeconds,
														unit: 'minute',
														pricePerUnit:
															draftDerived.resourceType === 'llm'
																? 0
																: draftDerived.pricePerUnit,
														minCharge: draftDerived.minCharge,
													}).points
													const delta =
														typeof basePoints === 'number' ? draftPoints - basePoints : null

													return (
														<div
															key={s.key}
															className="grid grid-cols-4 gap-2 font-mono text-xs"
														>
															<div>{s.key}</div>
															<div className="text-right">
																{basePoints == null ? '---' : basePoints}
															</div>
															<div className="text-right">{draftPoints}</div>
															<div className="text-right">
																{delta == null ? '---' : delta >= 0 ? `+${delta}` : delta}
															</div>
														</div>
													)
												})}
									</div>
								) : (
									<div className="text-[10px] font-mono text-destructive">
										{t('form.invalidDraft')}
									</div>
								)}
							</div>

							{editing.targetModelId &&
							!ruleByModelId.get(editing.targetModelId) ? (
								<p className="text-[9px] text-muted-foreground uppercase tracking-tighter border-t border-border pt-4">
									{t('form.overrideHint')}
								</p>
							) : null}
						</div>
					) : null}

					<div className="flex border-t border-border">
						<Button
							variant="ghost"
							onClick={() => setEditing(null)}
							disabled={isBusy}
							className="flex-1 rounded-none border-r border-border h-12 uppercase text-xs font-bold tracking-widest hover:bg-muted"
						>
							{t('form.cancel')}
						</Button>
						<Button
							onClick={handleSave}
							disabled={isBusy}
							className="flex-1 rounded-none h-12 bg-primary text-primary-foreground uppercase text-xs font-bold tracking-widest hover:bg-primary/90"
						>
							{t('form.save')}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
