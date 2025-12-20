import { formatConsole, formatSimple } from './formatters'
import type { LogCategory, LogEntry, LogLevel } from './types'

class Logger {
	private logLevel: LogLevel =
		process.env.NODE_ENV === 'production' ? 'info' : 'debug'

	private shouldLog(level: LogLevel): boolean {
		const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
		const currentLevelIndex = levels.indexOf(this.logLevel)
		const messageLevelIndex = levels.indexOf(level)
		return messageLevelIndex >= currentLevelIndex
	}

	private createLogEntry(
		level: LogLevel,
		category: LogCategory,
		message: string,
	): LogEntry {
		return {
			timestamp: new Date().toISOString(),
			level,
			category,
			message,
		}
	}

	private log(level: LogLevel, category: LogCategory, message: string): void {
		if (!this.shouldLog(level)) return

		const entry = this.createLogEntry(level, category, message)
		const formattedMessage =
			process.env.NODE_ENV === 'production'
				? formatSimple(entry)
				: formatConsole(entry)

		switch (level) {
			case 'debug':
				console.debug(formattedMessage)
				break
			case 'info':
				console.info(formattedMessage)
				break
			case 'warn':
				console.warn(formattedMessage)
				break
			case 'error':
				console.error(formattedMessage)
				break
		}
	}

	debug(category: LogCategory, message: string): void {
		this.log('debug', category, message)
	}

	info(category: LogCategory, message: string): void {
		this.log('info', category, message)
	}

	warn(category: LogCategory, message: string): void {
		this.log('warn', category, message)
	}

	error(category: LogCategory, message: string): void {
		this.log('error', category, message)
	}

	setLevel(level: LogLevel): void {
		this.logLevel = level
	}
}

export const logger = new Logger()
export type { LogCategory, LogEntry, LogLevel } from './types'
