import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import * as React from 'react'
import { toast } from 'sonner'
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
import { Textarea } from '~/components/ui/textarea'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { queryOrpc } from '~/lib/orpc/client'
import { listThreadTemplates } from '@app/remotion-project/thread-templates'
import {
	DEFAULT_THREAD_TEMPLATE_CONFIG,
	normalizeThreadTemplateConfig,
} from '@app/remotion-project/thread-template-config'

export const Route = createFileRoute('/thread-templates/')({
	component: ThreadTemplatesRoute,
})

function toPrettyJson(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2)
	} catch (e) {
		return e instanceof Error ? e.message : String(e)
	}
}

function ThreadTemplatesRoute() {
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
	const [createNote, setCreateNote] = React.useState('')
	const [createConfigText, setCreateConfigText] = React.useState(() =>
		toPrettyJson(DEFAULT_THREAD_TEMPLATE_CONFIG),
	)

	const createConfigParsed = React.useMemo(() => {
		const text = createConfigText.trim()
		if (!text) return { value: null as unknown, error: null as string | null }
		try {
			return {
				value: JSON.parse(text) as unknown,
				error: null as string | null,
			}
		} catch (e) {
			return {
				value: undefined,
				error: e instanceof Error ? e.message : String(e),
			}
		}
	}, [createConfigText])

	const createMutation = useEnhancedMutation(
		queryOrpc.threadTemplate.create.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({
					queryKey: queryOrpc.threadTemplate.list.key(),
				})
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

	const addVersionMutation = useEnhancedMutation(
		queryOrpc.threadTemplate.addVersion.mutationOptions({
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

	const [newVersionNote, setNewVersionNote] = React.useState('')
	const [newVersionConfigText, setNewVersionConfigText] = React.useState('')
	const newVersionConfigParsed = React.useMemo(() => {
		const text = newVersionConfigText.trim()
		if (!text) return { value: null as unknown, error: null as string | null }
		try {
			return {
				value: JSON.parse(text) as unknown,
				error: null as string | null,
			}
		} catch (e) {
			return {
				value: undefined,
				error: e instanceof Error ? e.message : String(e),
			}
		}
	}, [newVersionConfigText])

	React.useEffect(() => {
		if (!selectedLibrary) return
		setRenameName(String((selectedLibrary as any).name ?? ''))
		setRenameDescription(String((selectedLibrary as any).description ?? ''))
	}, [selectedLibrary?.id])

	React.useEffect(() => {
		if (!selectedLibraryId) {
			setNewVersionConfigText('')
			return
		}
		const latest = versions[0]
		if (!latest) return
		if (!latest.templateConfigResolved && !latest.templateConfig) return
		setNewVersionConfigText(
			toPrettyJson(latest.templateConfigResolved ?? latest.templateConfig),
		)
	}, [selectedLibraryId, versions])

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
							<div className="space-y-2">
								<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									Note (optional)
								</Label>
								<Input
									value={createNote}
									onChange={(e) => setCreateNote(e.target.value)}
									placeholder="e.g. initial version"
									className="rounded-none font-mono text-xs h-9"
								/>
							</div>
						</div>

						<div className="space-y-2">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
									Config JSON (v1)
								</Label>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-none font-mono text-[10px] uppercase"
									onClick={() => {
										setCreateConfigText(
											toPrettyJson(
												normalizeThreadTemplateConfig(
													DEFAULT_THREAD_TEMPLATE_CONFIG,
												),
											),
										)
										toast.message('Reset to default config')
									}}
								>
									Use Default
								</Button>
							</div>
							<Textarea
								value={createConfigText}
								onChange={(e) => setCreateConfigText(e.target.value)}
								className="min-h-[160px] rounded-none font-mono text-xs"
								placeholder='{"version":1,...}'
							/>
							{createConfigParsed.error ? (
								<div className="font-mono text-xs text-destructive">
									JSON error: {createConfigParsed.error}
								</div>
							) : null}
							<div className="font-mono text-xs text-muted-foreground">
								Must include <span className="font-mono">"version": 1</span>.
							</div>
						</div>

						<Button
							type="button"
							className="rounded-none font-mono text-xs uppercase"
							disabled={
								createMutation.isPending ||
								!createName.trim() ||
								Boolean(createConfigParsed.error) ||
								createConfigParsed.value == null
							}
							onClick={() => {
								if (createConfigParsed.error) return
								if (createConfigParsed.value == null) {
									toast.error('Config JSON is empty')
									return
								}
								createMutation.mutate({
									name: createName.trim(),
									templateId: createTemplateId,
									description: createDescription.trim() || undefined,
									note: createNote.trim() || undefined,
									templateConfig: createConfigParsed.value,
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
										<Button
											type="button"
											size="sm"
											variant="outline"
											className="rounded-none font-mono text-[10px] uppercase"
											disabled={!selectedLibraryId}
											onClick={() => {
												const latest = versions[0]
												if (!latest?.templateConfig) {
													toast.error('No templateConfig in latest version')
													return
												}
												addVersionMutation.mutate({
													libraryId: selectedLibraryId,
													templateConfig: latest.templateConfig,
													note: 'Copy latest',
												})
											}}
										>
											Copy Latest → New Version
										</Button>
									</div>

									<div className="grid grid-cols-1 gap-3">
										<div className="space-y-2">
											<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
												Add version from JSON
											</Label>
											<Textarea
												value={newVersionConfigText}
												onChange={(e) =>
													setNewVersionConfigText(e.target.value)
												}
												className="min-h-[120px] rounded-none font-mono text-xs"
												placeholder='{"version":1,...}'
											/>
											<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
												<Input
													value={newVersionNote}
													onChange={(e) => setNewVersionNote(e.target.value)}
													placeholder="note (optional)"
													className="rounded-none font-mono text-xs h-9"
												/>
												<div />
											</div>
											<Button
												type="button"
												size="sm"
												variant="outline"
												className="rounded-none font-mono text-[10px] uppercase"
												disabled={
													!selectedLibraryId ||
													Boolean(newVersionConfigParsed.error) ||
													newVersionConfigParsed.value == null ||
													addVersionMutation.isPending
												}
												onClick={() => {
													if (!selectedLibraryId) return
													if (newVersionConfigParsed.error) {
														toast.error(
															`JSON error: ${newVersionConfigParsed.error}`,
														)
														return
													}
													if (newVersionConfigParsed.value == null) {
														toast.error('Config JSON is empty')
														return
													}
													addVersionMutation.mutate({
														libraryId: selectedLibraryId,
														templateConfig: newVersionConfigParsed.value,
														note: newVersionNote.trim() || undefined,
													})
												}}
											>
												{addVersionMutation.isPending
													? 'Saving…'
													: 'Save Version'}
											</Button>
											{newVersionConfigParsed.error ? (
												<div className="font-mono text-xs text-destructive">
													JSON error: {newVersionConfigParsed.error}
												</div>
											) : null}
										</div>

										<div className="rounded-none border border-border">
											<div className="max-h-[420px] overflow-auto">
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
																	onClick={() => {
																		try {
																			void navigator.clipboard?.writeText(
																				toPrettyJson(
																					v.templateConfigResolved ??
																						v.templateConfig,
																				),
																			)
																			toast.message('Copied JSON')
																		} catch {
																			toast.error('Copy failed')
																		}
																	}}
																>
																	Copy JSON
																</Button>
																<Button
																	type="button"
																	size="sm"
																	variant="outline"
																	className="rounded-none font-mono text-[10px] uppercase"
																	disabled={rollbackMutation.isPending}
																	onClick={() => {
																		rollbackMutation.mutate({
																			versionId: String(v.id),
																		})
																	}}
																>
																	Rollback
																</Button>
															</div>
														</div>
														{v.note ? (
															<div className="font-mono text-xs text-muted-foreground">
																{String(v.note)}
															</div>
														) : null}
														<div className="font-mono text-[10px] text-muted-foreground">
															hash=
															{String(v.templateConfigHash ?? '—').slice(0, 16)}
															{' · '}compileVersion=
															{String(v.compileVersion ?? '—')}
														</div>
													</div>
												))}
											</div>
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
								setRenameOpen(false)
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
