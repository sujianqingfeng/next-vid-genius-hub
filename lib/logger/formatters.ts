import type { LogEntry } from './types'

export function formatConsole(entry: LogEntry): string {
  const timestamp = new Date(entry.timestamp).toISOString()
  const level = entry.level.toUpperCase().padEnd(5)
  const category = entry.category.padEnd(12)
  return `[${timestamp}] ${level} ${category} ${entry.message}`
}

export function formatSimple(entry: LogEntry): string {
  const timestamp = new Date(entry.timestamp).toLocaleTimeString()
  const level = entry.level.toUpperCase().padEnd(5)
  const category = entry.category.padEnd(12)
  return `[${timestamp}] ${level} ${category} ${entry.message}`
}