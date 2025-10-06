/**
 * 字幕模块统一导出
 * 提供一个统一的入口点来访问所有字幕相关的功能
 */

// 配置相关
export * from './config/models'
export * from './config/prompts'
export * from './config/constants'
export * from './config/presets'

// 类型定义
export * from './types'

// 工具函数
export * from './utils/color'
export * from './utils/time'
export * from './utils/vtt'

// 核心功能（后续添加）
// export * from './core/transcription'
// export * from './core/translation'
// export * from './core/rendering'

// 自定义 Hook
export * from './hooks'