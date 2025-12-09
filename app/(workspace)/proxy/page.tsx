'use client'

import * as React from 'react'
import { Plus, Shield, Server } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '~/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { SSRSubscriptionsList } from '~/components/business/proxy/ssr-subscriptions-list'
import { AddSSRSubscriptionDialog } from '~/components/business/proxy/add-ssr-subscription-dialog'
import { ProxyList } from '~/components/business/proxy/proxy-list'

export default function ProxyPage() {
	const t = useTranslations('Proxy.page')
	const [isAddSubscriptionDialogOpen, setIsAddSubscriptionDialogOpen] = React.useState(false)

	return (
		<div className="min-h-full space-y-8">
			{/* Header */}
			<div className="px-6 pt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
				<div className="flex items-end justify-between">
					<div className="space-y-2">
						<h1 className="text-4xl font-bold tracking-tight text-foreground">
							{t('title')}
						</h1>
						<p className="text-lg text-muted-foreground font-light">
							{t('subtitle')}
						</p>
					</div>
					<Button 
						onClick={() => setIsAddSubscriptionDialogOpen(true)}
						className="flex items-center gap-2 shadow-sm hover:shadow-md transition-all h-10 px-6"
					>
						<Plus className="h-4 w-4" strokeWidth={1.5} />
						{t('addSubscription')}
					</Button>
				</div>
			</div>

			{/* Main Content */}
			<div className="px-6 pb-12">
				<Tabs defaultValue="subscriptions" className="space-y-8">
					<TabsList className="glass inline-flex h-12 items-center justify-center rounded-full bg-secondary/30 p-1 text-muted-foreground shadow-sm">
						<TabsTrigger 
							value="subscriptions" 
							className="rounded-full px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
						>
							<div className="flex items-center gap-2">
								<Shield className="h-4 w-4" strokeWidth={1.5} />
								{t('tabs.subscriptions')}
							</div>
						</TabsTrigger>
						<TabsTrigger 
							value="proxies" 
							className="rounded-full px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
						>
							<div className="flex items-center gap-2">
								<Server className="h-4 w-4" strokeWidth={1.5} />
								{t('tabs.proxies')}
							</div>
						</TabsTrigger>
					</TabsList>
					
					<TabsContent value="subscriptions" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
						<SSRSubscriptionsList />
					</TabsContent>
					
					<TabsContent value="proxies" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
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
