'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'lucide-react'
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

interface AddSSRSubscriptionDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function AddSSRSubscriptionDialog({ open, onOpenChange }: AddSSRSubscriptionDialogProps) {
	const [name, setName] = React.useState('')
	const [url, setUrl] = React.useState('')
	
	const queryClient = useQueryClient()
	
	const createSubscriptionMutation = useMutation({
		...queryOrpc.proxy.createSSRSubscription.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryOrpc.proxy.getSSRSubscriptions.key(),
			})
			toast.success('SSR subscription created successfully')
			handleReset()
			onOpenChange(false)
		},
		onError: (error) => {
			toast.error(`Failed to create SSR subscription: ${error.message}`)
		},
	})

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		
		if (!name.trim()) {
			toast.error('Subscription name is required')
			return
		}

		if (!url.trim()) {
			toast.error('Subscription URL is required')
			return
		}

		if (!url.trim().startsWith('http')) {
			toast.error('Please enter a valid URL (must start with http:// or https://)')
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
						Add SSR Subscription
					</DialogTitle>
					<DialogDescription>
						Add a new SSR subscription URL to automatically import proxy servers
					</DialogDescription>
				</DialogHeader>
				
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="name">Subscription Name *</Label>
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
						<Label htmlFor="url">Subscription URL *</Label>
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
							Enter the SSR subscription URL that returns proxy configurations
						</p>
					</div>

					<div className="flex justify-end gap-2 pt-4">
						<Button
							type="button"
							variant="outline"
							onClick={handleClose}
							disabled={createSubscriptionMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={createSubscriptionMutation.isPending || !name.trim() || !url.trim()}
						>
							{createSubscriptionMutation.isPending ? 'Creating...' : 'Create Subscription'}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	)
}
