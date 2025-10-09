'use client'

import * as React from 'react'
import { Plus, Globe, Settings, TestTube, Link } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { SSRSubscriptionsList } from '~/components/business/proxy/ssr-subscriptions-list'
import { AddSSRSubscriptionDialog } from '~/components/business/proxy/add-ssr-subscription-dialog'
import { ProxyList } from '~/components/business/proxy/proxy-list'

export default function ProxyPage() {
	const [activeTab, setActiveTab] = React.useState('subscriptions')
	const [isAddSubscriptionDialogOpen, setIsAddSubscriptionDialogOpen] = React.useState(false)

	return (
		<div className="container mx-auto py-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<h1 className="text-3xl font-bold flex items-center gap-2">
						<Globe className="h-8 w-8" />
						Proxy Manager
					</h1>
					<p className="text-muted-foreground">
						Manage SSR subscriptions and proxy servers
					</p>
				</div>
				<Button onClick={() => setIsAddSubscriptionDialogOpen(true)}>
					<Plus className="h-4 w-4 mr-2" />
					Add Subscription
				</Button>
			</div>

			{/* Stats Cards */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">SSR Subscriptions</CardTitle>
						<Link className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">0</div>
						<p className="text-xs text-muted-foreground">
							Total subscriptions
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Total Proxies</CardTitle>
						<Settings className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">0</div>
						<p className="text-xs text-muted-foreground">
							All proxies
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Active Proxies</CardTitle>
						<Badge variant="default" className="w-3 h-3 rounded-full p-0" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">0</div>
						<p className="text-xs text-muted-foreground">
							Currently active
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Tested</CardTitle>
						<TestTube className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">0</div>
						<p className="text-xs text-muted-foreground">
							Connection tested
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Main Content */}
			<Tabs value={activeTab} onValueChange={setActiveTab}>
				<TabsList>
					<TabsTrigger value="subscriptions">SSR Subscriptions</TabsTrigger>
					<TabsTrigger value="proxies">All Proxies</TabsTrigger>
				</TabsList>
				
				<TabsContent value="subscriptions" className="space-y-4">
					<SSRSubscriptionsList />
				</TabsContent>
				
				<TabsContent value="proxies" className="space-y-4">
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
