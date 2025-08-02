export default function NewDownloadPage() {
	return (
		<div className="container mx-auto py-8">
			<h1 className="text-3xl font-bold mb-6">New Download</h1>
			<div className="bg-white rounded-lg shadow-md p-6">
				<p className="text-gray-600 mb-4">Add a new download task here</p>
				<div className="space-y-4">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-2">
							Download URL
						</label>
						<input
							type="url"
							placeholder="Enter download URL"
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<button className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors">
						Start Download
					</button>
				</div>
			</div>
		</div>
	)
}
