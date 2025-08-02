'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
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
		<div className="container mx-auto py-8">
			<div className="mb-6">
				<Link href="/media">
					<Button variant="outline" className="flex items-center gap-2">
						<ArrowLeft className="w-4 h-4" />
						Back to Media
					</Button>
				</Link>
			</div>

			{isLoading && (
				<Card>
					<Skeleton className="h-60 w-full rounded-t-lg" />
					<CardHeader>
						<Skeleton className="h-8 w-3/4" />
					</CardHeader>
					<CardContent className="space-y-4">
						<Skeleton className="h-4 w-1/2" />
						<Skeleton className="h-4 w-1/4" />
						<Skeleton className="h-4 w-1/4" />
					</CardContent>
				</Card>
			)}

			{isError && (
				<div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
					Failed to load media details.
				</div>
			)}

			{media && (
				<div className="grid gap-8 md:grid-cols-3">
					<div className="md:col-span-1">
						<Card>
							{media.thumbnail && (
								<Image
									src={media.thumbnail}
									alt={media.title}
									width={400}
									height={225}
									className="w-full h-auto object-cover rounded-t-lg"
								/>
							)}
							<CardHeader>
								<CardTitle className="text-xl">{media.title}</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									by {media.author}
								</p>
							</CardContent>
						</Card>
					</div>
					<div className="md:col-span-2">
						<Card>
							<CardHeader>
								<CardTitle>Details</CardTitle>
							</CardHeader>
							<CardContent className="grid gap-4 sm:grid-cols-2">
								<div className="grid gap-1">
									<p className="text-sm font-medium text-muted-foreground">
										Source
									</p>
									<p className="capitalize">{media.source}</p>
								</div>
								<div className="grid gap-1">
									<p className="text-sm font-medium text-muted-foreground">
										Quality
									</p>
									<p>{media.quality}</p>
								</div>
								<div className="grid gap-1">
									<p className="text-sm font-medium text-muted-foreground">
										Views
									</p>
									<p>{media.viewCount?.toLocaleString()}</p>
								</div>
								<div className="grid gap-1">
									<p className="text-sm font-medium text-muted-foreground">
										Likes
									</p>
									<p>{media.likeCount?.toLocaleString()}</p>
								</div>
								<div className="grid gap-1 sm:col-span-2">
									<p className="text-sm font-medium text-muted-foreground">
										Downloaded At
									</p>
									<p>{new Date(media.createdAt).toLocaleString()}</p>
								</div>
							</CardContent>
						</Card>
					</div>
				</div>
			)}
		</div>
	)
}
