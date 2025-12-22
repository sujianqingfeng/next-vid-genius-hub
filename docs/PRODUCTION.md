# 生产环境部署与配置（Workers + R2 + Container）

本文档说明如何将“字幕/评论云端渲染（方案 C：进行中轮询 + 终态回调）”部署到生产环境。架构为：

- Cloudflare Workers 作为编排（orchestrator）；
- Cloudflare R2 作为对象存储；
- 容器平台（如 Cloudflare Containers 或任意容器平台）作为执行单元；
- 业务应用（本仓库，TanStack Start / Cloudflare Workers）作为业务前台和数据库读写者。

## 总览架构

- 业务应用（本仓库，TanStack Start / Cloudflare Workers）：
  - 提供业务 UI/接口；
  - 在 Step 3 触发云渲染（字幕、评论、云下载等）；
  - 在终态回调中更新 DB，Step 4 以 `/artifacts/:jobId` 或 R2 预签 URL 提供播放。
- Worker（`cloudflare/media-orchestrator`，桶优先）：
  - `POST /jobs`：创建作业 → 从 per-job manifest 解析输入 key → 检查 R2 是否存在 → 生成 R2 预签名 URL → 触发容器 `/render`；
  - `GET /jobs/:id`：供前端轮询；若 R2 产物就绪则回调业务应用落库；
  - `POST /upload/:id`（可选兜底）：容器可直接 POST 成品；Worker 写入 R2；
  - `GET /artifacts/:id`：从 R2 读取产物（播放/下载代理），支持 Range。
- R2（按媒体聚合 + 含标题 slug）典型结构：
  - `manifests/jobs/{jobId}.json`          — per-job manifest（唯一权威源）；
  - `media/{mediaId}-{titleSlug}/inputs/video/subtitles.mp4`
  - `media/{mediaId}-{titleSlug}/inputs/subtitles/subtitles.vtt`
  - `media/{mediaId}-{titleSlug}/inputs/comments/latest.json`
  - `media/{mediaId}-{titleSlug}/outputs/{jobId}/video.mp4`
  - `media/{mediaId}-{titleSlug}/downloads/{jobId}/{video.mp4,audio.mp3,metadata.json}`
- 容器（`containers/media-downloader`）：
  - `/render`：调用 `yt-dlp` 下载源视频与元数据、`ffmpeg` 提取音轨，将产物上传到 R2。
- 容器（`containers/burner-ffmpeg`）：
  - `/render`：接受 Worker 提供的 R2 预签 GET/PUT URL，执行字幕烧录后写回产物；
  - 日志：每 10% 打印一次进度（如 `30%`），每 30 秒打印一次心跳（`running… <x>%`，可通过 `RENDER_HEARTBEAT_MS` 自定义，设为 `0` 关闭）。

> 说明：旧版本使用过“业务应用直连 fallback URL”，已移除。生产环境统一只走 R2 预签 URL。

生产推荐模式是“仅 R2 直连 + 桶优先输入”：容器只访问 R2，Worker 负责编排与完成检测；业务应用不再承担文件中转。

## 先决条件

- 已开启 Workers 与 R2 的 Cloudflare 账号；
- 创建 R2 桶：建议名 `vidgen-render`（可按需调整；需同步 `wrangler.toml` 中的 `S3_BUCKET_NAME` 和 `r2_buckets` 配置）；
- 可用容器平台：
  - Cloudflare Containers（Workers Paid + Containers Beta）；或
  - 其他容器平台，能暴露一个 Worker 可访问的 HTTPS 端点。

## Worker（Orchestrator）生产配置

代码目录：`cloudflare/media-orchestrator/`  
配置文件：仓库根目录的 `wrangler.toml`。

### 1）绑定 KV、R2 与容器端点

生产配置示意（节选）：

```toml
name = "media-orchestrator"
main = "cloudflare/media-orchestrator/index.ts"
compatibility_date = "2025-10-19"

[[kv_namespaces]]
binding = "JOBS"
id = "<KV_NAMESPACE_ID>"

[[r2_buckets]]
binding = "RENDER_BUCKET"
bucket_name = "vidgen-render"

[vars]
JOB_TTL_SECONDS = 86400

	# 默认容器端点（如使用外部容器平台）
	CONTAINER_BASE_URL = "https://<subtitle-container-endpoint>"
	CONTAINER_BASE_URL_REMOTION = "https://<remotion-container-endpoint>"
	CONTAINER_BASE_URL_DOWNLOADER = "https://<media-downloader-endpoint>"

APP_BASE_URL = "https://<your-app-domain>"              # Worker 回调业务应用
ORCHESTRATOR_BASE_URL_CONTAINER = "https://<your-worker-domain>" # 容器向 Worker 回调时使用的对外地址

# R2 直连（S3 兼容）
S3_ENDPOINT = "https://<accountid>.r2.cloudflarestorage.com"
S3_INTERNAL_ENDPOINT = "https://<internal-r2-endpoint-or-same-as-above>"
S3_BUCKET_NAME = "vidgen-render"
S3_STYLE = "vhost"
S3_REGION = "auto"   # 仓库默认是 "us-east-1"，可根据实际 region 调整

# 签名 URL 有效期（秒）
PUT_EXPIRES = 600
```

> 注意：`S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` 等敏感信息建议通过 `wrangler secret` 注入，而不是写入 `[vars]`。

Worker 内部会根据 `PREFER_EXTERNAL_CONTAINERS` / `NO_CF_CONTAINERS` 判断是否使用 Cloudflare Containers 还是直接访问上面的 `CONTAINER_BASE_URL*`。生产典型方案：

- 使用 Cloudflare Containers：
  - 配置 `[[containers]]` 与 `[[durable_objects.bindings]]`（见仓库当前 `wrangler.toml`）；
  - 在 production 环境变量中保持 `PREFER_EXTERNAL_CONTAINERS = "false"`（默认）；
- 使用外部容器平台：
  - 不配置 `[[containers]]`，只配置 `CONTAINER_BASE_URL*`；
  - 在 production 环境中显式设置 `PREFER_EXTERNAL_CONTAINERS = "true"`。

### 2）桶优先输入与 Job Manifest

每个云任务在启动前，业务应用会写入一份仅针对该任务的清单：`manifests/jobs/<jobId>.json`。结构与开发环境一致：

- `inputs`：本次任务需要访问的 R2 对象 key（视频、字幕、评论、ASR 音频等）；
- `outputs`：本次任务预期写入的 key（调试用）；
- `optionsSnapshot`：从 engine options 抽取的关键信息（`sourcePolicy`、`templateId`、`url` 等）。

物化职责：

- 业务应用：
  - 转写完成 → 写入 `media/{mediaId}-{slug}/inputs/subtitles/subtitles.vtt`；
  - 评论下载/翻译完成 → 写入 `media/{mediaId}-{slug}/inputs/comments/latest.json`；
  - 云下载回调 → 更新 DB 中的 `remoteVideoKey` / `remoteAudioKey` / `remoteMetadataKey`；
  - 启动任务前，根据 DB + 固定路径 + 业务规则生成 `JobManifest` 并写入 `manifests/jobs/<jobId>.json`。
- Worker：
  - 启动任务时只读取该 job 的 manifest，检查 `inputs.*Key` 所指对象是否存在（R2 HEAD + 预签 GET）；
  - 任意必需输入缺失时返回 `missing_inputs`，前端根据错误决定如何提示/重试；
  - 不再依赖 `media/{mediaId}/manifest.json` 之类的 media-level manifest。

#### Source Policy（视频源策略）

`renderer-remotion`（评论视频渲染）的 sourcePolicy 决策完全在业务应用：

- 根据 `sourcePolicy` 和 R2 当前状态选择：
  - 使用云下载结果：`media/{mediaId}-{slug}/downloads/{jobId}/video.mp4`；或
  - 使用已生成的“带字幕视频”：`media/{mediaId}-{slug}/inputs/video/subtitles.mp4`。
- 选择结果写入 `JobManifest.inputs.videoKey`（必要时附带 `subtitlesInputKey`）；
- Worker 仅验证 `videoKey` 是否存在，并为容器生预签 URL；不再做自动回退。

### 3）生产密钥（不要写入 wrangler.toml）

在仓库根目录执行：

```bash
wrangler secret put JOB_CALLBACK_HMAC_SECRET   # 与业务应用一致
wrangler secret put S3_ACCESS_KEY_ID
wrangler secret put S3_SECRET_ACCESS_KEY
```

Workers AI（ASR）凭据不再作为 Worker secret 配置；由业务应用从 DB 读取：

- Admin → AI providers → ASR Providers → `cloudflare`：
  - `Account ID`
  - `API token`

### 4）路由与自定义域

```toml
routes = [
  { pattern = "orchestrator.example.com/*", zone_id = "<ZONE_ID>" }
]
```

同时将 `ORCHESTRATOR_BASE_URL_CONTAINER` 配置为该域名（https）。

### 5）部署

```bash
pnpm cf:deploy
```

## 容器（media-downloader）生产配置

镜像目录：`containers/media-downloader/`

1）构建与推送

```bash
docker build -t <registry>/<project>/media-downloader:<tag> containers/media-downloader
docker push <registry>/<project>/media-downloader:<tag>
```

2）运行参数

- 环境变量：
  - `JOB_CALLBACK_HMAC_SECRET` — 与 Worker 一致，用于容器向 `/callbacks/container` 回调进度/终态；
  - `CLASH_SUBSCRIPTION_URL`（可选）或 `CLASH_RAW_CONFIG` — 统一订阅 / 自定义 Clash 配置；
  - `CLASH_MODE`（默认 `Rule`）、`MIHOMO_PORT`（默认 `7890`）等高级参数。
- 出网：
  - 允许访问源站（YouTube / TikTok 等）；
  - 允许访问 R2 域名（`<bucket>.<accountid>.r2.cloudflarestorage.com` 或企业内网域名）。
- 资源建议：2 vCPU / 2GB RAM；镜像自带 `yt-dlp` 与 `ffmpeg`。

3）服务端点

- 对外暴露 `/render`（POST），Worker 使用 `CONTAINER_BASE_URL_DOWNLOADER` 调用。

> 代理提示：生产环境建议通过数据库 Proxy 表（带 `nodeUrl`、HTTP / SOCKS 节点）或 `CLASH_SUBSCRIPTION_URL` 提供可达出口。容器会在每个任务开始时自动生成 Clash 配置并启动 mihomo，默认监听 `http://127.0.0.1:7890`，无需依赖宿主机的 Clash。

## 容器（burner-ffmpeg）生产配置

镜像目录：`containers/burner-ffmpeg/`

1）构建与推送

```bash
docker build -t <registry>/<project>/burner-ffmpeg:<tag> containers/burner-ffmpeg
docker push <registry>/<project>/burner-ffmpeg:<tag>
```

2）运行参数

- 环境变量：
  - `JOB_CALLBACK_HMAC_SECRET` — 必填，与 Worker 一致；用于向 `/callbacks/container` 回传进度和终态；
  - `RENDER_HEARTBEAT_MS`（可选）— 心跳间隔（毫秒），默认 30000，设为 `0` 可关闭。
- 出网：
  - 允许访问 R2 域名（`<bucket>.<accountid>.r2.cloudflarestorage.com` 或对应内网域名）。
- 资源建议：
  - 2 vCPU / 2–4GB RAM；
  - 镜像已内置 Noto CJK 字体与 fontconfig，ASS 中固定 `Noto Sans CJK SC`。

3）服务端点

- 对外暴露 `/render`（POST），Worker 使用对应的 `CONTAINER_BASE_URL`（或 Cloudflare Containers）调用。

## 业务应用（TanStack Start）生产配置

1）环境变量（Cloudflare Workers vars/secrets）

应用运行在 Cloudflare Workers（wrangler）中：

- 非敏感配置放在 `wrangler.root.jsonc` 的 `vars`（例如 `CF_ORCHESTRATOR_URL`）。
- 密钥用 `wrangler secret put` 注入（例如 `JOB_CALLBACK_HMAC_SECRET`）。

示例（以 root 挂载为例）：

```bash
wrangler secret put JOB_CALLBACK_HMAC_SECRET --config wrangler.root.jsonc
```

可选：启用工作区 Basic Auth（见 `src/worker.ts`）：

```bash
wrangler secret put WORKSPACE_AUTH_USERNAME --config wrangler.root.jsonc
wrangler secret put WORKSPACE_AUTH_PASSWORD --config wrangler.root.jsonc
```

并在对应 `wrangler*.jsonc` 的 `vars` 中设置：`WORKSPACE_PROTECT = "1"`。

2）部署方式

- 部署目标：Cloudflare Workers（wrangler）。
- 相关配置与脚本：
  - `wrangler.root.jsonc` + `pnpm deploy:root`：将应用挂载到站点根路径（`/*`）。
- 生产前检查：
  - `CF_ORCHESTRATOR_URL` 指向生产 orchestrator Worker；
  - `JOB_CALLBACK_HMAC_SECRET` 与 orchestrator/容器回调保持一致；
  - D1 `DB` 绑定配置正确，并已执行迁移（`pnpm db:d1:migrate:remote`）。

## 运行时开关与安全建议

### 运行时开关

主要来自 `wrangler.toml` 的 `[vars]`：

- `PREFER_EXTERNAL_CONTAINERS`：
  - `"false"`（默认）：若配置了 `[[containers]]` + Durable Object binding，则优先使用 Cloudflare Containers；
  - `"true"`：总是使用外部容器 URL（`CONTAINER_BASE_URL*`），忽略 Cloudflare Containers。
- `NO_CF_CONTAINERS`：
  - `"true"` 时强制禁用 Cloudflare Containers（通常用于 dev-lite）。
- `PUT_EXPIRES`：
  - R2 预签 PUT URL 的有效期（秒），开发默认 600，生产可适度提高（例如 1800）。

### 安全建议

- HMAC：
  - Worker ↔ 业务应用、容器 ↔ Worker 回调统一使用 `JOB_CALLBACK_HMAC_SECRET` 验签；
  - 回调体包含 `ts` / `nonce` 等字段，Worker KV 可实现一定的防重放。
- 最小权限：
  - R2 预签名 URL 建议只赋予单对象 GET/PUT 权限；
  - 设置合理的有效期（5–30 分钟）。
- 速率与并发：
  - Worker 对 `/jobs` 做速率限制与并发阈值；
  - 容器内部也应限制同时运行的作业数，避免资源耗尽。
- 访问控制：
  - `/callbacks/container` 与 `/upload/:jobId` 最好只在内网或 Zero Trust 后面开放；
  - 生产推荐只走 R2 直连，减少业务应用/容器对外暴露面。

## 观测与告警

- 指标：
  - 作业时长 P50 / P95、失败率、队列深度（如有队列）、容器并发数、R2 出入带宽/存储。
- 日志：
  - 统一打 `jobId`，便于串联 Worker、容器、业务应用；
  - 记录阶段（`preparing` / `running` / `uploading` / `completed`）和耗时；
  - 业务应用回调成功/失败均打印。
- 告警：
  - 失败率/时长阈值告警；
  - R2 存储/出网费用阈值提醒。

## 灰度与回滚

- 灰度：
  - 按用户 / 媒体 / 百分比开关“云端渲染”，观察 24–48 小时；
  - 在开关级别记录 metrics 标签，便于比较效果。
- 快速回滚：
  - 通过特性开关或环境变量临时关闭字幕渲染入口（Step 3），停用 `/jobs` 调度；
  - 必要时回滚至上一版本 Worker / 业务应用代码。

## 冒烟测试（生产）

1. 上传 10–30 秒小样视频，触发 Step 3（Cloud）。
2. 观察 Worker 日志：
   - `start job ...` → 无错误；
   - 容器日志有 `inputs ready`、`xx%`、心跳日志。
3. `GET /jobs/:id`：
   - 状态从 `queued` → `running`（或 `preparing`）→ 检测到 R2 `outputs/...` → `completed`。
4. 业务应用日志：
   - 出现 `[cf-callback] recorded remote artifact for job <jobId>`；
   - 页面自动跳转至 Step 4，并能通过 orchestrator `/artifacts/:jobId` 播放。
5. 针对云端下载：
   - 在下载页面选择 Cloud；
   - 确认 `/jobs/:id` 从 `queued` → `running` → `completed`；
   - R2 中出现 `downloads/<mediaId>/<jobId>/{video.mp4,audio.mp3,metadata.json}`；
   - 业务应用日志有 “Cloud download completed” 类似信息。

## 常见问题

- 容器访问不到 Worker：
  - 检查容器是否能解析/访问 `ORCHESTRATOR_BASE_URL_CONTAINER`；
  - 若使用内网域名，确保 DNS 和网络策略正确。
- 容器访问不到 R2：
  - 确认容器网络策略允许访问 `S3_INTERNAL_ENDPOINT`；
  - 检查 `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` 是否注入正确。
- 字体不一致/缺字：
  - burner-ffmpeg 镜像已安装 Noto CJK + fontconfig，ASS 中固定 `Noto Sans CJK SC`；
  - 如需更多字体，可自行扩展镜像。
- 颜色/兼容性差异：
  - ffmpeg 统一编码参数建议：
    - `-c:v libx264 -pix_fmt yuv420p -crf 18 -preset medium -c:a aac -b:a 160k -movflags +faststart`。
- 400 `jobId required`：
  - 仅在生成 jobId 并成功写入 manifest 后再开始轮询；
  - 前端已按此修复，若出现请排查调用顺序。
