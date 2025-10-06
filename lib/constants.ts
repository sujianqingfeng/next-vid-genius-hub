export const PROJECT_DIR = process.cwd()

export const DATABASE_URL = process.env.DATABASE_URL
export const PROXY_URL = process.env.PROXY_URL

export const OPERATIONS_DIR = `${PROJECT_DIR}/.operations`

export const WHISPER_CPP_PATH = process.env.WHISPER_CPP_PATH

// Cloudflare Workers AI configuration
export const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
export const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN

export const RENDERED_VIDEO_FILENAME = 'video-with-subtitles.mp4'
export const VIDEO_WITH_INFO_FILENAME = 'video-with-info-and-comments.mp4'
