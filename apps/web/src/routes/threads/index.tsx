import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { queryOrpc } from '~/lib/orpc/client'

export const Route = createFileRoute('/threads/')({
	component: ThreadsIndexRoute,
})

function ThreadsIndexRoute() {
	const threadsQuery = useQuery(queryOrpc.thread.list.queryOptions())
	const items = threadsQuery.data?.items ?? []

	return (
		<div className="min-h-screen bg-background font-sans text-foreground">
			<div className="border-b border-border bg-card">
				<div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
					<div className="flex items-center justify-between gap-4">
						<div>
							<div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
								Thread_Rendering_System
							</div>
							<h1 className="font-mono text-xl font-bold uppercase tracking-tight">
								Threads
							</h1>
						</div>
						<Button asChild className="rounded-none font-mono text-xs uppercase">
							<Link to="/threads/new">
								<Plus className="h-4 w-4" />
								New
							</Link>
						</Button>
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
				<div className="grid grid-cols-1 gap-4">
					{items.map((t) => (
						<Card key={t.id} className="rounded-none">
							<CardHeader>
								<CardTitle className="font-mono text-sm uppercase tracking-widest">
									<Link to="/threads/$id" params={{ id: t.id }}>
										{t.title}
									</Link>
								</CardTitle>
							</CardHeader>
							<CardContent className="text-xs text-muted-foreground font-mono">
								<div className="flex flex-wrap gap-3">
									<span>source={t.source}</span>
									{t.sourceUrl ? <span>url={t.sourceUrl}</span> : null}
								</div>
							</CardContent>
						</Card>
					))}

					{items.length === 0 ? (
						<Card className="rounded-none border-dashed">
							<CardContent className="py-10 text-center text-sm text-muted-foreground">
								No threads yet. Create one from an X thread JSON.
							</CardContent>
						</Card>
					) : null}
				</div>
			</div>
		</div>
	)
}

