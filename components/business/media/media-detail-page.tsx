'use client'

import { useQuery } from '@tanstack/react-query'
import { Download, FileText, MessageSquare } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { MediaInfoCard, MobileDetailsCard } from '~/components/business/media'
import { PageHeader } from '~/components/layout'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'
import { queryOrpc } from '~/lib/orpc/query-client'

export function MediaDetailPageClient({ id }: { id: string }) {
	const [isDetailsOpen, setIsDetailsOpen] = useState(false)

	const mediaQuery = useQuery(
		queryOrpc.media.byId.queryOptions({
			input: { id },
		}),
	)

	const { data: media, isLoading, isError } = mediaQuery

	return (
		<div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
			<div className="px-4 py-6">
				{/* Header */}
				<PageHeader backHref="/media" backText="Back to Media" />

				{/* Loading State */}
				{isLoading && (
					<div className="space-y-6">
						<div className="grid gap-6 lg:grid-cols-3">
							{/* Thumbnail Skeleton */}
							<div className="lg:col-span-1">
								<Card className="overflow-hidden">
									<Skeleton className="h-64 w-full" />
									<CardHeader className="space-y-3">
										<Skeleton className="h-6 w-3/4" />
										<Skeleton className="h-4 w-1/2" />
									</CardHeader>
								</Card>
							</div>

							{/* Content Skeleton */}
							<div className="lg:col-span-2 space-y-6">
								<Card>
									<CardHeader>
										<Skeleton className="h-6 w-24" />
									</CardHeader>
									<CardContent>
										<div className="grid gap-4 sm:grid-cols-2">
											{Array.from({ length: 6 }).map((_, i) => (
												<div key={i} className="space-y-2">
													<Skeleton className="h-4 w-20" />
													<Skeleton className="h-5 w-32" />
												</div>
											))}
										</div>
									</CardContent>
								</Card>

								<Card>
									<CardHeader>
										<Skeleton className="h-6 w-20" />
									</CardHeader>
									<CardContent>
										<div className="flex gap-3">
											<Skeleton className="h-10 w-32" />
											<Skeleton className="h-10 w-28" />
										</div>
									</CardContent>
								</Card>
							</div>
						</div>
					</div>
				)}

				{/* Error State */}
				{isError && (
					<Card className="border-destructive/50 bg-destructive/5">
						<CardContent className="pt-6">
							<div className="flex items-center gap-3 text-destructive">
								<div className="w-2 h-2 bg-destructive rounded-full" />
								<p className="text-sm font-medium">
									Failed to load media details
								</p>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Media Content */}
				{media && (
					<div className="relative">
						<div className="grid gap-6 lg:grid-cols-3">
							{/* Media Info Card with Drawer */}
							<MediaInfoCard media={media} />

							{/* Actions */}
							<div className="lg:col-span-2 space-y-6">
								{/* Mobile Details Card */}
								<div className="lg:hidden">
									<MobileDetailsCard
										media={media}
										isOpen={isDetailsOpen}
										onClose={() => setIsDetailsOpen(false)}
									/>
								</div>

								{/* Actions Card */}
								<Card className="shadow-sm">
									<CardHeader>
										<CardTitle>Actions</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="flex flex-wrap gap-3">
											<Link href={`/media/${id}/subtitles`}>
												<Button className="flex items-center gap-2 shadow-sm">
													<FileText className="w-4 h-4" />
													Generate Subtitles
												</Button>
											</Link>
											<Link href={`/media/${id}/comments`}>
												<Button
													variant="outline"
													className="flex items-center gap-2"
												>
													<MessageSquare className="w-4 h-4" />
													View Comments
												</Button>
											</Link>
											<Link href={`/media/download?id=${id}`}>
												<Button
													variant="secondary"
													className="flex items-center gap-2"
												>
													<Download className="w-4 h-4" />
													Download
												</Button>
											</Link>
										</div>
									</CardContent>
								</Card>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
