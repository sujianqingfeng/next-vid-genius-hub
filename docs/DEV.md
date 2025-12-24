# 本地开发同生产的同构方案（Cloudflare R2 直连）

目标：让本地开发与生产路径尽量一致，容器仅访问对象存储（S3 兼容）与编排（Worker），不再直接访问业务应用。业务应用（TanStack Start）主要负责 UI、DB 和写入 per-job manifest。

## 组件

- Cloudflare R2（S3 兼容）作为统一对象存储（本地/线上共一个桶，例如 `vidgen-render`）。
- 渲染/下载容器：
  - `burner-ffmpeg`：字幕烧录渲染。
  - `renderer-remotion`：评论视频渲染。
  - `media-downloader`：云端下载（yt-dlp + ffmpeg）。
- Worker（`workers/media-orchestrator`，wrangler dev）负责（桶优先）：
  - 只通过 per-job manifest + R2 HEAD 检测输入，不再从业务应用拉取文件；
  - 生成 S3 预签名 URL（GET/PUT），只把 URL 下发给容器；
  - 触发容器 `/render` 并在 Durable Object 中维护强一致状态；
  - 轮询时通过 HEAD 检测桶内产物；完成后回调业务应用落库；
  - ASR（`asr-pipeline`）由 Worker 直接调用 Workers AI 并写回产物。
- 业务应用（本仓库，TanStack Start / Cloudflare Workers）：
  - 提供 UI / API；
  - 通过 ORPC 创建云任务、写入 per-job manifest、让 Worker 编排；
  - 通过 `CF_ORCHESTRATOR_URL` 访问 orchestrator（例如 `http://localhost:8787` 或生产域名）。

### `src/lib` 目录约定

- 领域模块：`auth` / `media` / `subtitle`（含 ASR） / `points` / `providers` / `ai` / `job`
- 基础设施：`config` / `db` / `logger` / `storage` / `proxy` / `orpc` / `query` / `cloudflare`
- 横切：`errors` / `hooks` / `utils` / `types`
- 规则：
  - 领域内的 types/hooks/utils/server 均放在 `src/lib/<domain>/**`。
  - `src/lib/types` 仅放跨领域类型（例如 provider 类型）；领域内类型放在各自 `src/lib/<domain>/types`。
  - `src/lib/utils` / `src/lib/hooks` 只放真正通用的工具；不要在这里新增领域特定逻辑。
  - 与 Cloudflare orchestrator / R2 交互的代码统一放在 `apps/web/src/lib/cloudflare/**`。

## 启动本地容器

推荐使用脚本（便于和 wrangler.toml 保持一致）：

```bash
pnpm dev:stack
# 或停止并清理
pnpm dev:stack:down
```

该脚本实际等价于：

```bash
docker compose -f docker-compose.dev.yml up -d \
  burner-ffmpeg renderer-remotion media-downloader
```

Compose 只负责拉起各类媒体容器；对象存储直接指向 Cloudflare R2，不再运行 MinIO。

容器暴露端口（保持与 `wrangler.toml` 一致）：

- burner-ffmpeg: `http://localhost:9080`
- renderer-remotion: `http://localhost:8190`
- media-downloader: `http://localhost:8100`

### 本地代理（Clash / Mihomo）

- `media-downloader` 容器会在任务开始时自动生成 Clash(Mihomo) 配置：
  - 优先使用数据库 Proxy 表中传递的 `nodeUrl`（SSR / Trojan / VLESS 等）或 HTTP(S) / SOCKS 参数；
  - 若未提供节点，可通过环境变量注入订阅地址：
    - `CLASH_SUBSCRIPTION_URL=https://example.com/subscription.yaml`
  - 也可使用 `CLASH_RAW_CONFIG` 直接提供完整的 Clash YAML。
- 默认在容器内部开放 `http://127.0.0.1:7890`，yt-dlp / ffmpeg 会通过该端口访问外网。
- 遇到无法连通的情况时，请确认：
  - 订阅 URL 可被容器访问；
  - 或为数据库中的代理补充可用的 SSR / HTTP 节点。

## Worker 本地配置

`workers/media-orchestrator/wrangler.toml` 已配置：

```toml
name = "media-orchestrator"
main = "index.ts"
tsconfig = "tsconfig.json"
compatibility_date = "2025-10-19"

[dev]
port = 8787
local_protocol = "http"

[[r2_buckets]]
binding = "RENDER_BUCKET"
bucket_name = "vidgen-render"

[vars]
JOB_TTL_SECONDS = 86400
	CONTAINER_BASE_URL = "http://localhost:9080"
	CONTAINER_BASE_URL_REMOTION = "http://localhost:8190"
	CONTAINER_BASE_URL_DOWNLOADER = "http://localhost:8100"
	# 业务应用（TanStack Start）默认 `pnpm dev:web` 跑在 3100（根目录 `pnpm dev` 也会转发到 web）。
	APP_BASE_URL = "http://localhost:3100"
	JOB_CALLBACK_HMAC_SECRET = "replace-with-strong-secret"
	PUT_EXPIRES = 7200

# R2 直连
S3_ENDPOINT = "https://<account>.r2.cloudflarestorage.com"
S3_INTERNAL_ENDPOINT = "https://<account>.r2.cloudflarestorage.com"
S3_BUCKET_NAME = "vidgen-render"
S3_STYLE = "vhost"
S3_REGION = "us-east-1"
ORCHESTRATOR_BASE_URL_CONTAINER = "http://host.docker.internal:8787"
```

> 注意：本地默认 `S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY` 建议通过 `wrangler secret` 注入，而不是写在 `wrangler.toml`。

### 推荐启动方式（外部容器）

- 启动 orchestrator：`pnpm cf:dev`
- 启动外部容器：`pnpm dev:stack`

### 本地环境（env.local-lite）

`wrangler.toml` 中提供了多个环境（例如 `local-lite`、`production`）。本地开发推荐使用 `local-lite`（外部 Docker 容器 + R2 直连）：

```toml
[env.local-lite.vars]
PREFER_EXTERNAL_CONTAINERS = "true"
NO_CF_CONTAINERS = "true"
```

在 Worker 代码中：

- 只要 `PREFER_EXTERNAL_CONTAINERS === "true"` 或 `NO_CF_CONTAINERS === "true"`：
  - 就直接通过 `CONTAINER_BASE_URL*` 的 HTTP 地址调用外部 Docker 容器；
  - 而不是使用 Cloudflare Containers 的 Durable Object binding。

因此当前本地行为是（`env.local-lite`）：

- `pnpm cf:dev`（env.local-lite）
  - 启动本地 Worker，只使用外部 Docker 容器（与 `docker-compose.dev.yml` 对齐）；
  - 通过 `NO_CF_CONTAINERS` 禁用 Cloudflare Containers 相关逻辑。

若未来需要在本地验证 Cloudflare Containers，可以再补回 `wrangler.toml` 的 `[[containers]]` 与对应 DO bindings。

运行 Worker：

```bash
pnpm cf:dev # 使用外部 Docker 容器，不使用 CF Containers
```

### Workers AI（ASR）凭据（方案 A）

字幕 Step 1 若选择 Cloud（触发 `asr-pipeline`），Workers AI 的凭据由 **业务应用从 DB 读取**：

- Admin → AI providers → ASR Providers → `cloudflare`：
  - `Account ID`：Cloudflare account id
  - `API token`：具有 Workers AI 访问权限的 API Token

未配置会在 Worker 触发 ASR 时由业务应用接口返回错误：`Cloudflare ASR provider credentials not configured in DB`。

验证方式：

1. 在字幕页 Step 1 选择 `provider=cloudflare`；
2. 将“降采样后端”设为 `cloud` 或 `auto`；
3. 触发转录后，wrangler 控制台不应再出现凭据缺失报错；
4. `/jobs/:id` 会在 ASR 完成后返回 `vtt` + `words.json` 产物。

补充说明（ASR 模型配置）：

- Cloudflare ASR 的请求/返回参数与能力（如是否支持 `language`、音频传参格式）与 `modelId` 强绑定；
- 后台 `ASR Models` 仅允许配置已支持的 `modelId`，能力参数由系统推导且不可手工覆盖；
- 历史遗留的 `ai_models.capabilities`（ASR）字段会被忽略；如需清理可执行：
  - `UPDATE ai_models SET capabilities = NULL WHERE kind = 'asr';`

## 业务应用（TanStack Start）本地

本仓库的业务应用基于 TanStack Start，运行在 Cloudflare Workers（`nodejs_compat`）上：

- Worker 入口：`apps/web/src/worker.ts`（负责注入 D1 并启动 TanStack Start handler）。
- 本地启动配置：`apps/web/wrangler.root.jsonc`（`env.local`）。
- 构建产物：`dist/server/index.js` + `dist/client/**`（Vite 构建）。
- DB：Cloudflare D1（`binding = "DB"`）。本地/远端迁移命令见 `package.json` 的 `db:d1:*` scripts。

启动（推荐，最接近生产 Worker 行为）：

```bash
pnpm dev:web
```

可选：仅在需要更快的前端迭代时使用 Vite dev server（与 Worker 行为存在差异）：

```bash
pnpm dev:web:vite
```

业务应用不再承担媒体文件中转，所有媒体 IO 通过 orchestrator Worker + R2 完成。

## 桶优先与每任务清单（Job Manifest）

### R2 路径约定

所有路径集中定义在 `@app/media-domain` 的 `bucketPaths` 中，典型例子（按 `mediaId` + 标题 slug 聚合）：

- per-job manifest：
  - `manifests/jobs/<jobId>.json`
- 字幕相关输入：
  - `media/{mediaId}-{slug}/inputs/video/subtitles.mp4`
  - `media/{mediaId}-{slug}/inputs/subtitles/subtitles.vtt`
- 评论：
  - `media/{mediaId}-{slug}/inputs/comments/latest.json`
- 云下载：
  - `media/{mediaId}-{slug}/downloads/{jobId}/video.mp4`
  - `media/{mediaId}-{slug}/downloads/{jobId}/audio.mp3`
  - `media/{mediaId}-{slug}/downloads/{jobId}/metadata.json`
- 云渲染输出：
  - `media/{mediaId}-{slug}/outputs/{jobId}/video.mp4`
- ASR：
  - `media/{mediaId}-{slug}/asr/processed/{jobId}/audio.mp3`
  - `media/{mediaId}-{slug}/asr/results/{jobId}/transcript.vtt`
  - `media/{mediaId}-{slug}/asr/results/{jobId}/words.json`

> 旧文档中出现的 `inputs/videos/subtitles/<mediaId>.mp4` 等路径已废弃，统一改为上面的 slug 格式路径。

### Job Manifest 形状

每个异步任务在启动前会写入一份清单：`manifests/jobs/<jobId>.json`：

```json
{
  "jobId": "job_xyz",
  "mediaId": "abc123",
  "engine": "burner-ffmpeg",
  "createdAt": 1733900000000,
  "inputs": {
    "videoKey": "media/abc123-xxx/downloads/job_dl/video.mp4",
    "vttKey": "media/abc123-xxx/inputs/subtitles/subtitles.vtt",
    "sourcePolicy": "original"
  },
  "outputs": {
    "videoKey": "media/abc123-xxx/outputs/job_xyz/video.mp4"
  },
  "optionsSnapshot": {
    "subtitleConfig": { "fontSize": 36 }
  }
}
```

字段说明（简化版）：

- `jobId` / `mediaId` / `engine` / `createdAt`：任务元信息；
- `inputs`：本次任务需要的远端 Key（例如 `videoKey` / `vttKey` / `commentsKey` / `asrSourceKey` 等）；
- `outputs`：可选，记录本次任务预期写入的产物 Key（调试用）；
- `optionsSnapshot`：从当时的 engine options 抽取的配置快照（例如 `sourcePolicy`、`templateId`、`url` 等）。

物化职责：

- 业务应用：
  - 转写完成后写入：`media/{mediaId}-{slug}/inputs/subtitles/subtitles.vtt`；
  - 评论下载/翻译后写入：`media/{mediaId}-{slug}/inputs/comments/latest.json`；
  - 云下载回调时更新 DB 中的 `remoteVideoKey` / `remoteAudioKey` / `remoteMetadataKey`；
  - 启动任意云任务前，根据 DB + 固定路径 + 业务逻辑，构造该 job 的 `JobManifest` 并写入 `manifests/jobs/<jobId>.json`。
- Worker：
  - 启动任务时只读取对应的 `JobManifest`，使用 `inputs.*Key` 通过 S3 HEAD + 预签 GET 检查/生成容器输入；
  - 若必需输入缺失，直接返回 `missing_inputs`，前端根据错误决定如何提示/重试；
  - Worker 不再读取 media-level manifest（旧的 `media/{mediaId}/manifest.json`）。

### Source Policy（视频源策略）

`renderer-remotion` 引擎（用于“评论视频渲染”）的 `sourcePolicy` 逻辑完全在业务应用侧完成：

- 业务应用根据 `sourcePolicy` 和 R2 当前状态选择：
  - 使用下载结果：`media/{mediaId}-{slug}/downloads/{jobId}/video.mp4`；或
  - 使用已渲染的“带字幕视频”变体：`media/{mediaId}-{slug}/inputs/video/subtitles.mp4`。
- 选择结果写入 `JobManifest.inputs.videoKey`（必要时附带 `subtitlesInputKey` 或其它辅助字段）；
- Worker 只检查 `videoKey` 对应对象是否存在，并为容器生成预签 URL；不会根据 `mediaId` 自行回退。

## 本地数据落地（operations 目录）与远端产物

- 本地 `./operations` 仅用于个别操作（例如本地调试、过渡逻辑）的中间文件；
- 云端下载 / 渲染完成后默认只记录远端 Key 和 `downloadJobId`：
  - 不再将视频 / 音频 / metadata 持久写入 `./operations/<mediaId>/`；
- 预览 / 播放通过：
  - Worker 的 `/artifacts/:jobId`；
  - 或通过 orchestrator 的 `/debug/presign` 生成的 R2 预签 GET URL。

## 冒烟测试（本地）

1. 启动容器和 Worker：
   - `pnpm dev:stack`
   - `pnpm cf:dev`
2. 启动业务应用：
   - `pnpm dev:web`（或根目录 `pnpm dev`）
3. 上传 10–30 秒小样视频，选择 Cloud 流程触发字幕渲染：
   - 确认 Worker 日志有 `start job ...`，容器日志有进度与心跳；
   - `/jobs/:id` 状态从 `queued` → `running` → `completed`；
   - 页面能通过 orchestrator `/artifacts/:jobId` 顺利播放。
