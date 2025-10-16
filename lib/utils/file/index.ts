// File utilities module (no re-exports)
// Import client-safe helpers directly from './client-safe' where needed.

// Server-only function - not exported to prevent client-side bundling
export async function fileExistsServer(path: string): Promise<boolean> {
	// Dynamic import to prevent bundling in client
	if (typeof window !== 'undefined') {
		throw new Error('fileExistsServer can only be used on the server side')
	}

	try {
		// Dynamic import to prevent Next.js from bundling fs module
		const { promises: fs } = await eval('import("fs")')
		await fs.access(path)
		return true
	} catch {
		return false
	}
}
