import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import * as React from 'react'
import { useConfirmDialog } from '~/components/business/layout/confirm-dialog-provider'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
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
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { queryOrpc } from '~/lib/orpc/client'
import { listThreadTemplates } from '@app/remotion-project/thread-templates'
import { DEFAULT_THREAD_TEMPLATE_CONFIG } from '@app/remotion-project/thread-template-config'

export const Route = createFileRoute('/thread-templates/')({
	loader: async ({ context, location }) => {
		const me = await context.queryClient.ensureQueryData(
			queryOrpc.auth.me.queryOptions(),
		)
		if (!me.user) {
			const next = location.href
			throw redirect({ to: '/login', search: { next } })
		}
	},
	component: ThreadTemplatesRoute,
})

function ThreadTemplatesRoute() {
	const navigate = Route.useNavigate()
	const qc = useQueryClient()
	const confirmDialog = useConfirmDialog()

	const templates = React.useMemo(() => listThreadTemplates(), [])

	const listQuery = useQuery(queryOrpc.threadTemplate.list.queryOptions())
	const libraries = listQuery.data?.libraries ?? []

	const [selectedLibraryId, setSelectedLibraryId] = React.useState<string>('')
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

	const [createName, setCreateName] = React.useState('')
	const [createTemplateId, setCreateTemplateId] = React.useState<string>(() => {
		const first = templates[0]?.id
		return first ? String(first) : 'thread-forum'
	})
	const [createDescription, setCreateDescription] = React.useState('')

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
				if (libraryId && versionId) {
					await navigate({
						to: '/thread-templates/$libraryId/versions/$versionId/editor',
						params: { libraryId, versionId },
						search: { previewThreadId: '' },
					})
				}
			},
		}),
		{
			successToast: 'Created template',
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
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
			successToast: 'Updated template',
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
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
			successToast: 'Deleted template',
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
			successToast: 'Rollback version created',
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
		},
	)

	const [renameOpen, setRenameOpen] = React.useState(false)
	const [renameName, setRenameName] = React.useState('')
	const [renameDescription, setRenameDescription] = React.useState('')
	const [showVersionsAdvanced, setShowVersionsAdvanced] = React.useState(false)

	React.useEffect(() => {
		if (!selectedLibrary) return
		setRenameName(String((selectedLibrary as any).name ?? ''))
		setRenameDescription(String((selectedLibrary as any).description ?? ''))
	}, [selectedLibrary?.id])

	return (
		<div className="min-h-screen bg-background font-sans text-foreground">
			<div className="border-b border-border bg-card">
				<div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
					<div className="flex items-center justify-between gap-4">
						<div className="space-y-1">
							<div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
								Templates
							</div>
							<h1 className="font-mono text-xl font-bold uppercase tracking-tight">
								Thread Template Library
							</h1>
						</div>
						<Button
							variant="outline"
							size="sm"
							className="rounded-none font-mono text-xs uppercase tracking-wider"
							asChild
						>
							<Link to="/threads">Back to Threads</Link>
						</Button>
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
				<Card className="rounded-none">
					<CardHeader>
						<CardTitle className="font-mono text-sm uppercase tracking-widest">
							Create
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									Name
								</Label>
								<Input
									value={createName}
									onChange={(e) => setCreateName(e.target.value)}
									placeholder="e.g. Forum Split Layout"
									className="rounded-none font-mono text-xs h-9"
								/>
							</div>
							<div className="space-y-2">
								<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									Template ID
								</Label>
								<Select
									value={createTemplateId}
									onValueChange={(v) => setCreateTemplateId(v)}
								>
									<SelectTrigger className="rounded-none font-mono text-xs h-9">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{templates.map((t: any) => (
											<SelectItem key={String(t.id)} value={String(t.id)}>
												{String(t.name)} ({String(t.id)})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									Description (optional)
								</Label>
								<Input
									value={createDescription}
									onChange={(e) => setCreateDescription(e.target.value)}
									placeholder="What is this template for?"
									className="rounded-none font-mono text-xs h-9"
								/>
							</div>
							<div className="font-mono text-xs text-muted-foreground">
								You can customize layout in the editor after creation.
							</div>
						</div>

						<Button
							type="button"
							className="rounded-none font-mono text-xs uppercase"
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
							{createMutation.isPending ? 'Creating…' : 'Create'}
						</Button>
					</CardContent>
				</Card>

				<div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
					<Card className="rounded-none">
						<CardHeader>
							<CardTitle className="font-mono text-sm uppercase tracking-widest">
								Saved
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2">
							{libraries.length === 0 ? (
								<div className="font-mono text-xs text-muted-foreground">
									No templates yet.
								</div>
							) : null}

							<div className="space-y-1">
								<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									Template
								</Label>
								<Select
									value={selectedLibraryId}
									onValueChange={(v) => setSelectedLibraryId(v)}
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

							<div className="flex flex-wrap items-center gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-none font-mono text-[10px] uppercase"
									disabled={!selectedLibraryId}
									onClick={() => setRenameOpen(true)}
								>
									Rename
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-none font-mono text-[10px] uppercase"
									disabled={!selectedLibraryId || deleteMutation.isPending}
									onClick={() => {
										if (!selectedLibraryId) return
										void (async () => {
											const ok = await confirmDialog({
												title: 'Delete template?',
												description:
													'This will delete the template and all its versions.',
												confirmText: 'Delete',
												variant: 'destructive',
											})
											if (!ok) return
											deleteMutation.mutate({ libraryId: selectedLibraryId })
										})()
									}}
								>
									{deleteMutation.isPending ? 'Deleting…' : 'Delete'}
								</Button>
							</div>
						</CardContent>
					</Card>

					<Card className="rounded-none">
						<CardHeader>
							<CardTitle className="font-mono text-sm uppercase tracking-widest">
								Versions
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							{!selectedLibrary ? (
								<div className="font-mono text-xs text-muted-foreground">
									Select a template to view versions.
								</div>
							) : (
								<>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div className="font-mono text-xs text-muted-foreground">
											{String((selectedLibrary as any).name)} · templateId=
											{String((selectedLibrary as any).templateId)}
										</div>
										<div className="flex items-center gap-2">
											<Button
												type="button"
												size="sm"
												variant="outline"
												className="rounded-none font-mono text-[10px] uppercase"
												disabled={!versions[0]?.id}
												asChild
											>
												<Link
													to="/thread-templates/$libraryId/versions/$versionId/editor"
													params={{
														libraryId: selectedLibraryId,
														versionId: String(versions[0]?.id ?? ''),
													}}
												>
													Edit Latest
												</Link>
											</Button>
											<Button
												type="button"
												size="sm"
												variant="outline"
												className="rounded-none font-mono text-[10px] uppercase"
												onClick={() => setShowVersionsAdvanced((v) => !v)}
											>
												{showVersionsAdvanced ? 'Hide advanced' : 'Advanced'}
											</Button>
										</div>
									</div>

									<div className="rounded-none border border-border">
										<div className="max-h-[520px] overflow-auto">
											{versions.length === 0 ? (
												<div className="p-3 font-mono text-xs text-muted-foreground">
													No versions yet.
												</div>
											) : null}

											{versions.map((v: any) => (
												<div
													key={String(v.id)}
													className="border-b border-border p-3 last:border-b-0 space-y-2"
												>
													<div className="flex flex-wrap items-center justify-between gap-2">
														<div className="font-mono text-xs">
															v{Number(v.version)} ·{' '}
															<span className="text-muted-foreground">
																{String(v.id).slice(0, 12)}
															</span>
														</div>
														<div className="flex flex-wrap items-center gap-2">
															<Button
																type="button"
																size="sm"
																variant="outline"
																className="rounded-none font-mono text-[10px] uppercase"
																asChild
															>
																<Link
																	to="/thread-templates/$libraryId/versions/$versionId/editor"
																	params={{
																		libraryId: selectedLibraryId,
																		versionId: String(v.id),
																	}}
																>
																	Open Editor
																</Link>
															</Button>

															{showVersionsAdvanced ? (
																<Button
																	type="button"
																	size="sm"
																	variant="outline"
																	className="rounded-none font-mono text-[10px] uppercase"
																	disabled={rollbackMutation.isPending}
																	onClick={() => {
																		void (async () => {
																			const ok = await confirmDialog({
																				title: 'Rollback version?',
																				description:
																					'This creates a new version that matches the selected one.',
																				confirmText: 'Rollback',
																				variant: 'destructive',
																			})
																			if (!ok) return
																			rollbackMutation.mutate({
																				versionId: String(v.id),
																			})
																		})()
																	}}
																>
																	Rollback
																</Button>
															) : null}
														</div>
													</div>

													{v.note ? (
														<div className="font-mono text-xs text-muted-foreground">
															{String(v.note)}
														</div>
													) : null}
												</div>
											))}
										</div>
									</div>
								</>
							)}
						</CardContent>
					</Card>
				</div>
			</div>

			<Dialog open={renameOpen} onOpenChange={setRenameOpen}>
				<DialogContent className="rounded-none border-2 border-primary p-0 overflow-hidden max-w-lg">
					<DialogHeader className="bg-primary p-4 text-primary-foreground">
						<DialogTitle className="text-xs font-bold uppercase tracking-[0.2em]">
							Rename Template
						</DialogTitle>
						<DialogDescription className="text-primary-foreground/80">
							Update name/description for the selected template.
						</DialogDescription>
					</DialogHeader>
					<div className="p-4 space-y-3">
						<div className="space-y-1">
							<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Name
							</Label>
							<Input
								value={renameName}
								onChange={(e) => setRenameName(e.target.value)}
								className="rounded-none font-mono text-xs h-9"
							/>
						</div>
						<div className="space-y-1">
							<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								Description
							</Label>
							<Input
								value={renameDescription}
								onChange={(e) => setRenameDescription(e.target.value)}
								className="rounded-none font-mono text-xs h-9"
							/>
						</div>
					</div>
					<DialogFooter className="p-4 pt-0">
						<Button
							type="button"
							variant="outline"
							className="rounded-none font-mono text-xs uppercase"
							onClick={() => setRenameOpen(false)}
						>
							Cancel
						</Button>
						<Button
							type="button"
							className="rounded-none font-mono text-xs uppercase"
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
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
