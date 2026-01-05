'use client'

import { useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { parseXThreadImportDraft } from '~/lib/domain/thread/adapters/x'
import { useEnhancedMutation } from '~/lib/shared/hooks/useEnhancedMutation'
import { useTranslations } from '~/lib/shared/i18n'
import { queryOrpc } from '~/orpc/client'

export function ThreadsNewPage() {
	const navigate = useNavigate()
	const t = useTranslations('Threads.new')
	const [jsonText, setJsonText] = React.useState('')
	const [fileName, setFileName] = React.useState<string | null>(null)
	const [preview, setPreview] = React.useState<{
		title: string
		replies: number
		sourceUrl: string | null
	} | null>(null)

	React.useEffect(() => {
		try {
			const raw = JSON.parse(jsonText)
			const draft = parseXThreadImportDraft(raw)
			setFileName((v) => v ?? null)
			setPreview({
				title: draft.title,
				replies: draft.replies.length,
				sourceUrl: draft.sourceUrl,
			})
		} catch {
			setPreview(null)
		}
	}, [jsonText])

	const createMutation = useEnhancedMutation(
		queryOrpc.thread.createFromXJson.mutationOptions({
			onSuccess: (data) => {
				toast.success(
					data.existed
						? data.repaired
							? t('toasts.existedRepaired')
							: t('toasts.alreadyExists')
						: t('toasts.created'),
				)
				navigate({ to: '/threads/$id', params: { id: data.id }, replace: true })
			},
		}),
		{
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : String(error),
		},
	)

	return (
		<div className="min-h-screen bg-background font-sans text-foreground">
			<div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 space-y-6">
				<Card className="rounded-none">
					<CardHeader>
						<CardTitle className="font-mono text-sm uppercase tracking-widest">
							{t('title')}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								{t('inputs.uploadLabel')}
							</Label>
							<Input
								type="file"
								accept="application/json,.json"
								className="rounded-none font-mono text-xs"
								disabled={createMutation.isPending}
								onChange={async (e) => {
									const file = e.currentTarget.files?.[0]
									if (!file) return
									try {
										const text = await file.text()
										setJsonText(text)
										setFileName(file.name)
										toast.success(
											t('toasts.fileLoaded', { fileName: file.name }),
										)
									} catch (error) {
										toast.error(
											error instanceof Error
												? error.message
												: t('toasts.readFileFailed'),
										)
									}
								}}
							/>
							{fileName ? (
								<div className="font-mono text-[10px] text-muted-foreground">
									{t('inputs.fileName', { fileName })}
								</div>
							) : null}
						</div>

						<div className="space-y-2">
							<Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								{t('inputs.pasteLabel')}
							</Label>
							<Textarea
								value={jsonText}
								onChange={(e) => setJsonText(e.target.value)}
								placeholder={t('inputs.pastePlaceholder')}
								className="rounded-none font-mono text-xs h-[320px] min-h-[320px] max-h-[320px] resize-none"
							/>
						</div>

						{preview ? (
							<div className="border border-border bg-muted/20 p-4 font-mono text-xs space-y-1">
								<div>
									{t('preview.title')}: {preview.title}
								</div>
								<div>
									{t('preview.replies')}: {preview.replies}
								</div>
								<div>
									{t('preview.sourceUrl')}: {preview.sourceUrl ?? '-'}
								</div>
							</div>
						) : (
							<div className="text-xs text-muted-foreground font-mono">
								{t('preview.hint')}
							</div>
						)}

						<div className="flex items-center gap-3">
							<Button
								className="rounded-none font-mono text-xs uppercase"
								disabled={createMutation.isPending}
								onClick={() => {
									if (!jsonText.trim()) {
										toast.error(t('toasts.jsonEmpty'))
										return
									}
									createMutation.mutate({ jsonText })
								}}
							>
								{t('actions.create')}
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}

