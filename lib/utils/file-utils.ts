import { promises as fs } from 'fs'

/**
 * Check if a file or directory exists at the given path
 * Note: This utility is only available in server-side environments
 * @param path - The file system path to check
 * @returns Promise that resolves to true if the path exists, false otherwise
 */
export async function fileExists(path: string): Promise<boolean> {
	try {
		await fs.access(path)
		return true
	} catch {
		return false
	}
}