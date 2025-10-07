/**
 * Validation utility functions
 */

/**
 * Email validation regex
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * URL validation regex
 */
const URL_REGEX = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/

/**
 * YouTube URL validation regex
 */
const YOUTUBE_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/

/**
 * TikTok URL validation regex
 */
const TIKTOK_REGEX = /^(https?:\/\/)?(www\.)?(tiktok\.com\/@[\w.-]+\/video\/[\d]+|vm\.tiktok\.com\/[\w]+)/

/**
 * Validate email address
 */
export function isValidEmail(email: string): boolean {
	return EMAIL_REGEX.test(email)
}

/**
 * Validate URL
 */
export function isValidUrl(url: string): boolean {
	return URL_REGEX.test(url)
}

/**
 * Validate YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
	return YOUTUBE_REGEX.test(url)
}

/**
 * Validate TikTok URL
 */
export function isValidTikTokUrl(url: string): boolean {
	return TIKTOK_REGEX.test(url)
}

/**
 * Validate video URL (YouTube or TikTok)
 */
export function isValidVideoUrl(url: string): boolean {
	return isValidYouTubeUrl(url) || isValidTikTokUrl(url)
}

/**
 * Validate if string is a valid JSON
 */
export function isValidJson(str: string): boolean {
	try {
		JSON.parse(str)
		return true
	} catch {
		return false
	}
}

/**
 * Validate if string is a valid number
 */
export function isValidNumber(str: string): boolean {
	return !isNaN(Number(str)) && isFinite(Number(str))
}

/**
 * Validate if string is a valid integer
 */
export function isValidInteger(str: string): boolean {
	return Number.isInteger(Number(str))
}

/**
 * Validate if string is a valid positive number
 */
export function isValidPositiveNumber(str: string): boolean {
	const num = Number(str)
	return !isNaN(num) && isFinite(num) && num > 0
}

/**
 * Validate if string is a valid positive integer
 */
export function isValidPositiveInteger(str: string): boolean {
	const num = Number(str)
	return Number.isInteger(num) && num > 0
}

/**
 * Validate if string is a valid phone number (US format)
 */
export function isValidPhoneNumber(phone: string): boolean {
	const phoneRegex = /^\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/
	return phoneRegex.test(phone.replace(/\D/g, ''))
}

/**
 * Validate if string is a valid credit card number
 */
export function isValidCreditCard(cardNumber: string): boolean {
	const digits = cardNumber.replace(/\D/g, '')

	// Check if it has 13-19 digits (typical credit card length)
	if (digits.length < 13 || digits.length > 19) {
		return false
	}

	// Luhn algorithm
	let sum = 0
	let shouldDouble = false

	for (let i = digits.length - 1; i >= 0; i--) {
		let digit = parseInt(digits[i], 10)

		if (shouldDouble) {
			digit *= 2
			if (digit > 9) {
				digit -= 9
			}
		}

		sum += digit
		shouldDouble = !shouldDouble
	}

	return sum % 10 === 0
}

/**
 * Validate if string is a valid hex color
 */
export function isValidHexColor(color: string): boolean {
	const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
	return hexRegex.test(color)
}

/**
 * Validate if string is a valid date
 */
export function isValidDate(dateString: string): boolean {
	const date = new Date(dateString)
	return !isNaN(date.getTime())
}

/**
 * Validate if string is a valid ISO date string
 */
export function isValidIsoDate(dateString: string): boolean {
	const isoRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/
	if (!isoRegex.test(dateString)) return false

	const date = new Date(dateString)
	return !isNaN(date.getTime())
}

/**
 * Validate if string meets minimum length requirements
 */
export function isValidLength(str: string, minLength: number, maxLength?: number): boolean {
	if (str.length < minLength) return false
	if (maxLength && str.length > maxLength) return false
	return true
}

/**
 * Validate if string contains only alphanumeric characters
 */
export function isAlphanumeric(str: string): boolean {
	const alphanumericRegex = /^[a-zA-Z0-9]+$/
	return alphanumericRegex.test(str)
}

/**
 * Validate if string contains only letters
 */
export function isAlpha(str: string): boolean {
	const alphaRegex = /^[a-zA-Z]+$/
	return alphaRegex.test(str)
}

/**
 * Validate if string contains only numbers
 */
export function isNumeric(str: string): boolean {
	const numericRegex = /^[0-9]+$/
	return numericRegex.test(str)
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): {
	isValid: boolean
	strength: 'weak' | 'medium' | 'strong'
	errors: string[]
} {
	const errors: string[] = []
	let strength: 'weak' | 'medium' | 'strong' = 'weak'

	// Length check
	if (password.length < 8) {
		errors.push('Password must be at least 8 characters long')
	} else {
		strength = 'medium'
	}

	// Character variety checks
	if (!/[a-z]/.test(password)) {
		errors.push('Password must contain at least one lowercase letter')
	}

	if (!/[A-Z]/.test(password)) {
		errors.push('Password must contain at least one uppercase letter')
	}

	if (!/[0-9]/.test(password)) {
		errors.push('Password must contain at least one number')
	}

	if (!/[^a-zA-Z0-9]/.test(password)) {
		errors.push('Password must contain at least one special character')
	} else {
		strength = 'strong'
	}

	// Common patterns
	if (/^(.)\1+$/.test(password)) {
		errors.push('Password cannot be all the same character')
		strength = 'weak'
	}

	if (/123|password|qwerty/i.test(password)) {
		errors.push('Password cannot contain common patterns')
		strength = 'weak'
	}

	return {
		isValid: errors.length === 0,
		strength,
		errors
	}
}

/**
 * Validate username
 */
export function isValidUsername(username: string): {
	isValid: boolean
	errors: string[]
} {
	const errors: string[] = []

	if (!username) {
		errors.push('Username is required')
	} else {
		if (username.length < 3) {
			errors.push('Username must be at least 3 characters long')
		}

		if (username.length > 30) {
			errors.push('Username must be no more than 30 characters long')
		}

		if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
			errors.push('Username can only contain letters, numbers, hyphens, and underscores')
		}

		if (/^[0-9_-]/.test(username)) {
			errors.push('Username must start with a letter')
		}

		if (/[_-]$/.test(username)) {
			errors.push('Username cannot end with a hyphen or underscore')
		}

		if (/[_-]{2,}/.test(username)) {
			errors.push('Username cannot contain consecutive hyphens or underscores')
		}
	}

	return {
		isValid: errors.length === 0,
		errors
	}
}

/**
 * Validate file size
 */
export function isValidFileSize(fileSize: number, maxSizeInBytes: number): boolean {
	return fileSize <= maxSizeInBytes
}

/**
 * Validate file type
 */
export function isValidFileType(filename: string, allowedExtensions: string[]): boolean {
	const extension = filename.toLowerCase().split('.').pop()
	return allowedExtensions.includes(extension || '')
}

/**
 * Validate if string is a valid UUID
 */
export function isValidUuid(uuid: string): boolean {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
	return uuidRegex.test(uuid)
}

/**
 * Validate if string is a valid slug
 */
export function isValidSlug(slug: string): boolean {
	const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
	return slugRegex.test(slug)
}

/**
 * Validate if string is a valid IP address (IPv4)
 */
export function isValidIPv4(ip: string): boolean {
	const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
	return ipv4Regex.test(ip)
}

/**
 * Validate if string is a valid IP address (IPv6)
 */
export function isValidIPv6(ip: string): boolean {
	const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/
	return ipv6Regex.test(ip)
}

/**
 * Validate if string is a valid MAC address
 */
export function isValidMacAddress(mac: string): boolean {
	const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
	return macRegex.test(mac)
}

/**
 * Create a custom validator
 */
export function createValidator<T>(
	validate: (value: T) => boolean,
	errorMessage: string
) {
	return (value: T): { isValid: boolean; error?: string } => {
		const isValid = validate(value)
		return {
			isValid,
			error: isValid ? undefined : errorMessage
		}
	}
}

/**
 * Chain multiple validators
 */
export function validateWith<T>(
	value: T,
	validators: Array<(value: T) => { isValid: boolean; error?: string }>
): { isValid: boolean; errors: string[] } {
	const errors: string[] = []

	for (const validator of validators) {
		const result = validator(value)
		if (!result.isValid && result.error) {
			errors.push(result.error)
		}
	}

	return {
		isValid: errors.length === 0,
		errors
	}
}