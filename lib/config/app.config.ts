// 从原来的 constants.ts 迁移核心配置
import { MEDIA_CONFIG } from "./media.config";
export const APP_CONFIG = {
  // 数据库配置
  database: {
    url: process.env.DATABASE_URL || "file:./local.db",
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || "10"),
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || "10000"),
  },

  // 操作目录
  operations: {
    dir: process.env.OPERATIONS_DIR || "./operations",
    tempDir: process.env.TEMP_DIR || "./temp",
    backupDir: process.env.BACKUP_DIR || "./backups",
    cleanup: {
      enabled: process.env.ENABLE_CLEANUP !== "false",
      retentionDays: parseInt(process.env.CLEANUP_RETENTION_DAYS || "7"),
      intervalHours: parseInt(process.env.CLEANUP_INTERVAL_HOURS || "24"),
    },
  },

  // 代理配置
  proxy: {
    url: process.env.PROXY_URL,
    timeout: parseInt(process.env.PROXY_TIMEOUT || "30000"),
    retries: parseInt(process.env.PROXY_RETRIES || "3"),
  },

  // 文件限制（统一引用 MEDIA_CONFIG）
  limits: MEDIA_CONFIG.limits,

  // 质量配置（统一引用 MEDIA_CONFIG）
  qualities: MEDIA_CONFIG.qualities,

  // 应用信息
  app: {
    name: "Video Genius Hub",
    version: process.env.npm_package_version || "1.0.0",
    description: "AI-powered video processing platform",
    author: "Video Genius Team",
    environment: process.env.NODE_ENV || "development",
    url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    supportEmail: "support@videogenius.com",
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || "info",
    enableFileLogging: process.env.NODE_ENV === "production",
    logDir: process.env.LOG_DIR || "./logs",
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    enableConsoleLogs: process.env.ENABLE_CONSOLE_LOGS !== "false",
    enablePerformanceLogs: process.env.ENABLE_PERFORMANCE_LOGS === "true",
  },

  // 缓存配置
  cache: {
    ttl: 60 * 60, // 1 hour
    maxSize: 1000, // maximum number of cached items
    checkPeriod: 10 * 60, // 10 minutes
    enableRedis: process.env.ENABLE_REDIS === "true",
    redisUrl: process.env.REDIS_URL,
  },

  // 性能配置
  performance: {
    enableCompression: process.env.ENABLE_COMPRESSION !== "false",
    compressionLevel: parseInt(process.env.COMPRESSION_LEVEL || "6"),
    enableStaticOptimization: true,
    imageOptimization: {
      enabled: true,
      quality: parseInt(process.env.IMAGE_QUALITY || "75"),
      formats: ["webp", "avif"],
    },
    bundleAnalysis: process.env.ANALYZE_BUNDLE === "true",
  },

  // 安全配置
  security: {
    enableCSRF: process.env.ENABLE_CSRF !== "false",
    enableRateLimit: process.env.ENABLE_RATE_LIMIT !== "false",
    maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE || "60"),
    sessionSecret: process.env.SESSION_SECRET,
    jwtSecret: process.env.JWT_SECRET,
    corsOrigins: process.env.CORS_ORIGINS?.split(",") || [
      "http://localhost:3000",
    ],
    enableHttps: process.env.ENABLE_HTTPS === "true",
    trustProxy: process.env.TRUST_PROXY === "true",
  },

  // 第三方服务配置
  services: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL,
      organization: process.env.OPENAI_ORGANIZATION,
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || "4096"),
      model: process.env.OPENAI_MODEL || "gpt-4",
    },
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      maxTokens: parseInt(process.env.DEEPSEEK_MAX_TOKENS || "4096"),
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    },
    packycode: {
      apiKey: process.env.PACKYCODE_API_KEY,
      baseUrl:
        process.env.PACKYCODE_BASE_URL || "https://codex-api.packycode.com",
      maxTokens: parseInt(process.env.PACKYCODE_MAX_TOKENS || "4096"),
      model: process.env.PACKYCODE_MODEL || "gpt-5",
    },
    sentry: {
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: parseFloat(
        process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1",
      ),
    },
    analytics: {
      googleAnalyticsId: process.env.GA_ID,
      plausibleUrl: process.env.PLAUSIBLE_URL,
    },
  },

  // 功能开关
  features: {
    enableAI: process.env.ENABLE_AI !== "false",
    enableComments: process.env.ENABLE_COMMENTS !== "false",
    enableSubtitles: process.env.ENABLE_SUBTITLES !== "false",
    enableDownloads: process.env.ENABLE_DOWNLOADS !== "false",
    enableLivePreview: process.env.ENABLE_LIVE_PREVIEW === "true",
    enableBatchProcessing: process.env.ENABLE_BATCH_PROCESSING === "true",
    enableAdvancedEditing: process.env.ENABLE_ADVANCED_EDITING === "true",
  },

  // UI 配置
  ui: {
    theme: process.env.DEFAULT_THEME || "light",
    language: process.env.DEFAULT_LANGUAGE || "en",
    timezone: process.env.DEFAULT_TIMEZONE || "UTC",
    enableDarkMode: true,
    enableAnimations: process.env.ENABLE_ANIMATIONS !== "false",
    enableNotifications: true,
    defaultPageSize: parseInt(process.env.DEFAULT_PAGE_SIZE || "20"),
  },

  // 监控配置
  monitoring: {
    enableMetrics: process.env.ENABLE_METRICS === "true",
    metricsPort: parseInt(process.env.METRICS_PORT || "9090"),
    enableHealthChecks: true,
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || "30000"),
    enableUptimeMonitoring: process.env.ENABLE_UPTIME_MONITORING === "true",
  },
} as const;

// 向后兼容的导出
export const OPERATIONS_DIR = APP_CONFIG.operations.dir;
export const PROXY_URL = APP_CONFIG.proxy.url;

// 便捷的访问器
export const { database, operations, limits, qualities, app, services } =
  APP_CONFIG;
export const { openai, deepseek, packycode, sentry } = services;
export const { features, ui, monitoring } = APP_CONFIG;

// Centralized environment-backed app constants (migrated from constants/app.constants.ts)
export const DATABASE_URL = APP_CONFIG.database.url;
// PROXY_URL and OPERATIONS_DIR already exported above for backward-compat

// Cloudflare Workers/Orchestrator configuration
// D1 / 控制台相关凭据仍使用 CLOUDFLARE_* 命名（见 docs/CLOUDFLARE_DEPLOY.zh-CN.md）
export const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
export const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
// Workers AI（Whisper / asr-pipeline）统一使用 CF_AI_* 命名，与 Worker 侧保持一致
export const CF_AI_ACCOUNT_ID = process.env.CF_AI_ACCOUNT_ID;
export const CF_AI_API_TOKEN = process.env.CF_AI_API_TOKEN;
export const CLOUDFLARE_ASR_MAX_UPLOAD_BYTES =
  Number(process.env.CLOUDFLARE_ASR_MAX_UPLOAD_BYTES || "") || 4 * 1024 * 1024; // 4 MiB
export const FORCE_CLOUD_DOWNSAMPLE =
  (process.env.FORCE_CLOUD_DOWNSAMPLE || "").toLowerCase() === "true";
export const ASR_TARGET_BITRATES = (process.env.ASR_TARGET_BITRATES || "48,24")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0) as number[];
export const ASR_SAMPLE_RATE = Number(process.env.ASR_SAMPLE_RATE || 16000);

export const CF_ORCHESTRATOR_URL = process.env.CF_ORCHESTRATOR_URL;
export const JOB_CALLBACK_HMAC_SECRET = process.env.JOB_CALLBACK_HMAC_SECRET;
export const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL;
