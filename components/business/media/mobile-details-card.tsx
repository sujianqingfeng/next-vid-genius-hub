'use client'

import {
	Calendar,
	ChevronLeft,
	Download,
	Eye,
	FileText,
	Heart,
} from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { formatNumber } from '~/lib/utils/format/format'

interface MobileDetailsCardProps {
	media: {
		viewCount?: number | null
		likeCount?: number | null
		source: string
		quality: string
		createdAt: string | Date
	}
	isOpen: boolean
	onClose: () => void
}

export function MobileDetailsCard({
	media,
	isOpen,
	onClose,
}: MobileDetailsCardProps) {
	if (!isOpen) return null

	return (
		<Card className="shadow-sm mb-6 relative">
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-lg">
					<FileText className="w-5 h-5" />
					Media Details
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-1 p-3 bg-muted/30 rounded-lg">
						<p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
							<Eye className="w-4 h-4" />
							Views
						</p>
						<p className="text-lg font-semibold">
							{media.viewCount ? formatNumber(media.viewCount) : 'N/A'}
						</p>
					</div>
					<div className="space-y-1 p-3 bg-muted/30 rounded-lg">
						<p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
							<Heart className="w-4 h-4" />
							Likes
						</p>
						<p className="text-lg font-semibold">
							{media.likeCount ? formatNumber(media.likeCount) : 'N/A'}
						</p>
					</div>
					<div className="space-y-1 p-3 bg-muted/30 rounded-lg">
						<p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
							<Download className="w-4 h-4" />
							Source
						</p>
						<p className="capitalize font-medium">{media.source}</p>
					</div>
					<div className="space-y-1 p-3 bg-muted/30 rounded-lg">
						<p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
							<FileText className="w-4 h-4" />
							Quality
						</p>
						<p className="font-medium">{media.quality}</p>
					</div>
					<div className="space-y-1 sm:col-span-2 p-3 bg-muted/30 rounded-lg">
						<p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
							<Calendar className="w-4 h-4" />
							Downloaded At
						</p>
						<p className="font-medium">
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

			{/* Mobile Toggle Button */}
			<Button
				variant="outline"
				size="sm"
				onClick={onClose}
				className="absolute top-4 right-4 w-8 h-8 p-0 rounded-full bg-background/80 backdrop-blur-sm border-2 hover:bg-background/90 transition-all duration-200 shadow-lg"
				title="Close Details"
			>
				<ChevronLeft className="w-3 h-3" />
			</Button>
		</Card>
	)
}
