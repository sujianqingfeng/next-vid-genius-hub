# 在 Cloudflare 上部署（Next.js + OpenNext + 媒体编排 Worker）

本文档说明如何将本仓库部署到 Cloudflare：

- Next.js 应用部署到 Cloudflare Workers（使用 OpenNext Cloudflare 适配器）
- 现有媒体编排 Worker（`cloudflare/media-orchestrator`）的生产化部署要点
- 数据库与缓存（线上使用 Cloudflare D1 与 R2 增量缓存）
- 常见问题与验证步骤

重要变更：Cloudflare 官方的 `@cloudflare/next-on-pages` 已被弃用，推荐使用 OpenNext Cloudflare 适配器（`@opennextjs/cloudflare`）。参考：
- OpenNext Cloudflare 概览与入门：https://opennext.js.org/cloudflare
- 现有 Next.js 项目迁移指南：https://opennext.js.org/cloudflare/get-started

## 1. 部署前置条件

- Cloudflare 账号（Workers、R2、KV、Durable Objects 权限）
- Node.js 18+，pnpm
- 本仓库已安装依赖：`pnpm i`
- 目标数据库（线上）：Cloudflare D1

## 2. Next.js 应用部署到 Cloudflare Workers（OpenNext）

OpenNext 通过 `@opennextjs/cloudflare` 将 Next.js 15（本项目使用 `next@15.5.4`）编译并部署到 Cloudflare Workers 的 Node.js 兼容运行时。

注意：Workers 运行时不提供本地文件系统写入能力。项目中涉及本地落盘的逻辑需在 Cloudflare 环境关闭（详见 5.2）。

### 2.1 安装依赖与脚本

```bash
pnpm add -D @opennextjs/cloudflare wrangler
```

在根目录 `package.json` 增加脚本（不覆盖现有命令）：

```json
{
  "scripts": {
    "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
    "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
    "upload": "opennextjs-cloudflare build && opennextjs-cloudflare upload",
    "cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"
  }
}
```

保留原有 `pnpm dev`、`pnpm build` 以便本地开发与构建（OpenNext 的 build 会调用 `next build`）。

### 2.2 本地开发辅助（可选）

为提升 `next dev` 与 Cloudflare 运行时的一致性，建议在 `next.config.ts` 末尾加入初始化调用（仅开发时有效，不影响生产构建）：

```ts
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
initOpenNextCloudflareForDev()
```

### 2.3 OpenNext 配置（增量缓存）

在项目根目录新增 `open-next.config.ts`（若不存在）：

```ts
import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
})
```

并在 `public/_headers` 增加静态资源缓存头，匹配 Next.js 默认约定：

```text
/_next/static/*
Cache-Control: public,max-age=31536000,immutable
```

### 2.4 Wrangler 配置（Next.js 应用）

在项目根目录新增 `wrangler.jsonc`，用于定义 Worker 名称、R2 绑定与环境变量：

```jsonc
{
  "name": "next-vid-genius-hub",
  "compatibility_date": "2024-05-01",

  // 自引用用于部分缓存/队列优化（按需开启）
  "services": [
    { "binding": "WORKER_SELF_REFERENCE", "service": "next-vid-genius-hub" }
  ],

  // R2：用于 Next.js 增量缓存（ISR/SSG 数据）
  "r2_buckets": [
    { "binding": "NEXT_INC_CACHE_R2_BUCKET", "bucket_name": "next-inc-cache" }
  ],

  // 环境变量（根据生产环境调整）
  "vars": {
    "NODE_ENV": "production",
    // Cloudflare 环境默认只记录远端 Key，无需本地磁盘写入

    // 应用 URL（用于生成回调链接等）
    "NEXT_PUBLIC_APP_URL": "https://<your-domain>",

    // 与媒体编排 Worker 的回调验签一致
    "JOB_CALLBACK_HMAC_SECRET": "<strong-secret>",
    // 如果 Next 需要访问远端 R2 对象的公网地址
    // "R2_PUBLIC_BASE_URL": "https://<bucket>.<accountid>.r2.cloudflarestorage.com"
  }
}
```

创建 R2 存储桶（用于增量缓存）：

```bash
npx wrangler r2 bucket create next-inc-cache
```

### 2.5 构建与发布（Next.js 应用）

- 本地预览（Workers 运行时）：`pnpm preview`
- 一键部署：`pnpm deploy`
- 只上传新版本（用于 CI 分阶段发布）：`pnpm upload`

首次部署完成后，记录生成的 Workers 路由或绑定到自定义域名。

> 参考：
> - OpenNext Cloudflare 概览与入门：https://opennext.js.org/cloudflare
> - 缓存（R2 增量缓存 & 区域缓存等）：https://opennext.js.org/cloudflare/caching

## 3. 媒体编排 Worker 部署（cloudflare/media-orchestrator）

项目已包含编排 Worker：`cloudflare/media-orchestrator`。其 `wrangler.toml` 定义了：

- `KV`：作业状态（`JOBS`）
- `R2`：渲染产物（建议使用 R2，生产将 `S3_*` 指向 R2 S3 兼容端点）
- `Durable Objects`：作业协调
- 变量：`NEXT_BASE_URL`、`JOB_CALLBACK_HMAC_SECRET`、各容器服务的 Base URL 等

生产环境步骤（简版）：

```bash
cd cloudflare/media-orchestrator

# 创建/绑定 R2 存储桶（与 wrangler.toml 的 bucket_name 对齐）
npx wrangler r2 bucket create vidgen-render

# 如需 KV、DO 等资源，按 wrangler 提示创建/绑定（首次 deploy 会交互）
npx wrangler deploy
```

关键变量说明（`cloudflare/media-orchestrator/wrangler.toml` → `[vars]`）：

- `NEXT_BASE_URL`：指向已部署的 Next.js 应用域名（如 `https://app.example.com`），用于回调
- `JOB_CALLBACK_HMAC_SECRET`：与 Next 环境一致；回调验签用
- `S3_*`：指向生产 R2（S3 兼容端点、Key/Secret、Bucket 等）；开发期可指向 MinIO
- `CONTAINER_BASE_URL_*`：云端/私有环境的渲染/下载引擎入口（由你维护）

> 更多生产化细节，参考仓库内文档：`docs/PRODUCTION.md`（已包含 R2 S3 端点与出网白名单等）

## 3.1 在 Cloudflare Containers 运行容器（媒体下载/转码/渲染）

Cloudflare Containers 允许在 Workers 应用中按需拉起并调用容器镜像（无需暴露公共地址）。编排 Worker 可以直接通过 `@cloudflare/containers` 将请求路由到容器实例，替代本地 Docker 或独立主机。

官方文档（可查阅 llm 友好页）：
- 总览与示例（含完整 wrangler 配置与最小代码）：https://developers.cloudflare.com/containers/index.md
- Getting started（容器 + Worker 调用）：https://developers.cloudflare.com/containers/get-started/

本仓库已有容器定义与 Dockerfile：`containers/` 下包含：
- `media-downloader`（EXPOSE 8080）
- `audio-transcoder`（EXPOSE 8080）
- `burner-ffmpeg`（EXPOSE 8080）
- `renderer-remotion`（EXPOSE 8090）

推荐将容器随“编排 Worker”一起管理：

1) 在编排 Worker 新增容器类（示例）

文件：`cloudflare/media-orchestrator/containers.ts`

```ts
import { Container } from '@cloudflare/containers'

export class MediaDownloaderContainer extends Container {
  defaultPort = 8080
  sleepAfter = '10m'
}

export class AudioTranscoderContainer extends Container {
  defaultPort = 8080
  sleepAfter = '10m'
}

export class BurnerFfmpegContainer extends Container {
  defaultPort = 8080
  sleepAfter = '10m'
}

export class RendererRemotionContainer extends Container {
  defaultPort = 8090
  sleepAfter = '10m'
}
```

2) 在 `cloudflare/media-orchestrator/wrangler.toml` 绑定容器与 DO（根据官方示例添加）

```toml
[[containers]]
class_name = "MediaDownloaderContainer"
image = "./containers/media-downloader/Dockerfile"
max_instances = 10

[[containers]]
class_name = "AudioTranscoderContainer"
image = "./containers/audio-transcoder/Dockerfile"
max_instances = 10

[[containers]]
class_name = "BurnerFfmpegContainer"
image = "./containers/burner-ffmpeg/Dockerfile"
max_instances = 10

[[containers]]
class_name = "RendererRemotionContainer"
image = "./containers/renderer-remotion/Dockerfile"
max_instances = 5

[[durable_objects.bindings]]
name = "MEDIA_DOWNLOADER"
class_name = "MediaDownloaderContainer"

[[durable_objects.bindings]]
name = "AUDIO_TRANSCODER"
class_name = "AudioTranscoderContainer"

[[durable_objects.bindings]]
name = "BURNER_FFMPEG"
class_name = "BurnerFfmpegContainer"

[[durable_objects.bindings]]
name = "RENDERER_REMOTION"
class_name = "RendererRemotionContainer"

[[migrations]]
tag = "v1-containers"
new_sqlite_classes = [
  "MediaDownloaderContainer",
  "AudioTranscoderContainer",
  "BurnerFfmpegContainer",
  "RendererRemotionContainer",
]
```

3) 在编排逻辑中调用容器（关键思路）

将原本通过 `CONTAINER_BASE_URL_*` 直连的调用，改为容器绑定：

```ts
import { getContainer } from '@cloudflare/containers'

// 以下载引擎为例：
const inst = getContainer(env.MEDIA_DOWNLOADER, job.sessionId /*或 mediaId */)
const res = await inst.fetch(new Request('http://container/render', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(jobPayload)
}))
```

注意：
- Container 默认端口通过上文 `defaultPort` 指定
- 调用路径与容器内部路由一致（本仓库容器通常使用 `POST /render`）
- 仍按现有回调机制将结果回传至 Next（`/api/render/cf-callback`），并使用 `JOB_CALLBACK_HMAC_SECRET` 验签
- 如暂不想改代码，可短期继续使用外部主机/集群 + `CONTAINER_BASE_URL_*`，但推荐尽快迁移到 Cloudflare Containers 以降低时延与运维复杂度

4) 设置容器环境变量、密钥

容器使用的环境变量（如 `JOB_CALLBACK_HMAC_SECRET`、`CLASH_*`）可在 wrangler 中通过 `[[containers]]` 的 `env` 或镜像构建时注入。详见官方：
- Environment Variables（Containers）：在侧边栏的 “Environment Variables” 小节
- Secrets：可结合 `wrangler secret` 与 `secrets-store` 使用

5) 本地与部署

```bash
# 本地预览（容器将由 wrangler 构建/拉取并在 Cloudflare 侧运行）
cd cloudflare/media-orchestrator
wrangler dev

# 部署（包含容器镜像构建与发布）
wrangler deploy
```

更多能力：滚动升级、缩放与路由、镜像管理、实例类型等，参考：
- Containers 概览（llm 友好页）：https://developers.cloudflare.com/containers/index.md
- Limits and Instance Types：侧边栏 “Limits and Instance Types”
- Image Management / Rollouts / Scaling and Routing：侧边栏对应章节

## 4. 数据库：线上使用 Cloudflare D1

说明：Cloudflare 面向公众提供的托管 SQLite 数据库为 D1。以下步骤展示如何在 wrangler 中绑定并在代码里通过绑定访问。

### 4.1 在 wrangler 中绑定数据库

在 Next.js Worker 的 `wrangler.jsonc`（根目录）中新增 D1 绑定（示例绑定名 `DB`）：

```jsonc
{
  // ... 省略其它配置
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "vidgen_app",
      "database_id": "<从 Cloudflare 控制台复制>"
    }
  ]
}
```

（如后续需要其他数据库产品，请以官方文档为准替换绑定键与命令。）

### 4.2 代码适配（Drizzle + Cloudflare 绑定）

本仓库当前使用 `@libsql/client` + `drizzle-orm/libsql` 直连方式。在 Cloudflare 线上改为 D1 时，建议切换为 Cloudflare 绑定：

示例（D1）：将 `lib/db/index.ts` 改造成使用 `drizzle-orm/d1` 与 `getCloudflareContext`：

```ts
// lib/db/index.ts（示例片段）
import { drizzle } from 'drizzle-orm/d1'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import * as schema from './schema'

const db = drizzle(getCloudflareContext().env.DB, { schema })
export { schema, db }
```

说明：
- 访问方式为 `getCloudflareContext().env.<绑定名>`；上例绑定名为 `DB`
- 本地 `next dev` 时，请确保在 `next.config.ts` 末尾调用 `initOpenNextCloudflareForDev()` 以获得本地绑定模拟

若暂不想改代码，也可在过渡期继续使用 LibSQL/Turso，但正式线上运行在 Workers 环境时，推荐使用 D1/D2 绑定，以获得最佳兼容性与更低时延。

### 4.3 迁移与管理

```bash
# 创建数据库（可在控制台或 CLI）
npx wrangler d1 create vidgen_app

# 生成迁移（建议使用 wrangler d1 的迁移目录，或基于 drizzle 生成 SQL 后导入）
# 将 SQL 放入 migrations 目录后：
npx wrangler d1 migrations apply vidgen_app

# 也可在 CI 中执行 apply，再部署 Worker
```

注意：
- 不要在 Worker 运行时做迁移；请在 CI/本地对目标库完成迁移

## 5. 运行时限制与配置要点

### 5.1 Node API 兼容

Cloudflare Workers 的 Node.js 兼容层不等同于完整 Node 环境。常见限制：
- 无本地文件系统（`fs` 写入不可用）
- 禁止子进程（`child_process`）等

因此，本仓库的重度媒体处理（ffmpeg、yt-dlp、Remotion 渲染等）已通过“编排 Worker + 外部容器/服务 + R2”解耦，Next.js 仅负责业务路由与数据库。

### 5.2 远端产物持久化

`app/api/render/cf-callback/route.ts` 现在默认只记录云端产物的 Key/URL 与 `downloadJobId`，不再尝试写入 `OPERATIONS_DIR`。在 Cloudflare 环境无需额外变量，只要确保 Worker 回调提供可用的远端引用即可。

### 5.3 图片优化与远程图片

OpenNext Cloudflare 支持 Next.js 图片优化。项目已在 `next.config.ts` 配置了 `images.remotePatterns`。如需使用 Cloudflare Images，可参考官方指引进行接入与域名白名单设置。

## 6. 验证 Checklist

- 部署 Next.js 应用：`pnpm deploy` 输出成功，域名可访问
- 校验数据库绑定：`wrangler.jsonc` 已配置 D1 绑定
- 创建 R2 存储桶：`next-inc-cache` 用于 ISR/SSG 缓存（`public/_headers` 已设置）
- 部署媒体编排 Worker：`wrangler deploy` 成功；`NEXT_BASE_URL` 与 `JOB_CALLBACK_HMAC_SECRET` 与 Next 保持一致
- 触发一次媒体下载/渲染流程：
  - Next 发起任务 → 编排 Worker 协调容器 → R2 产物生成
  - 编排 Worker 向 Next `/api/render/cf-callback` 回调 → DB 更新远端 Key/URL

## 7. 常见问题（Troubleshooting）

- 报错 “fs not supported”：确认部署版本已包含远端存储逻辑，或排查是否有其他代码在 Worker 环境尝试写入磁盘
- D1 连接报错：检查 `wrangler.jsonc` 的数据库绑定与绑定名是否与代码一致（如 `env.DB`）
- D1 迁移失败：在本地或 CI 执行 `wrangler d1 migrations apply`，并确认 SQL 与表结构一致
- ISR/SSG 不生效：检查 `open-next.config.ts` 与 R2 绑定（`NEXT_INC_CACHE_R2_BUCKET`）是否配置正确
- 图片 403/外链失败：补充 `next.config.ts` 的 `images.remotePatterns`，或使用 Cloudflare Images

## 8. 参考链接（已核验）

- OpenNext Cloudflare 总览与入门：https://opennext.js.org/cloudflare
- OpenNext 现有项目改造（脚本、`.dev.vars`、`open-next.config.ts` 等）：https://opennext.js.org/cloudflare/get-started
- OpenNext 缓存与 R2 增量缓存（含 `public/_headers` 建议）：https://opennext.js.org/cloudflare/caching
- Cloudflare Pages Functions/Workers 能力与限制（Node 兼容说明）：https://developers.cloudflare.com/pages/functions/
