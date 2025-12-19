'use client'

import * as React from 'react'
import { Link } from 'lucide-react'
import { useTranslations } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { toast } from 'sonner'
import { queryOrpc } from '~/lib/orpc/query-client'
import { useProxySubscriptionMutation } from '~/lib/proxy/useProxySubscriptionMutation'

interface AddSSRSubscriptionDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function AddSSRSubscriptionDialog({ open, onOpenChange }: AddSSRSubscriptionDialogProps) {
	const [name, setName] = React.useState('')
	const [url, setUrl] = React.useState('')
	const t = useTranslations('Proxy.subscription.dialog')
	
	const createSubscriptionMutation = useProxySubscriptionMutation(
		queryOrpc.proxy.createSSRSubscription.mutationOptions({
			onSuccess: () => {
				handleReset()
				onOpenChange(false)
			},
		}),
		{
			successToast: t('success'),
			errorToast: ({ error }) => t('error', { message: error.message }),
		},
	)

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		
		if (!name.trim()) {
			toast.error(t('nameRequired'))
			return
		}

		if (!url.trim()) {
			toast.error(t('urlRequired'))
			return
		}

		if (!url.trim().startsWith('http')) {
			toast.error(t('urlInvalid'))
			return
		}

		createSubscriptionMutation.mutate({
			name: name.trim(),
			url: url.trim(),
		})
	}

	const handleReset = () => {
		setName('')
		setUrl('')
	}

	const handleClose = () => {
		if (!createSubscriptionMutation.isPending) {
			handleReset()
			onOpenChange(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Link className="h-5 w-5" />
						{t('title')}
					</DialogTitle>
					<DialogDescription>
						{t('desc')}
					</DialogDescription>
				</DialogHeader>
				
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="name">{t('nameLabel')}</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g., US Servers, Premium Proxies"
							required
							disabled={createSubscriptionMutation.isPending}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="url">{t('urlLabel')}</Label>
						<Input
							id="url"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							placeholder="https://example.com/subscription"
							type="url"
							required
							disabled={createSubscriptionMutation.isPending}
						/>
						<p className="text-xs text-muted-foreground">
							{t('urlHint')}
						</p>
					</div>

					<div className="flex justify-end gap-2 pt-4">
						<Button
							type="button"
							variant="outline"
							onClick={handleClose}
							disabled={createSubscriptionMutation.isPending}
						>
							{t('cancel')}
						</Button>
						<Button
							type="submit"
							disabled={createSubscriptionMutation.isPending || !name.trim() || !url.trim()}
						>
							{createSubscriptionMutation.isPending ? t('creating') : t('create')}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	)
}
