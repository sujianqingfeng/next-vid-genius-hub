'use client'

import {
	Calendar,
	ChevronRight,
	Download,
	Eye,
	FileText,
	Heart,
	User,
} from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { formatNumber } from '~/lib/utils/format/format'

interface MediaInfoCardProps {
	media: {
		id: string
		title: string
		translatedTitle?: string | null
		author: string | null
		thumbnail?: string | null
		source: string
		quality: string
		viewCount?: number | null
		likeCount?: number | null
		createdAt: string | Date
	}
}

export function MediaInfoCard({ media }: MediaInfoCardProps) {
	const [isDetailsOpen, setIsDetailsOpen] = useState(false)
	const [thumbnailError, setThumbnailError] = useState(false)

	return (
		<div className="lg:col-span-1 relative group">
			<Card className="overflow-hidden shadow-sm pt-0">
				{media.thumbnail && !thumbnailError && (
					<div className="relative">
						<Image
							src={media.thumbnail}
							alt={media.title}
							width={400}
							height={225}
							className="w-full h-64 object-cover"
							priority
							unoptimized
							onError={() => setThumbnailError(true)}
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
					{media.author && (
						<div className="flex items-center gap-2 text-muted-foreground">
							<User className="w-4 h-4" />
							<span className="text-sm">{media.author}</span>
						</div>
					)}
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

			{/* Toggle Details Button - Positioned on the right */}
			<Button
				variant="ghost"
				size="sm"
				onMouseEnter={() => setIsDetailsOpen(true)}
				onMouseLeave={() => setIsDetailsOpen(false)}
				className="absolute top-3 right-3 w-8 h-8 p-0 rounded-md bg-black/20 hover:bg-black/30 transition-all duration-200"
				title="Hover to show details"
			>
				<ChevronRight className="w-3 h-3 text-white" />
			</Button>

			{/* Details Drawer */}
			<div
				className={`absolute top-0 left-full ml-4 w-80 bg-background border rounded-lg shadow-xl transition-all duration-300 ease-in-out z-10 lg:block ${
					isDetailsOpen
						? 'opacity-100 translate-x-0'
						: 'opacity-0 -translate-x-4 pointer-events-none'
				} hidden`}
				onMouseEnter={() => setIsDetailsOpen(true)}
				onMouseLeave={() => setIsDetailsOpen(false)}
			>
				<Card className="border-0 shadow-none">
					<CardHeader className="pb-3">
						<CardTitle className="flex items-center gap-2 text-lg">
							<FileText className="w-5 h-5" />
							Media Details
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid gap-4">
							<div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
								<div className="flex items-center gap-2 text-muted-foreground">
									<Eye className="w-4 h-4" />
									<span className="text-sm font-medium">Views</span>
								</div>
								<span className="font-semibold">
									{media.viewCount ? formatNumber(media.viewCount) : 'N/A'}
								</span>
							</div>

							<div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
								<div className="flex items-center gap-2 text-muted-foreground">
									<Heart className="w-4 h-4" />
									<span className="text-sm font-medium">Likes</span>
								</div>
								<span className="font-semibold">
									{media.likeCount ? formatNumber(media.likeCount) : 'N/A'}
								</span>
							</div>

							<div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
								<div className="flex items-center gap-2 text-muted-foreground">
									<Download className="w-4 h-4" />
									<span className="text-sm font-medium">Source</span>
								</div>
								<span className="capitalize font-medium">{media.source}</span>
							</div>

							<div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
								<div className="flex items-center gap-2 text-muted-foreground">
									<FileText className="w-4 h-4" />
									<span className="text-sm font-medium">Quality</span>
								</div>
								<span className="font-medium">{media.quality}</span>
							</div>

							<div className="pt-3 border-t">
								<div className="flex items-center gap-2 text-muted-foreground mb-2">
									<Calendar className="w-4 h-4" />
									<span className="text-sm font-medium">Downloaded At</span>
								</div>
								<p className="text-sm font-medium p-3 bg-muted/30 rounded-lg">
									{new Date(media.createdAt).toLocaleDateString('en-US', {
										year: 'numeric',
										month: 'long',
										day: 'numeric',
										hour: '2-digit',
										minute: '2-digit',
									})}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
