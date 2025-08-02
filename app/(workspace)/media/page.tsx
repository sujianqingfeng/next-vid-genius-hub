'use client'

import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '~/components/ui/button'

export default function DownloadsPage() {
	const router = useRouter()

	const handleNewDownload = () => {
		router.push('/media/download')
	}

	return (
		<div className="container mx-auto py-8">
			<div className="flex justify-between items-center mb-6">
				<h1 className="text-3xl font-bold">Downloads</h1>
				<Button onClick={handleNewDownload} className="flex items-center gap-2">
					<Plus className="w-4 h-4" />
					New Download
				</Button>
			</div>
			<div className="bg-white rounded-lg shadow-md p-6">
				<p className="text-gray-600">No download tasks yet</p>
			</div>
		</div>
	)
}
