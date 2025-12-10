'use client'

import { useQuery } from '@tanstack/react-query'
import { Plus, Video } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { MediaCard } from '~/components/business/media/media-card'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader } from '~/components/ui/card'
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from '~/components/ui/pagination'
import { Skeleton } from '~/components/ui/skeleton'
import { type schema } from '~/lib/db'
import { queryOrpc } from '~/lib/orpc/query-client'
import { MEDIA_PAGE_SIZE } from '~/lib/pagination'

export function MediaListPage() {
	const [page, setPage] = useState(1)
	const t = useTranslations('Media')

	type PaginatedMedia = {
		items: (typeof schema.media.$inferSelect)[]
		total: number
		page: number
		limit: number
	}

	const mediaQuery = useQuery<PaginatedMedia, Error>(
		queryOrpc.media.list.queryOptions({
			input: { page, limit: MEDIA_PAGE_SIZE },
		}),
	)

	const total = mediaQuery.data?.total ?? 0
	const totalPages = Math.ceil(total / MEDIA_PAGE_SIZE)

	return (
		<div className="min-h-full space-y-8">
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
					<Link href="/media/download">
						<Button className="flex items-center gap-2 shadow-sm hover:shadow-md transition-all h-10 px-6">
							<Plus className="w-4 h-4" strokeWidth={1.5} />
							{t('downloadCta')}
						</Button>
					</Link>
				</div>
			</div>

			{/* Main Content */}
			<div className="px-6 pb-12">
				{/* Loading state */}
				{mediaQuery.isLoading && (
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-pulse">
						{Array.from({ length: MEDIA_PAGE_SIZE }).map((_, idx) => (
							<Card key={idx} className="overflow-hidden border-none shadow-none bg-secondary/30">
								<Skeleton className="h-48 w-full bg-secondary/50" />
								<CardHeader className="p-4 space-y-2">
									<Skeleton className="h-4 w-3/4 bg-secondary/50" />
									<Skeleton className="h-3 w-1/2 bg-secondary/50" />
								</CardHeader>
								<CardContent className="p-4 pt-0">
									<Skeleton className="h-3 w-1/3 bg-secondary/50" />
								</CardContent>
							</Card>
						))}
					</div>
				)}

				{/* Error state */}
				{mediaQuery.isError && (
					<Card className="glass border-destructive/20 bg-destructive/5">
						<CardContent className="p-12 text-center">
							<div className="mx-auto mb-6 h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
								<Video className="h-8 w-8 text-destructive" strokeWidth={1.5} />
							</div>
							<h3 className="mb-2 text-xl font-semibold text-destructive">
								{t('error.title')}
							</h3>
							<p className="text-muted-foreground font-light max-w-md mx-auto">
								{t('error.body')}
							</p>
							<Button
								variant="outline"
								className="mt-6 border-destructive/20 hover:bg-destructive/10"
								onClick={() => mediaQuery.refetch()}
							>
								{t('error.retry')}
							</Button>
						</CardContent>
					</Card>
				)}

				{/* Empty state (without CTA button) */}
				{mediaQuery.isSuccess && mediaQuery.data.items.length === 0 && (
					<Card className="glass border-dashed border-border/50">
						<CardContent className="p-20 text-center">
							<div className="mx-auto mb-6 h-20 w-20 rounded-3xl bg-secondary/50 flex items-center justify-center">
								<Video className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.5} />
							</div>
							<h3 className="mb-3 text-xl font-semibold text-foreground">
								{t('empty.title')}
							</h3>
							<p className="text-muted-foreground font-light max-w-sm mx-auto">
								{t('empty.body')}
							</p>
						</CardContent>
					</Card>
				)}

				{/* Media Grid */}
				{mediaQuery.isSuccess && mediaQuery.data.items.length > 0 && (
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
						{mediaQuery.data.items.map((media) => (
							<MediaCard key={media.id} media={media} />
						))}
					</div>
				)}

				{/* Pagination */}
				{mediaQuery.isSuccess && totalPages > 1 && (
					<div className="mt-16 flex justify-center">
						<Pagination className="glass inline-flex w-auto rounded-full px-4 py-2 shadow-sm">
							<PaginationContent>
								<PaginationItem>
									<PaginationPrevious
										href="#"
										onClick={(e) => {
											e.preventDefault()
											setPage((p) => Math.max(1, p - 1))
										}}
										className={
											page === 1 ? 'pointer-events-none opacity-50' : 'hover:bg-secondary/50'
										}
									/>
								</PaginationItem>
								{Array.from({ length: totalPages }).map((_, idx) => (
									<PaginationItem key={idx}>
										<PaginationLink
											href="#"
											isActive={idx + 1 === page}
											onClick={(e) => {
												e.preventDefault()
												setPage(idx + 1)
											}}
											className={idx + 1 === page ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-secondary/50'}
										>
											{idx + 1}
										</PaginationLink>
									</PaginationItem>
								))}
								<PaginationItem>
									<PaginationNext
										href="#"
										onClick={(e) => {
											e.preventDefault()
											setPage((p) => Math.min(totalPages, p + 1))
										}}
										className={
											page === totalPages
												? 'pointer-events-none opacity-50'
												: 'hover:bg-secondary/50'
										}
									/>
								</PaginationItem>
							</PaginationContent>
						</Pagination>
					</div>
				)}
			</div>
		</div>
	)
}
