/**
 * 字幕模块通用常量
 */

/**
 * 颜色相关常量
 */
export const COLOR_CONSTANTS = {
	// 正则表达式
	HEX_COLOR_REGEX: /^#(?:[0-9a-fA-F]{3}){1,2}$/,

	// 默认颜色
	DEFAULT_TEXT_COLOR: '#ffffff',
	DEFAULT_BACKGROUND_COLOR: '#000000',
	DEFAULT_OUTLINE_COLOR: '#000000',

	// 数值范围
	FONT_SIZE_MIN: 12,
	FONT_SIZE_MAX: 72,
	OPACITY_MIN: 0,
	OPACITY_MAX: 1,
	DEFAULT_BACKGROUND_OPACITY: 0.65,
	DEFAULT_FONT_SIZE: 18,
} as const

/**
 * 时间相关常量
 */
// 环境感知的轮询配置
function resolveInterval(devMs: number, prodMs: number) {
    // 在浏览器端可用的 env: process.env.NODE_ENV 由 Next 编译期注入
    const env = process.env.NODE_ENV || 'development'
    return env === 'development' ? devMs : prodMs
}

export const TIME_CONSTANTS = {
    // 渲染状态轮询间隔（毫秒）
    RENDERING_POLL_INTERVAL: resolveInterval(1500, 4000),
    // 媒体详情刷新间隔（毫秒）
    MEDIA_REFRESH_POLL_INTERVAL: resolveInterval(4000, 8000),

	// 时间戳格式 - 支持两种格式: HH:MM:SS.mmm 和 MM:SS.mmm
	VTT_TIMESTAMP_FORMAT: /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/,
	FULL_TIMESTAMP_FORMAT: /(\d+):(\d+):(\d+)\.(\d{1,3})/,

	// 默认值
	DEFAULT_VIDEO_DURATION: 0,
} as const

/**
 * 字符串长度限制
 */
export const LIMIT_CONSTANTS = {
	HINT_TEXT_MAX_LENGTH: 200,
	MAX_VTT_CUES_PER_PAGE: 100,
} as const

/**
 * 文件和路径常量
 */
export const FILE_CONSTANTS = {
	VTT_EXTENSION: '.vtt',
	RENDERED_VIDEO_FILENAME: 'rendered.mp4',
} as const

/**
 * UI相关常量
 */
export const UI_CONSTANTS = {
	// 动画持续时间（毫秒）
	ANIMATION_DURATION: 500,

	// 响应式断点
	SM_BREAKPOINT: 640,
	MD_BREAKPOINT: 768,
	LG_BREAKPOINT: 1024,

	// 尺寸
	CONTAINER_HEIGHT_REFERENCE: 1080, // 1080p reference height
	ENGLISH_FONT_SIZE_RATIO: 0.65, // 英文字体相对于中文字体的比例
	MIN_ENGLISH_FONT_SIZE: 12,
	MIN_CHINESE_FONT_SIZE: 16,
	TEXT_SHADOW_BLUR_RATIO: 0.18,
	MIN_TEXT_SHADOW_BLUR: 4,
} as const
