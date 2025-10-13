'use client'

import * as React from 'react'
import { Plus, Globe, Shield, Server } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { SSRSubscriptionsList } from '~/components/business/proxy/ssr-subscriptions-list'
import { AddSSRSubscriptionDialog } from '~/components/business/proxy/add-ssr-subscription-dialog'
import { ProxyList } from '~/components/business/proxy/proxy-list'

export default function ProxyPage() {
	const [isAddSubscriptionDialogOpen, setIsAddSubscriptionDialogOpen] = React.useState(false)

	return (
		<div className="h-full bg-background">
			{/* Header */}
			<div className="flex items-center justify-between px-6 py-4 border-b">
				<div className="flex items-center gap-3">
					<Globe className="h-5 w-5 text-muted-foreground" />
					<h1 className="text-xl font-semibold">Proxy Manager</h1>
				</div>
				<Button 
					onClick={() => setIsAddSubscriptionDialogOpen(true)}
					variant="outline"
					size="sm"
					className="gap-2"
				>
					<Plus className="h-4 w-4" />
					Add
				</Button>
			</div>

			{/* Main Content */}
			<div className="p-4">
				<Tabs defaultValue="subscriptions" className="space-y-4">
					<TabsList className="grid w-full max-w-sm grid-cols-2">
						<TabsTrigger value="subscriptions" className="gap-2">
							<Shield className="h-4 w-4" />
							Subscriptions
						</TabsTrigger>
						<TabsTrigger value="proxies" className="gap-2">
							<Server className="h-4 w-4" />
							Proxies
						</TabsTrigger>
					</TabsList>
					
					<TabsContent value="subscriptions">
						<SSRSubscriptionsList />
					</TabsContent>
					
					<TabsContent value="proxies">
						<ProxyList />
					</TabsContent>
				</Tabs>
			</div>

			{/* Dialogs */}
			<AddSSRSubscriptionDialog 
				open={isAddSubscriptionDialogOpen}
				onOpenChange={setIsAddSubscriptionDialogOpen}
			/>
		</div>
	)
}
