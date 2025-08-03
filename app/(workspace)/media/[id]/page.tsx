'use client'

import { useQuery } from '@tanstack/react-query'
import {
	ArrowLeft,
	Calendar,
	Download,
	Eye,
	FileText,
	Heart,
	MessageSquare,
	User,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Skeleton } from '~/components/ui/skeleton'
import { queryOrpc } from '~/lib/orpc/query-client'

export default function MediaDetailPage() {
	const params = useParams()
	const id = params.id as string

	const mediaQuery = useQuery(
		queryOrpc.media.byId.queryOptions({
			input: { id },
		}),
	)

	const { data: media, isLoading, isError } = mediaQuery

	return (
		<div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
			<div className="container mx-auto px-4 py-6 max-w-7xl">
				{/* Header */}
				<div className="mb-8">
					<Link href="/media">
						<Button
							variant="ghost"
							className="flex items-center gap-2 hover:bg-background/80"
						>
							<ArrowLeft className="w-4 h-4" />
							Back to Media
						</Button>
					</Link>
				</div>

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
					<div className="space-y-6">
						<div className="grid gap-6 lg:grid-cols-3">
							{/* Media Info Card */}
							<div className="lg:col-span-1">
								<Card className="overflow-hidden shadow-lg">
									{media.thumbnail && (
										<div className="relative">
											<Image
												src={media.thumbnail}
												alt={media.title}
												width={400}
												height={225}
												className="w-full h-64 object-cover"
												priority
											/>
											<div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
										</div>
									)}
									<CardHeader className="space-y-3">
										<CardTitle className="text-xl font-semibold leading-tight">
											{media.title}
										</CardTitle>
										{media.translatedTitle && (
											<CardTitle className="text-lg font-medium leading-tight text-muted-foreground">
												{media.translatedTitle}
											</CardTitle>
										)}
										<div className="flex items-center gap-2 text-muted-foreground">
											<User className="w-4 h-4" />
											<span className="text-sm">{media.author}</span>
										</div>
									</CardHeader>
									<CardContent className="space-y-4">
										<div className="flex flex-wrap gap-2">
											<Badge variant="secondary" className="capitalize">
												{media.source}
											</Badge>
											<Badge variant="outline">{media.quality}</Badge>
										</div>
									</CardContent>
								</Card>
							</div>

							{/* Details and Actions */}
							<div className="lg:col-span-2 space-y-6">
								{/* Media Details */}
								<Card className="shadow-sm">
									<CardHeader>
										<CardTitle className="flex items-center gap-2">
											<FileText className="w-5 h-5" />
											Media Details
										</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="grid gap-4 sm:grid-cols-2">
											<div className="space-y-1">
												<p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
													<Eye className="w-4 h-4" />
													Views
												</p>
												<p className="text-lg font-semibold">
													{media.viewCount?.toLocaleString() || 'N/A'}
												</p>
											</div>
											<div className="space-y-1">
												<p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
													<Heart className="w-4 h-4" />
													Likes
												</p>
												<p className="text-lg font-semibold">
													{media.likeCount?.toLocaleString() || 'N/A'}
												</p>
											</div>
											<div className="space-y-1">
												<p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
													<Download className="w-4 h-4" />
													Source
												</p>
												<p className="capitalize font-medium">{media.source}</p>
											</div>
											<div className="space-y-1">
												<p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
													<FileText className="w-4 h-4" />
													Quality
												</p>
												<p className="font-medium">{media.quality}</p>
											</div>
											<div className="space-y-1 sm:col-span-2">
												<p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
													<Calendar className="w-4 h-4" />
													Downloaded At
												</p>
												<p className="font-medium">
													{new Date(media.createdAt).toLocaleDateString(
														'en-US',
														{
															year: 'numeric',
															month: 'long',
															day: 'numeric',
															hour: '2-digit',
															minute: '2-digit',
														},
													)}
												</p>
											</div>
										</div>
									</CardContent>
								</Card>

								{/* Actions */}
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
