'use client'

import { useQuery } from '@tanstack/react-query'
import { Plus, Video } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { MediaCard } from '~/components/business/media'
import { PageHeader } from '~/components/layout'
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

const PAGE_SIZE = 12

export function MediaListPage() {
	const [page, setPage] = useState(1)

	type PaginatedMedia = {
		items: (typeof schema.media.$inferSelect)[]
		total: number
		page: number
		limit: number
	}

	const mediaQuery = useQuery<PaginatedMedia, Error>(
		queryOrpc.media.list.queryOptions({
			input: { page, limit: PAGE_SIZE },
		}),
	)

	const total = mediaQuery.data?.total ?? 0
	const totalPages = Math.ceil(total / PAGE_SIZE)

	return (
		<div className="min-h-full bg-background">
			<PageHeader
				backHref="/"
				showBackButton={false}
				title="Media Library"
				withBackground
				rightContent={
					<Link href="/media/download">
						<Button className="flex items-center gap-2 shadow-sm">
							<Plus className="w-4 h-4" />
							Download Media
						</Button>
					</Link>
				}
			/>

			{/* Main Content */}
			<div className="px-4 py-8">
				{/* Loading state */}
				{mediaQuery.isLoading && (
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{Array.from({ length: PAGE_SIZE }).map((_, idx) => (
							<Card key={idx} className="overflow-hidden">
								<Skeleton className="h-48 w-full" />
								<CardHeader className="p-4">
									<Skeleton className="h-4 w-3/4" />
									<Skeleton className="h-3 w-1/2" />
								</CardHeader>
								<CardContent className="p-4 pt-0">
									<Skeleton className="h-3 w-1/3" />
								</CardContent>
							</Card>
						))}
					</div>
				)}

				{/* Error state */}
				{mediaQuery.isError && (
					<Card className="border-destructive/50 bg-destructive/5">
						<CardContent className="p-6 text-center">
							<div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
								<Video className="h-6 w-6 text-destructive" />
							</div>
							<h3 className="mb-2 text-lg font-semibold text-destructive">
								Failed to load media
							</h3>
							<p className="text-muted-foreground">
								There was an error loading your media library. Please try again.
							</p>
							<Button
								variant="outline"
								className="mt-4"
								onClick={() => mediaQuery.refetch()}
							>
								Try Again
							</Button>
						</CardContent>
					</Card>
				)}

				{/* Empty state (without CTA button) */}
				{mediaQuery.isSuccess && mediaQuery.data.items.length === 0 && (
					<Card className="border-dashed">
						<CardContent className="p-12 text-center">
							<div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
								<Video className="h-8 w-8 text-muted-foreground" />
							</div>
							<h3 className="mb-2 text-lg font-semibold">No media files yet</h3>
							<p className="text-muted-foreground max-w-sm mx-auto">
								Get started by downloading your first video to begin building your media library.
							</p>
						</CardContent>
					</Card>
				)}

				{/* Media Grid */}
				{mediaQuery.isSuccess && mediaQuery.data.items.length > 0 && (
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{mediaQuery.data.items.map((media) => (
							<MediaCard key={media.id} media={media} />
						))}
					</div>
				)}

				{/* Pagination */}
				{mediaQuery.isSuccess && totalPages > 1 && (
					<div className="mt-12 flex justify-center">
						<Pagination>
							<PaginationContent>
								<PaginationItem>
									<PaginationPrevious
										href="#"
										onClick={(e) => {
											e.preventDefault()
											setPage((p) => Math.max(1, p - 1))
										}}
										className={
											page === 1 ? 'pointer-events-none opacity-50' : ''
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
												: ''
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
