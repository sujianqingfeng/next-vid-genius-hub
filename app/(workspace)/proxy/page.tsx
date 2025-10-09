'use client'

import * as React from 'react'
import { Plus, Globe } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { SSRSubscriptionsList } from '~/components/business/proxy/ssr-subscriptions-list'
import { AddSSRSubscriptionDialog } from '~/components/business/proxy/add-ssr-subscription-dialog'
import { ProxyList } from '~/components/business/proxy/proxy-list'

export default function ProxyPage() {
	const [isAddSubscriptionDialogOpen, setIsAddSubscriptionDialogOpen] = React.useState(false)

	return (
		<div className="px-4 py-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Globe className="h-6 w-6" />
					<h1 className="text-2xl font-semibold">Proxy Manager</h1>
				</div>
				<Button onClick={() => setIsAddSubscriptionDialogOpen(true)}>
					<Plus className="h-4 w-4 mr-2" />
					Add Subscription
				</Button>
			</div>

			{/* Main Content */}
			<Tabs defaultValue="subscriptions">
				<TabsList>
					<TabsTrigger value="subscriptions">SSR Subscriptions</TabsTrigger>
					<TabsTrigger value="proxies">All Proxies</TabsTrigger>
				</TabsList>
				
				<TabsContent value="subscriptions" className="mt-4">
					<SSRSubscriptionsList />
				</TabsContent>
				
				<TabsContent value="proxies" className="mt-4">
					<ProxyList />
				</TabsContent>
			</Tabs>

			{/* Dialogs */}
			<AddSSRSubscriptionDialog 
				open={isAddSubscriptionDialogOpen}
				onOpenChange={setIsAddSubscriptionDialogOpen}
			/>
		</div>
	)
}
