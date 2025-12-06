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

仓库已内置 `open-next.config.ts`，直接启用了基于 R2 的增量缓存：

```ts
import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
})
```

`public/_headers` 也已经加入以下静态资源缓存头，匹配 Next.js 默认约定（如有定制可在该文件里调整）：

```text
/_next/static/*
Cache-Control: public,max-age=31536000,immutable
```

### 2.4 Wrangler 配置（Next.js 应用）

根目录的 `wrangler.json` 已配置 D1、R2 与必要变量，你只需把 `bucket_name`、`NEXT_PUBLIC_APP_URL` 以及 `JOB_CALLBACK_HMAC_SECRET` 等值改成自己的环境即可。核心结构如下：

```jsonc
{
  "name": "next-vid-genius",
  "compatibility_date": "2024-05-01",

  // 自引用用于部分缓存/队列优化（按需开启）
  "services": [
    { "binding": "WORKER_SELF_REFERENCE", "service": "next-vid-genius" }
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
- `renderer-remotion`（EXPOSE 8190）

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
  defaultPort = 8190
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

在 Next.js Worker 的 `wrangler.json`（根目录）中新增 D1 绑定（示例绑定名 `DB`）。本仓库已将开发 / 预发 / 生产统一配置为访问同一个远程实例：

```jsonc
{
  // ... 省略其它配置
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "vidgen_app",
      "database_id": "<从 Cloudflare 控制台复制的 REMOTE_VIDGEN_APP_ID>"
    }
  ]
}
```

> `database_id` 必须填写 Cloudflare 控制台中 **D1 → Database ID**。仓库中的占位符 `REMOTE_VIDGEN_APP_ID` 记得替换成真实值；一旦替换后，本地运行 `wrangler dev --remote`、`pnpm dev` 等命令就会直接连到该远程库。

提示：由于本地与远程共用同一实例，需要为 `wrangler` 提供 `CLOUDFLARE_ACCOUNT_ID` 与 `CLOUDFLARE_API_TOKEN`，并通过 `wrangler login` 或 `wrangler config` 写入；否则 `pnpm db:d1:*` 无法针对远端执行。为了避免 `wrangler dev --env local` 报「缺少 env.local」的警告，`wrangler.json` 中保留了一个 `env.local` 节，并将它也指向同一个远程数据库。

（如后续需要其他数据库产品，请以官方文档为准替换绑定键与命令。）

### 4.2 代码适配（Drizzle + Cloudflare 绑定）

本仓库已默认使用 `drizzle-orm/d1` 通过 Cloudflare 绑定访问 D1，入口位于 `lib/db/index.ts`：

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
- 开发环境建议使用 `wrangler dev --remote` + `pnpm dev`，并在 `next.config.ts` 末尾继续调用 `initOpenNextCloudflareForDev()` 以获取 Cloudflare context
- 若需要在 dev server 启动时自动 apply 迁移，请在 shell 中设置 `D1_AUTO_APPLY_MIGRATIONS=true`；默认关闭，避免本地误改远程 D1



### 4.3 迁移与管理（共享远程实例）

标准顺序：

```bash
pnpm db:generate              # 基于 schema 输出 /drizzle/*.sql
pnpm db:d1:migrate:remote     # 通过 wrangler d1 migrations apply vidgen_app（脚本内置 --remote）
pnpm cf:deploy                # 或自定义部署脚本
```

Wrangler 原生命令仍可直接使用：

```bash
# 创建数据库（可在控制台或 CLI）
pnpm wrangler d1 create vidgen_app

# 手动 apply（与脚本效果一致）
pnpm wrangler d1 migrations apply vidgen_app
```

> `pnpm db:d1:list:remote` 也会强制 `--remote`，可以直接在本地查看迁移状态而不担心落入 `.wrangler/state` 的本地副本。

注意：
- 不要在 Worker 运行时做迁移；请在 CI 或本地对目标库完成迁移
- 当需要临时禁用 dev server 自动作迁移时，保持 `D1_AUTO_APPLY_MIGRATIONS` 未设置或设为 `false`

### 4.4 本地 / CI 共用远程 D1

- 环境凭证：配置 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`（D1 写权限），执行一次 `wrangler login`/`wrangler config`。
- 启动开发：`wrangler dev --remote` + `pnpm dev`，或直接 `pnpm dev`（OpenNext 会读取远程绑定）；若需自动迁移，请手动导出 `D1_AUTO_APPLY_MIGRATIONS=true`。
- 巡检：`pnpm db:d1:list:remote` 查看远程迁移状态，必要时 `pnpm wrangler d1 execute vidgen_app --command "SELECT COUNT(*) FROM ..."` 进行 Spot Check。
- CI 流程：在部署 job 中插入 `pnpm db:d1:migrate:remote`，并为 job 注入 Cloudflare Token；失败时阻断后续部署，保持 schema 与代码一致。

### 4.5 常用 wrangler d1 命令

| 目的 | 命令 |
| --- | --- |
| 即席查询 | `pnpm wrangler d1 execute vidgen_app --command "SELECT * FROM jobs LIMIT 10"` |
| 查看迁移 | `pnpm db:d1:list:remote`（内部调用 `wrangler d1 migrations list vidgen_app`） |
| 备份 | `pnpm wrangler d1 backups create vidgen_app` + `pnpm wrangler d1 backups download vidgen_app --backup-id <id>` |
| 回滚 | `pnpm wrangler d1 migrations rollback vidgen_app --to <migration_id>` |

所有命令都会命中同一个远程实例，务必在执行前确认 SQL 内容与目标环境。

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
- 校验数据库绑定：`wrangler.json` 已配置远程 D1 绑定且 `pnpm db:d1:list:remote` 输出最新迁移
- 创建 R2 存储桶：`next-inc-cache` 用于 ISR/SSG 缓存（`public/_headers` 已设置）
- 部署媒体编排 Worker：`wrangler deploy` 成功；`NEXT_BASE_URL` 与 `JOB_CALLBACK_HMAC_SECRET` 与 Next 保持一致
- 触发一次媒体下载/渲染流程：
  - Next 发起任务 → 编排 Worker 协调容器 → R2 产物生成
  - 编排 Worker 向 Next `/api/render/cf-callback` 回调 → DB 更新远端 Key/URL

## 7. 常见问题（Troubleshooting）

- 报错 “fs not supported”：确认部署版本已包含远端存储逻辑，或排查是否有其他代码在 Worker 环境尝试写入磁盘
- D1 连接报错：检查 `wrangler.json` 的数据库绑定与绑定名是否与代码一致（如 `env.DB`）
- D1 迁移失败：在本地或 CI 执行 `pnpm db:d1:migrate:remote`（内部调用 `wrangler d1 migrations apply`），并确认 SQL 与表结构一致
- Dev server 启动即尝试迁移远程库：确认没有设置 `D1_AUTO_APPLY_MIGRATIONS=true`，或只在单次操作前导出该变量
- ISR/SSG 不生效：检查 `open-next.config.ts` 与 R2 绑定（`NEXT_INC_CACHE_R2_BUCKET`）是否配置正确
- 图片 403/外链失败：补充 `next.config.ts` 的 `images.remotePatterns`，或使用 Cloudflare Images

## 8. 参考链接（已核验）

- OpenNext Cloudflare 总览与入门：https://opennext.js.org/cloudflare
- OpenNext 现有项目改造（脚本、`.dev.vars`、`open-next.config.ts` 等）：https://opennext.js.org/cloudflare/get-started
- OpenNext 缓存与 R2 增量缓存（含 `public/_headers` 建议）：https://opennext.js.org/cloudflare/caching
- Cloudflare Pages Functions/Workers 能力与限制（Node 兼容说明）：https://developers.cloudflare.com/pages/functions/
