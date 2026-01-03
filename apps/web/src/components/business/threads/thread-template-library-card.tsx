'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import type { ThreadTemplateConfigV1 } from '@app/remotion-project/types'
import { getUserFriendlyErrorMessage } from '~/lib/errors/client'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { useTranslations } from '~/lib/i18n'
import { queryOrpc } from '~/lib/orpc/client'

export function ThreadTemplateLibraryCard({
	threadId,
	effectiveTemplateId,
	normalizedTemplateConfig,
	onApplied,
}: {
	threadId: string
	effectiveTemplateId: string
	normalizedTemplateConfig: ThreadTemplateConfigV1 | null
	onApplied: () => Promise<void>
}) {
	const qc = useQueryClient()
	const t = useTranslations('ThreadTemplates.libraryCard')

	const listQuery = useQuery(queryOrpc.threadTemplate.list.queryOptions())
	const libraries = listQuery.data?.libraries ?? []

	const [showAdvanced, setShowAdvanced] = React.useState(false)

	const saveTargetLibraries = React.useMemo(() => {
		return libraries.filter(
			(l: any) => String(l.templateId) === effectiveTemplateId,
		)
	}, [effectiveTemplateId, libraries])

	const [newName, setNewName] = React.useState('')
	const [newDescription, setNewDescription] = React.useState('')
	const [note, setNote] = React.useState('')

	const [saveToLibraryId, setSaveToLibraryId] = React.useState<string>('')

	const [applyLibraryId, setApplyLibraryId] = React.useState<string>('')
	const applyLibrary = React.useMemo(() => {
		return (
			libraries.find((l: any) => String(l.id) === String(applyLibraryId)) ??
			null
		)
	}, [applyLibraryId, libraries])

	React.useEffect(() => {
		if (applyLibraryId) return
		const sameKind = libraries.filter(
			(l: any) => String(l.templateId) === effectiveTemplateId,
		)
		const first = sameKind[0] ?? libraries[0]
		if (first?.id) setApplyLibraryId(String(first.id))
	}, [applyLibraryId, effectiveTemplateId, libraries])

	const versionsQuery = useQuery(
		queryOrpc.threadTemplate.versions.queryOptions({
			input: { libraryId: applyLibraryId, limit: 50 },
			enabled: Boolean(applyLibraryId),
		}),
	)

	const versions = versionsQuery.data?.versions ?? []
	const [applyVersionId, setApplyVersionId] = React.useState<string>('')
	const willChangeTemplateId = Boolean(
		applyLibrary &&
		String((applyLibrary as any).templateId) !== effectiveTemplateId,
	)

	React.useEffect(() => {
		if (!applyLibraryId) {
			setApplyVersionId('')
			return
		}
		if (applyVersionId) return
		const latest = versions[0]
		if (latest?.id) setApplyVersionId(String(latest.id))
	}, [applyLibraryId, applyVersionId, versions])

		const createMutation = useEnhancedMutation(
			queryOrpc.threadTemplate.create.mutationOptions({
				onSuccess: async () => {
					await qc.invalidateQueries({
						queryKey: queryOrpc.threadTemplate.list.key(),
					})
				},
			}),
			{
				successToast: t('toasts.savedToLibrary'),
				errorToast: ({ error }) => getUserFriendlyErrorMessage(error),
			},
		)

		const addVersionMutation = useEnhancedMutation(
			queryOrpc.threadTemplate.addVersion.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.threadTemplate.list.key(),
				})
				if (saveToLibraryId) {
					await qc.invalidateQueries({
						queryKey: queryOrpc.threadTemplate.versions.queryKey({
							input: { libraryId: saveToLibraryId, limit: 50 },
						}),
					})
				}
			},
			}),
			{
				successToast: t('toasts.savedNewVersion'),
				errorToast: ({ error }) => getUserFriendlyErrorMessage(error),
			},
		)

		const rollbackMutation = useEnhancedMutation(
		queryOrpc.threadTemplate.rollback.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.threadTemplate.list.key(),
				})
				if (applyLibraryId) {
					await qc.invalidateQueries({
						queryKey: queryOrpc.threadTemplate.versions.queryKey({
							input: { libraryId: applyLibraryId, limit: 50 },
						}),
					})
				}
			},
			}),
			{
				successToast: t('toasts.rollbackCreated'),
				errorToast: ({ error }) => getUserFriendlyErrorMessage(error),
			},
		)

		const applyMutation = useEnhancedMutation(
		queryOrpc.threadTemplate.applyToThread.mutationOptions({
			onSuccess: async () => {
				await onApplied()
			},
			}),
			{
				successToast: t('toasts.appliedToThread'),
				errorToast: ({ error }) => getUserFriendlyErrorMessage(error),
			},
		)

	const canSave =
		Boolean(normalizedTemplateConfig) &&
		!createMutation.isPending &&
		!addVersionMutation.isPending

	return (
		<Card className="rounded-none shadow-none">
			<CardContent className="py-5 space-y-5">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="font-mono text-xs text-muted-foreground">
							{t('header.currentTemplate', { templateId: effectiveTemplateId })}
						</div>
						<Button
						type="button"
						size="sm"
						variant="outline"
						className="rounded-none font-mono text-[10px] uppercase"
							onClick={() => setShowAdvanced((v) => !v)}
						>
							{showAdvanced ? t('header.hideAdvanced') : t('header.advanced')}
						</Button>
					</div>

					<div className="space-y-3">
						<div className="font-mono text-xs uppercase tracking-widest">
							{t('use.title')}
						</div>
						<div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto_auto] items-end">
							<div className="space-y-1">
								<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									{t('use.templateLabel')}
								</Label>
								<Select
								value={applyLibraryId}
								onValueChange={(v) => {
									setApplyLibraryId(v)
									setApplyVersionId('')
								}}
								>
									<SelectTrigger className="rounded-none font-mono text-xs h-9">
										<SelectValue placeholder={t('use.templatePlaceholder')} />
									</SelectTrigger>
									<SelectContent>
									{libraries.map((l: any) => (
										<SelectItem key={String(l.id)} value={String(l.id)}>
											{String(l.name)} · {String(l.templateId)} · v
											{l.latestVersion ?? '—'}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
							<div className="space-y-1">
								<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									{t('use.versionLabel')}
								</Label>
								<Select
								value={applyVersionId}
								onValueChange={(v) => setApplyVersionId(v)}
								disabled={!applyLibraryId || versions.length === 0}
								>
									<SelectTrigger className="rounded-none font-mono text-xs h-9">
										<SelectValue placeholder={t('use.versionPlaceholder')} />
									</SelectTrigger>
									<SelectContent>
									{versions.map((v: any) => (
										<SelectItem key={String(v.id)} value={String(v.id)}>
											v{Number(v.version)} · {String(v.id).slice(0, 10)}
											{v.note ? ` · ${String(v.note).slice(0, 40)}` : ''}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
							<Button
								type="button"
								className="rounded-none font-mono text-xs uppercase"
								disabled={!applyVersionId || applyMutation.isPending}
							onClick={() => {
								if (!applyVersionId) return
								applyMutation.mutate({ threadId, versionId: applyVersionId })
								}}
							>
								{applyMutation.isPending ? t('use.applying') : t('use.apply')}
							</Button>
						<Button
							type="button"
							variant="outline"
							className="rounded-none font-mono text-xs uppercase"
							disabled={!applyLibraryId || !applyVersionId}
							asChild
						>
							<Link
								to="/thread-templates/$libraryId/versions/$versionId/editor"
								params={{
									libraryId: applyLibraryId,
									versionId: applyVersionId,
								}}
								search={{ previewThreadId: threadId }}
								>
									{t('use.openEditor')}
								</Link>
							</Button>
						</div>
						{willChangeTemplateId ? (
							<div className="font-mono text-xs text-muted-foreground">
								{t('use.noteChangeTemplateId', {
									templateId: String((applyLibrary as any)?.templateId),
								})}
							</div>
						) : null}
						{versionsQuery.isFetching ? (
							<div className="font-mono text-xs text-muted-foreground">
								{t('use.loadingVersions')}
							</div>
						) : null}
					</div>

					{showAdvanced ? (
						<div className="border-t border-border pt-5 space-y-5">
							<div className="font-mono text-xs uppercase tracking-widest">
								{t('advanced.title')}
							</div>

							<div className="space-y-1">
								<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									{t('advanced.noteLabel')}
								</Label>
								<Input
									value={note}
									onChange={(e) => setNote(e.target.value)}
									placeholder={t('advanced.notePlaceholder')}
									className="rounded-none font-mono text-xs h-9"
								/>
							</div>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div className="space-y-3">
									<div className="font-mono text-xs uppercase tracking-widest">
										{t('advanced.saveNewTemplate.title')}
									</div>
									<div className="grid grid-cols-1 gap-3">
										<div className="space-y-1">
											<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
												{t('advanced.saveNewTemplate.nameLabel')}
											</Label>
											<Input
												value={newName}
												onChange={(e) => setNewName(e.target.value)}
												placeholder={t('advanced.saveNewTemplate.namePlaceholder')}
												className="rounded-none font-mono text-xs h-9"
											/>
										</div>
										<div className="space-y-1">
											<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
												{t('advanced.saveNewTemplate.descLabel')}
											</Label>
											<Input
												value={newDescription}
												onChange={(e) => setNewDescription(e.target.value)}
												placeholder={t('advanced.saveNewTemplate.descPlaceholder')}
												className="rounded-none font-mono text-xs h-9"
											/>
										</div>
									<Button
										type="button"
										className="rounded-none font-mono text-xs uppercase"
										disabled={!canSave || !newName.trim()}
											onClick={() => {
												if (!normalizedTemplateConfig) {
													toast.error(t('toasts.nothingToSave'))
													return
												}
												createMutation.mutate({
												name: newName.trim(),
												description: newDescription.trim() || undefined,
												templateId: effectiveTemplateId,
												templateConfig: normalizedTemplateConfig,
												note: note.trim() || undefined,
												sourceThreadId: threadId,
											})
										}}
										>
											{createMutation.isPending
												? t('advanced.saveNewTemplate.saving')
												: t('advanced.saveNewTemplate.save')}
										</Button>
									</div>
								</div>

								<div className="space-y-3">
									<div className="font-mono text-xs uppercase tracking-widest">
										{t('advanced.saveNewVersion.title')}
									</div>
									<div className="grid grid-cols-1 gap-3">
										<div className="space-y-1">
											<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
												{t('advanced.saveNewVersion.libraryLabel')}
											</Label>
											<Select
											value={saveToLibraryId}
											onValueChange={(v) => setSaveToLibraryId(v)}
											>
												<SelectTrigger className="rounded-none font-mono text-xs h-9">
													<SelectValue
														placeholder={t('advanced.saveNewVersion.libraryPlaceholder')}
													/>
												</SelectTrigger>
											<SelectContent>
												{saveTargetLibraries.map((l: any) => (
													<SelectItem key={String(l.id)} value={String(l.id)}>
														{String(l.name)} (v{l.latestVersion ?? '—'})
													</SelectItem>
												))}
											</SelectContent>
											</Select>
											{saveTargetLibraries.length === 0 ? (
												<div className="font-mono text-xs text-muted-foreground">
													{t('advanced.saveNewVersion.noneSaved', {
														templateId: effectiveTemplateId,
													})}
												</div>
											) : null}
										</div>
									<Button
										type="button"
										variant="outline"
										className="rounded-none font-mono text-xs uppercase"
										disabled={!canSave || !saveToLibraryId}
											onClick={() => {
												if (!normalizedTemplateConfig) {
													toast.error(t('toasts.nothingToSave'))
													return
												}
												addVersionMutation.mutate({
												libraryId: saveToLibraryId,
												templateConfig: normalizedTemplateConfig,
												note: note.trim() || undefined,
												sourceThreadId: threadId,
											})
										}}
										>
											{addVersionMutation.isPending
												? t('advanced.saveNewVersion.saving')
												: t('advanced.saveNewVersion.save')}
										</Button>
									</div>
								</div>
							</div>

							<div className="space-y-2">
								<div className="font-mono text-xs uppercase tracking-widest">
									{t('advanced.danger.title')}
								</div>
								<Button
								type="button"
								variant="outline"
								className="rounded-none font-mono text-xs uppercase"
								disabled={!applyVersionId || rollbackMutation.isPending}
								onClick={() => {
									if (!applyVersionId) return
									rollbackMutation.mutate({ versionId: applyVersionId })
								}}
								>
									{rollbackMutation.isPending
										? t('advanced.danger.rollingBack')
										: t('advanced.danger.rollback')}
								</Button>
							</div>
						</div>
					) : null}
			</CardContent>
		</Card>
	)
}
