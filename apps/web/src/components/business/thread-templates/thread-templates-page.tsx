'use client'

import { DEFAULT_THREAD_TEMPLATE_CONFIG } from '@app/remotion-project/thread-template-config'
import { listThreadTemplates } from '@app/remotion-project/thread-templates'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
	Archive,
	ArrowLeft,
	Edit,
	FileText,
	History,
	LayoutTemplate,
	Plus,
	Settings2,
	Trash2,
} from 'lucide-react'
import * as React from 'react'
import { useConfirmDialog } from '~/components/business/layout/confirm-dialog-provider'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { Separator } from '~/components/ui/separator'
import { getUserFriendlyErrorMessage } from '~/lib/shared/errors/client'
import { useEnhancedMutation } from '~/lib/shared/hooks/useEnhancedMutation'
import { useTranslations } from '~/lib/shared/i18n'
import { cn } from '~/lib/shared/utils'
import { queryOrpc } from '~/orpc'

export function ThreadTemplatesPage() {
	const navigate = useNavigate()
	const qc = useQueryClient()
	const confirmDialog = useConfirmDialog()
	const t = useTranslations('ThreadTemplates.library')

	// --- Queries ---
	const templates = React.useMemo(() => listThreadTemplates(), [])

	const listQuery = useQuery(queryOrpc.threadTemplate.list.queryOptions())
	const libraries = listQuery.data?.libraries ?? []

	const [selectedLibraryId, setSelectedLibraryId] = React.useState<string>('')

	// Auto-select first library if none selected
	React.useEffect(() => {
		if (selectedLibraryId) return
		const first = libraries[0]
		if (first?.id) setSelectedLibraryId(String(first.id))
	}, [libraries, selectedLibraryId])

	const versionsQuery = useQuery(
		queryOrpc.threadTemplate.versions.queryOptions({
			input: { libraryId: selectedLibraryId, limit: 50 },
			enabled: Boolean(selectedLibraryId),
		}),
	)
	const selectedLibrary = versionsQuery.data?.library ?? null
	const versions = versionsQuery.data?.versions ?? []

	// --- State: Create ---
	const [createOpen, setCreateOpen] = React.useState(false)
	const [createName, setCreateName] = React.useState('')
	const [createTemplateId, setCreateTemplateId] = React.useState<string>(() => {
		const first = templates[0]?.id
		return first ? String(first) : 'thread-forum'
	})
	const [createDescription, setCreateDescription] = React.useState('')

	// --- State: Rename ---
	const [renameOpen, setRenameOpen] = React.useState(false)
	const [renameName, setRenameName] = React.useState('')
	const [renameDescription, setRenameDescription] = React.useState('')

	// --- State: Versions UI ---
	const [showVersionsAdvanced, setShowVersionsAdvanced] = React.useState(false)

	// --- Mutations ---
	const createMutation = useEnhancedMutation(
		queryOrpc.threadTemplate.create.mutationOptions({
			onSuccess: async (data) => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.threadTemplate.list.key(),
				})
				const libraryId = String((data as any)?.libraryId ?? '')
				const versionId = String((data as any)?.versionId ?? '')
				if (libraryId) setSelectedLibraryId(libraryId)
				setCreateName('')
				setCreateDescription('')
				setCreateOpen(false)
				if (libraryId && versionId) {
					navigate({
						to: '/thread-templates/$libraryId/versions/$versionId/editor',
						params: { libraryId, versionId },
						search: { previewThreadId: '' },
					})
				}
			},
		}),
		{
			successToast: t('toasts.created'),
			errorToast: ({ error }) => getUserFriendlyErrorMessage(error),
		},
	)

	const updateMutation = useEnhancedMutation(
		queryOrpc.threadTemplate.update.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.threadTemplate.list.key(),
				})
				if (selectedLibraryId) {
					await qc.invalidateQueries({
						queryKey: queryOrpc.threadTemplate.versions.queryKey({
							input: { libraryId: selectedLibraryId, limit: 50 },
						}),
					})
				}
				setRenameOpen(false)
			},
		}),
		{
			successToast: t('toasts.updated'),
			errorToast: ({ error }) => getUserFriendlyErrorMessage(error),
		},
	)

	const deleteMutation = useEnhancedMutation(
		queryOrpc.threadTemplate.deleteById.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.threadTemplate.list.key(),
				})
				setSelectedLibraryId('')
			},
		}),
		{
			successToast: t('toasts.deleted'),
			errorToast: ({ error }) => getUserFriendlyErrorMessage(error),
		},
	)

	const rollbackMutation = useEnhancedMutation(
		queryOrpc.threadTemplate.rollback.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.threadTemplate.list.key(),
				})
				if (selectedLibraryId) {
					await qc.invalidateQueries({
						queryKey: queryOrpc.threadTemplate.versions.queryKey({
							input: { libraryId: selectedLibraryId, limit: 50 },
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

	// Sync rename state when library changes
	React.useEffect(() => {
		if (!selectedLibrary) return
		setRenameName(String((selectedLibrary as any).name ?? ''))
		setRenameDescription(String((selectedLibrary as any).description ?? ''))
	}, [selectedLibrary?.id, selectedLibrary]) // Added selectedLibrary dependency for safety

	return (
		<div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
			{/* Header */}
			<header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-sm">
				<div className="mx-auto max-w-[1600px] px-4 h-16 flex items-center justify-between gap-4">
					<div className="flex items-center gap-2">
						<div className="bg-primary/10 p-2 rounded-md">
							<LayoutTemplate className="h-5 w-5 text-primary" />
						</div>
						<div>
							<h1 className="text-lg font-bold tracking-tight">
								{t('header.title')}
							</h1>
							<p className="text-xs text-muted-foreground hidden sm:block">
								{t('header.sectionLabel')}
							</p>
						</div>
					</div>
					<Button variant="ghost" size="sm" className="gap-2" asChild>
						<Link to="/threads">
							<ArrowLeft className="h-4 w-4" />
							{t('header.backToThreads')}
						</Link>
					</Button>
				</div>
			</header>

			<main className="flex-1 mx-auto w-full max-w-[1600px] px-4 py-6">
				<div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
					{/* Sidebar: List */}
					<div className="md:col-span-4 lg:col-span-3 space-y-4">
						<div className="flex items-center justify-between">
							<h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
								{t('saved.title')}
							</h2>
							<Button
								size="sm"
								variant="outline"
								className="h-8 gap-1"
								onClick={() => setCreateOpen(true)}
							>
								<Plus className="h-3.5 w-3.5" />
								{t('create.create')}
							</Button>
						</div>

						<div className="space-y-2">
							{libraries.length === 0 ? (
								<div className="rounded-lg border border-dashed p-8 text-center">
									<p className="text-sm text-muted-foreground">
										{t('saved.empty')}
									</p>
									<Button
										variant="link"
										className="mt-2 h-auto p-0"
										onClick={() => setCreateOpen(true)}
									>
										{t('create.create')}
									</Button>
								</div>
							) : (
								<div className="flex flex-col gap-2">
									{libraries.map((l: any) => {
										const isSelected = String(l.id) === selectedLibraryId
										return (
											<button
												key={String(l.id)}
												type="button"
												onClick={() => setSelectedLibraryId(String(l.id))}
												className={cn(
													'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all hover:bg-accent',
													isSelected
														? 'border-primary bg-primary/5 shadow-sm'
														: 'border-transparent bg-card',
												)}
											>
												<div className="flex w-full items-center justify-between gap-2">
													<span className="font-semibold text-sm truncate">
														{String(l.name)}
													</span>
													{isSelected && (
														<div className="h-1.5 w-1.5 rounded-full bg-primary" />
													)}
												</div>
												<div className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
													<span className="font-mono opacity-70">
														{String(l.templateId)}
													</span>
													<Badge
														variant="secondary"
														className="text-[10px] h-5 px-1.5 font-mono"
													>
														v{l.latestVersion ?? '?'}
													</Badge>
												</div>
											</button>
										)
									})}
								</div>
							)}
						</div>
					</div>

					{/* Main Content: Details */}
					<div className="md:col-span-8 lg:col-span-9 space-y-6">
						{!selectedLibrary ? (
							<Card className="flex h-[300px] flex-col items-center justify-center text-center border-dashed shadow-none bg-muted/30">
								<div className="rounded-full bg-muted p-3 mb-4">
									<LayoutTemplate className="h-6 w-6 text-muted-foreground" />
								</div>
								<h3 className="text-lg font-semibold">
									{t('versions.selectTemplateHint')}
								</h3>
								<p className="text-sm text-muted-foreground max-w-xs mt-2">
									Select a template from the list to view details and versions,
									or create a new one.
								</p>
								<Button
									variant="default"
									className="mt-4 gap-2"
									onClick={() => setCreateOpen(true)}
								>
									<Plus className="h-4 w-4" />
									Create New
								</Button>
							</Card>
						) : (
							<>
								{/* Selected Template Header */}
								<div className="space-y-4">
									<div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
										<div className="space-y-1.5">
											<div className="flex items-center gap-3">
												<h2 className="text-2xl font-bold tracking-tight">
													{String((selectedLibrary as any).name)}
												</h2>
												<Badge variant="outline" className="font-mono">
													{String((selectedLibrary as any).templateId)}
												</Badge>
											</div>
											<p className="text-muted-foreground text-sm max-w-2xl">
												{(selectedLibrary as any).description ||
													'No description provided.'}
											</p>
										</div>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												className="gap-2"
												onClick={() => setRenameOpen(true)}
											>
												<Edit className="h-3.5 w-3.5" />
												<span className="hidden sm:inline">
													{t('saved.rename')}
												</span>
											</Button>
											<Button
												variant="outline"
												size="sm"
												className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
												disabled={deleteMutation.isPending}
												onClick={() => {
													void (async () => {
														const ok = await confirmDialog({
															title: t('dialogs.delete.title'),
															description: t('dialogs.delete.description'),
															confirmText: t('dialogs.delete.confirmText'),
															variant: 'destructive',
														})
														if (!ok) return
														deleteMutation.mutate({
															libraryId: selectedLibraryId,
														})
													})()
												}}
											>
												<Trash2 className="h-3.5 w-3.5" />
												<span className="hidden sm:inline">
													{t('saved.delete')}
												</span>
											</Button>
										</div>
									</div>
									<Separator />
								</div>

								{/* Versions Section */}
								<div className="space-y-4">
									<div className="flex items-center justify-between">
										<h3 className="text-lg font-semibold flex items-center gap-2">
											<History className="h-4 w-4 text-muted-foreground" />
											{t('versions.title')}
										</h3>
										<div className="flex items-center gap-2">
											{versions[0]?.id && (
												<Button size="sm" className="gap-2" asChild>
													<Link
														to="/thread-templates/$libraryId/versions/$versionId/editor"
														params={{
															libraryId: selectedLibraryId,
															versionId: String(versions[0].id),
														}}
													>
														<Edit className="h-3.5 w-3.5" />
														{t('versions.editLatest')}
													</Link>
												</Button>
											)}
											<Button
												variant="ghost"
												size="sm"
												className="gap-2"
												onClick={() => setShowVersionsAdvanced((v) => !v)}
											>
												<Settings2 className="h-3.5 w-3.5" />
												{showVersionsAdvanced
													? t('versions.hideAdvanced')
													: t('versions.advanced')}
											</Button>
										</div>
									</div>

									<div className="rounded-md border bg-card">
										{versions.length === 0 ? (
											<div className="p-8 text-center text-sm text-muted-foreground">
												{t('versions.empty')}
											</div>
										) : (
											<div className="divide-y divide-border">
												{versions.map((v: any) => (
													<div
														key={String(v.id)}
														className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 hover:bg-muted/30 transition-colors"
													>
														<div className="flex items-start gap-4">
															<div className="flex flex-col items-center gap-1 mt-0.5">
																<Badge className="font-mono min-w-[3rem] justify-center">
																	v{Number(v.version)}
																</Badge>
															</div>
															<div className="space-y-1">
																<div className="text-xs font-mono text-muted-foreground flex items-center gap-2">
																	<span>
																		ID: {String(v.id).slice(0, 8)}...
																	</span>
																</div>
																{v.note ? (
																	<div className="text-sm flex items-start gap-1.5">
																		<FileText className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
																		<span>{String(v.note)}</span>
																	</div>
																) : (
																	<span className="text-sm text-muted-foreground italic">
																		No release notes
																	</span>
																)}
															</div>
														</div>

														<div className="flex items-center gap-2 self-end sm:self-center">
															<Button
																variant="outline"
																size="sm"
																className="h-8 text-xs"
																asChild
															>
																<Link
																	to="/thread-templates/$libraryId/versions/$versionId/editor"
																	params={{
																		libraryId: selectedLibraryId,
																		versionId: String(v.id),
																	}}
																>
																	{t('versions.openEditor')}
																</Link>
															</Button>

															{showVersionsAdvanced && (
																<Button
																	variant="outline"
																	size="sm"
																	className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
																	disabled={rollbackMutation.isPending}
																	onClick={() => {
																		void (async () => {
																			const ok = await confirmDialog({
																				title: t('dialogs.rollback.title'),
																				description: t(
																					'dialogs.rollback.description',
																				),
																				confirmText: t(
																					'dialogs.rollback.confirmText',
																				),
																				variant: 'destructive',
																			})
																			if (!ok) return
																			rollbackMutation.mutate({
																				versionId: String(v.id),
																			})
																		})()
																	}}
																>
																	<Archive className="h-3.5 w-3.5 mr-1" />
																	{t('versions.rollback')}
																</Button>
															)}
														</div>
													</div>
												))}
											</div>
										)}
									</div>
								</div>
							</>
						)}
					</div>
				</div>
			</main>

			{/* Create Dialog */}
			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('create.title')}</DialogTitle>
						<DialogDescription>{t('create.hint')}</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<div className="space-y-2">
							<Label htmlFor="create-name">{t('create.nameLabel')}</Label>
							<Input
								id="create-name"
								value={createName}
								onChange={(e) => setCreateName(e.target.value)}
								placeholder={t('create.namePlaceholder')}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="create-template">{t('create.templateIdLabel')}</Label>
							<Select
								value={createTemplateId}
								onValueChange={(v) => setCreateTemplateId(v)}
							>
								<SelectTrigger id="create-template">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{templates.map((tpl: any) => (
										<SelectItem key={String(tpl.id)} value={String(tpl.id)}>
											{String(tpl.name)} ({String(tpl.id)})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="create-desc">{t('create.descLabel')}</Label>
							<Input
								id="create-desc"
								value={createDescription}
								onChange={(e) => setCreateDescription(e.target.value)}
								placeholder={t('create.descPlaceholder')}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setCreateOpen(false)}>
							Cancel
						</Button>
						<Button
							disabled={createMutation.isPending || !createName.trim()}
							onClick={() => {
								createMutation.mutate({
									name: createName.trim(),
									templateId: createTemplateId,
									description: createDescription.trim() || undefined,
									note: 'Initial version',
									templateConfig: DEFAULT_THREAD_TEMPLATE_CONFIG,
								})
							}}
						>
							{createMutation.isPending
								? t('create.creating')
								: t('create.create')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Rename Dialog */}
			<Dialog open={renameOpen} onOpenChange={setRenameOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('dialogs.rename.title')}</DialogTitle>
						<DialogDescription>
							{t('dialogs.rename.description')}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<div className="space-y-2">
							<Label htmlFor="rename-name">
								{t('dialogs.rename.nameLabel')}
							</Label>
							<Input
								id="rename-name"
								value={renameName}
								onChange={(e) => setRenameName(e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="rename-desc">
								{t('dialogs.rename.descriptionLabel')}
							</Label>
							<Input
								id="rename-desc"
								value={renameDescription}
								onChange={(e) => setRenameDescription(e.target.value)}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRenameOpen(false)}>
							{t('dialogs.rename.cancel')}
						</Button>
						<Button
							disabled={!selectedLibraryId || updateMutation.isPending}
							onClick={() => {
								if (!selectedLibraryId) return
								updateMutation.mutate({
									libraryId: selectedLibraryId,
									name: renameName,
									description: renameDescription.trim()
										? renameDescription
										: null,
								})
							}}
						>
							{t('dialogs.rename.save')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

