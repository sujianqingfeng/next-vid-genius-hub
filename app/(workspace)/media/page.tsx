'use client'

import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from '~/components/ui/pagination'
import { Skeleton } from '~/components/ui/skeleton'
import { queryOrpc } from '~/lib/orpc/query-client'

const PAGE_SIZE = 9

export default function MediaPage() {
	const [page, setPage] = useState(1)

	type PaginatedMedia = {
		items: any[]
		total: number
		page: number
		limit: number
	}

	const mediaQuery = useQuery<PaginatedMedia, Error>(
		queryOrpc.media.queryOptions({
			input: { page, limit: PAGE_SIZE },
		}),
	)

	const total = mediaQuery.data?.total ?? 0
	const totalPages = Math.ceil(total / PAGE_SIZE)

	return (
		<div className="container mx-auto py-8">
			<div className="flex justify-between items-center mb-6">
				<h1 className="text-3xl font-bold">Media Library</h1>
				<Link href="/media/download">
					<Button className="flex items-center gap-2">
						<Plus className="w-4 h-4" />
						Download Media
					</Button>
				</Link>
			</div>

			{/* Loading state */}
			{mediaQuery.isLoading && (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{Array.from({ length: PAGE_SIZE }).map((_, idx) => (
						<Skeleton key={idx} className="h-40 w-full rounded-lg" />
					))}
				</div>
			)}

			{/* Error state */}
			{mediaQuery.isError && (
				<div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
					Failed to load media list
				</div>
			)}

			{/* Empty state */}
			{mediaQuery.isSuccess && mediaQuery.data.items.length === 0 && (
				<div className="rounded-lg shadow-md p-6 bg-card">
					<p className="text-muted-foreground">
						No media files in your library yet
					</p>
				</div>
			)}

			{/* List */}
			{mediaQuery.isSuccess && mediaQuery.data.items.length > 0 && (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{mediaQuery.data.items.map((media) => (
						<Card key={media.id} className="overflow-hidden">
							{media.thumbnail && (
								<Image
									src={media.thumbnail}
									alt={media.title}
									width={400}
									height={225}
									className="w-full h-40 object-cover"
								/>
							)}
							<CardHeader>
								<CardTitle className="text-lg line-clamp-2">
									{media.title}
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground mb-2">
									{media.author}
								</p>
								<p className="text-sm text-muted-foreground">
									Views: {media.viewCount}
								</p>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			{/* Pagination */}
			{mediaQuery.isSuccess && totalPages > 1 && (
				<Pagination className="mt-8">
					<PaginationContent>
						<PaginationItem>
							<PaginationPrevious
								href="#"
								onClick={(e) => {
									e.preventDefault()
									setPage((p) => Math.max(1, p - 1))
								}}
								className={page === 1 ? 'pointer-events-none opacity-50' : ''}
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
									page === totalPages ? 'pointer-events-none opacity-50' : ''
								}
							/>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			)}
		</div>
	)
}
