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
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
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
			successToast: 'Saved to library',
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
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
			successToast: 'Saved new version',
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
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
			successToast: 'Rollback version created',
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
		},
	)

	const applyMutation = useEnhancedMutation(
		queryOrpc.threadTemplate.applyToThread.mutationOptions({
			onSuccess: async () => {
				await onApplied()
			},
		}),
		{
			successToast: 'Applied template to thread',
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
		},
	)

	const canSave =
		Boolean(normalizedTemplateConfig) &&
		!createMutation.isPending &&
		!addVersionMutation.isPending

	return (
		<Card className="rounded-none">
			<CardContent className="py-5 space-y-5">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="font-mono text-xs text-muted-foreground">
						Current template: {effectiveTemplateId}
					</div>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="rounded-none font-mono text-[10px] uppercase"
						onClick={() => setShowAdvanced((v) => !v)}
					>
						{showAdvanced ? 'Hide advanced' : 'Advanced'}
					</Button>
				</div>

				<div className="space-y-3">
					<div className="font-mono text-xs uppercase tracking-widest">Use</div>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto_auto] items-end">
						<div className="space-y-1">
							<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Template
							</Label>
							<Select
								value={applyLibraryId}
								onValueChange={(v) => {
									setApplyLibraryId(v)
									setApplyVersionId('')
								}}
							>
								<SelectTrigger className="rounded-none font-mono text-xs h-9">
									<SelectValue placeholder="Select template" />
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
								Version
							</Label>
							<Select
								value={applyVersionId}
								onValueChange={(v) => setApplyVersionId(v)}
								disabled={!applyLibraryId || versions.length === 0}
							>
								<SelectTrigger className="rounded-none font-mono text-xs h-9">
									<SelectValue placeholder="Select version" />
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
							{applyMutation.isPending ? 'Applying…' : 'Apply'}
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
								Open Editor
							</Link>
						</Button>
					</div>
					{willChangeTemplateId ? (
						<div className="font-mono text-xs text-muted-foreground">
							Note: applying this will also change templateId to{' '}
							{String((applyLibrary as any)?.templateId)}.
						</div>
					) : null}
					{versionsQuery.isFetching ? (
						<div className="font-mono text-xs text-muted-foreground">
							Loading versions…
						</div>
					) : null}
				</div>

				{showAdvanced ? (
					<div className="border-t border-border pt-5 space-y-5">
						<div className="font-mono text-xs uppercase tracking-widest">
							Advanced
						</div>

						<div className="space-y-1">
							<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Note (optional)
							</Label>
							<Input
								value={note}
								onChange={(e) => setNote(e.target.value)}
								placeholder="e.g. tweak cover typography"
								className="rounded-none font-mono text-xs h-9"
							/>
						</div>

						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div className="space-y-3">
								<div className="font-mono text-xs uppercase tracking-widest">
									Save as new template
								</div>
								<div className="grid grid-cols-1 gap-3">
									<div className="space-y-1">
										<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
											Name
										</Label>
										<Input
											value={newName}
											onChange={(e) => setNewName(e.target.value)}
											placeholder="e.g. My Forum Layout"
											className="rounded-none font-mono text-xs h-9"
										/>
									</div>
									<div className="space-y-1">
										<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
											Description (optional)
										</Label>
										<Input
											value={newDescription}
											onChange={(e) => setNewDescription(e.target.value)}
											placeholder="What is this template for?"
											className="rounded-none font-mono text-xs h-9"
										/>
									</div>
									<Button
										type="button"
										className="rounded-none font-mono text-xs uppercase"
										disabled={!canSave || !newName.trim()}
										onClick={() => {
											if (!normalizedTemplateConfig) {
												toast.error(
													'Nothing to save: normalized config is empty',
												)
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
										{createMutation.isPending ? 'Saving…' : 'Save New'}
									</Button>
								</div>
							</div>

							<div className="space-y-3">
								<div className="font-mono text-xs uppercase tracking-widest">
									Save as new version
								</div>
								<div className="grid grid-cols-1 gap-3">
									<div className="space-y-1">
										<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
											Library template
										</Label>
										<Select
											value={saveToLibraryId}
											onValueChange={(v) => setSaveToLibraryId(v)}
										>
											<SelectTrigger className="rounded-none font-mono text-xs h-9">
												<SelectValue placeholder="Select a saved template" />
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
												No saved templates for templateId={effectiveTemplateId}.
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
												toast.error(
													'Nothing to save: normalized config is empty',
												)
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
										{addVersionMutation.isPending ? 'Saving…' : 'Save Version'}
									</Button>
								</div>
							</div>
						</div>

						<div className="space-y-2">
							<div className="font-mono text-xs uppercase tracking-widest">
								Danger zone
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
									? 'Rolling back…'
									: 'Rollback version'}
							</Button>
						</div>
					</div>
				) : null}
			</CardContent>
		</Card>
	)
}
