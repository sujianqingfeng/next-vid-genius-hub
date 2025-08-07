import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility function to merge Tailwind CSS classes with clsx and tailwind-merge
 * This function combines clsx for conditional classes and tailwind-merge for deduplication
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

// Re-export all formatting utilities
export * from './format'
