'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Plus, Trash2, User, Video } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '~/components/ui/alert-dialog'
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
import { type schema } from '~/lib/db'
import { queryOrpc } from '~/lib/orpc/query-client'

const PAGE_SIZE = 12

export default function MediaPage() {
	const [page, setPage] = useState(1)
	const queryClient = useQueryClient()

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

	const deleteMediaMutation = useMutation({
		...queryOrpc.media.deleteById.mutationOptions(),
		onSuccess: () => {
			toast.success('Media deleted successfully.')
			queryClient.invalidateQueries({
				queryKey: queryOrpc.media.list.key(),
			})
		},
		onError: (error) => {
			toast.error(`Failed to delete media: ${error.message}`)
		},
	})

	const total = mediaQuery.data?.total ?? 0
	const totalPages = Math.ceil(total / PAGE_SIZE)

	return (
		<div className="min-h-full bg-background">
			{/* Header Section */}
			<div className="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
				<div className="container mx-auto px-4 py-6">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-1">
							<h1 className="text-3xl font-bold tracking-tight">
								Media Library
							</h1>
							<p className="text-muted-foreground">
								Manage and organize your video content
							</p>
						</div>
						<Link href="/media/download">
							<Button className="flex items-center gap-2 shadow-sm">
								<Plus className="w-4 h-4" />
								Download Media
							</Button>
						</Link>
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div className="container mx-auto px-4 py-8">
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

				{/* Empty state */}
				{mediaQuery.isSuccess && mediaQuery.data.items.length === 0 && (
					<Card className="border-dashed">
						<CardContent className="p-12 text-center">
							<div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
								<Video className="h-8 w-8 text-muted-foreground" />
							</div>
							<h3 className="mb-2 text-lg font-semibold">No media files yet</h3>
							<p className="mb-6 text-muted-foreground max-w-sm mx-auto">
								Get started by downloading your first video to begin building
								your media library.
							</p>
							<Link href="/media/download">
								<Button className="flex items-center gap-2">
									<Plus className="w-4 h-4" />
									Download Your First Video
								</Button>
							</Link>
						</CardContent>
					</Card>
				)}

				{/* Media Grid */}
				{mediaQuery.isSuccess && mediaQuery.data.items.length > 0 && (
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{mediaQuery.data.items.map((media) => (
							<Card
								key={media.id}
								className="group overflow-hidden transition-all duration-200 hover:shadow-lg hover:scale-[1.02] border-border/50"
							>
								<Link href={`/media/${media.id}`} className="block">
									<div className="relative aspect-video overflow-hidden bg-muted">
										{media.thumbnail ? (
											<Image
												src={media.thumbnail}
												alt={media.title}
												fill
												className="object-cover transition-transform duration-200 group-hover:scale-105"
											/>
										) : (
											<div className="flex h-full items-center justify-center">
												<Video className="h-12 w-12 text-muted-foreground" />
											</div>
										)}
									</div>
									<CardHeader className="p-4 pb-2">
										<CardTitle className="text-base font-semibold line-clamp-2 leading-tight">
											{media.title}
										</CardTitle>
										{media.translatedTitle && (
											<CardTitle className="text-sm font-medium line-clamp-2 leading-tight text-muted-foreground">
												{media.translatedTitle}
											</CardTitle>
										)}
									</CardHeader>
									<CardContent className="p-4 pt-0 space-y-2">
										<div className="flex items-center gap-2 text-sm text-muted-foreground">
											<User className="h-3 w-3" />
											<span className="line-clamp-1">{media.author}</span>
										</div>
										<div className="flex items-center gap-2 text-sm text-muted-foreground">
											<Eye className="h-3 w-3" />
											<span>
												{(media.viewCount ?? 0).toLocaleString()} views
											</span>
										</div>
									</CardContent>
								</Link>
								<div className="p-4 pt-0">
									<AlertDialog>
										<AlertDialogTrigger asChild>
											<Button
												variant="outline"
												size="sm"
												className="w-full flex items-center gap-2 text-destructive hover:text-destructive hover:bg-destructive/5"
											>
												<Trash2 className="w-3 h-3" />
												Delete
											</Button>
										</AlertDialogTrigger>
										<AlertDialogContent>
											<AlertDialogHeader>
												<AlertDialogTitle>Delete Media</AlertDialogTitle>
												<AlertDialogDescription>
													This action cannot be undone. This will permanently
													delete the media file and all associated data.
												</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel>Cancel</AlertDialogCancel>
												<AlertDialogAction
													onClick={() =>
														deleteMediaMutation.mutate({ id: media.id })
													}
													className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
												>
													Delete
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								</div>
							</Card>
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
