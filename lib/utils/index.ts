import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility function to merge Tailwind CSS classes with clsx and tailwind-merge
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

// Note: Do not add re-exports here. Import utilities from their concrete paths.
