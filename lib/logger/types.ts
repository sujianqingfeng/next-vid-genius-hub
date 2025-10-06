export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogCategory =
  | 'transcription'
  | 'translation'
  | 'rendering'
  | 'api'
  | 'db'
  | 'media'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  category: LogCategory
  message: string
}