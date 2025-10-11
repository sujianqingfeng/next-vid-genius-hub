# 生产环境部署与配置（Workers + R2 + Container）

本文档指导将“字幕云端渲染（方案 C：进行中轮询 + 终态回调）”部署到生产环境，采用 Cloudflare Workers 作为编排、R2 作为对象存储、容器（如 Cloudflare Containers 或任意容器平台）作为渲染执行单元。并说明本地兜底路径与回滚方案。

## 总览架构

- Next 应用（本仓库）：提供业务 UI/接口；在 Step 3 触发云渲染；在终态回调中落库并供 Step 4 预览。
- Worker（cloudflare/media-orchestrator）：
  - /jobs：创建作业 → 将输入镜像至 R2 → 生成 R2 预签名 URL → 触发容器 /render。
  - /jobs/:id：供前端轮询；检测 R2 是否产生输出；若完成则回调 Next 落库。
  - /upload/:id（兜底模式）：本地/开发时容器可直接 POST 成品到此处；Worker 写入 R2。
  - /artifacts/:id（兜底模式）：从 R2 读取产物。
- R2：
  - inputs/videos/{mediaId}.mp4
  - inputs/subtitles/{mediaId}.vtt
  - outputs/by-media/{mediaId}/{jobId}/video.mp4
  - downloads/{mediaId}/{jobId}/video.mp4
  - downloads/{mediaId}/{jobId}/audio.mp3
  - downloads/{mediaId}/{jobId}/metadata.json
- 容器（containers/media-downloader）：
  - /render：调用 `yt-dlp` 下载源视频与原始元数据、`ffmpeg` 提取音轨，将产物上传至 R2。
- 容器（containers/burner-ffmpeg）：
  - /render：接受 R2 预签名 URL（生产）或 fallback URL（开发），执行 ffmpeg 烧录后写回产物。

生产使用“仅 R2 直连”：容器仅访问 R2，Worker 负责编排与检测完成；不依赖 localhost/host.docker.internal。

## 先决条件

- Cloudflare 账号，开启 Workers 与 R2。
- 创建 R2 桶：建议名 `vidgen-render`（可改，需同步 wrangler 配置）。
- 可用的容器平台（Cloudflare Containers 或其它），能暴露一个公网或内网可达的 HTTPS 端点给 Worker。

## Worker（Orchestrator）生产配置

目录：`cloudflare/media-orchestrator/`

1) 绑定 KV 与 R2（wrangler.toml）

```toml
name = "media-orchestrator"
main = "index.ts"
compatibility_date = "2024-05-01"
workers_dev = false  # 生产建议关闭，使用 routes

[[kv_namespaces]]
binding = "JOBS"
id = "<KV_NAMESPACE_ID>"

[[r2_buckets]]
binding = "RENDER_BUCKET"
bucket_name = "vidgen-render"  # 与实际桶名一致

[vars]
JOB_TTL_SECONDS = 86400
CONTAINER_BASE_URL = "https://<subtitle-container-endpoint>"
CONTAINER_BASE_URL_REMOTION = "https://<remotion-container-endpoint>"
CONTAINER_BASE_URL_DOWNLOADER = "https://<media-downloader-endpoint>"
NEXT_BASE_URL = "https://<your-next-app-domain>"         # 供 Worker 回调 Next 使用
ORCHESTRATOR_BASE_URL_NEXT = "https://<your-worker-domain>" # 供 Next 拉取 artifacts（兜底）

# R2 直连（强烈建议生产启用）
R2_S3_ENDPOINT = "<accountid>.r2.cloudflarestorage.com"
R2_ACCESS_KEY_ID = "<access-key>"
R2_SECRET_ACCESS_KEY = "<secret-key>"
R2_BUCKET_NAME = "vidgen-render"
```

2) 生产密钥（不要写入 wrangler.toml）

```bash
wrangler secret put JOB_CALLBACK_HMAC_SECRET   # 与 Next 的 .env 同值
```

3) 路由与自定义域

```toml
routes = [
  { pattern = "orchestrator.example.com/*", zone_id = "<ZONE_ID>" }
]
```

4) 部署

```bash
pnpm cf:deploy
```

## 容器（media-downloader）生产配置

镜像：`containers/media-downloader/`

1) 构建与推送

```bash
docker build -t <registry>/<project>/media-downloader:<tag> containers/media-downloader
docker push <registry>/<project>/media-downloader:<tag>
```

2) 运行参数

- 环境变量：
  - `JOB_CALLBACK_HMAC_SECRET`
  - `CLASH_SUBSCRIPTION_URL`（可选）或 `CLASH_RAW_CONFIG`，用于统一订阅/自定义 Clash 配置。
  - `CLASH_MODE`（默认 `Rule`）、`MIHOMO_PORT`（默认 `7890`）等可按需覆盖。
- 出网：允许访问源站（YouTube / TikTok 等）、R2 对象存储域名。
- 资源建议：2 vCPU / 2GB RAM；镜像自带 `yt-dlp` 与 `ffmpeg`。

3) 服务端点

- 对外暴露 `/render`（POST），Worker 使用 `CONTAINER_BASE_URL_DOWNLOADER` 调用。

> **代理提示**：生产环境建议通过数据库 Proxy 表（带 `nodeUrl`、HTTP / SOCKS 节点）或 `CLASH_SUBSCRIPTION_URL` 提供可达的出口。容器会在每个任务开始时自动生成 Clash 配置并启动 mihomo，默认监听 `http://127.0.0.1:7890`，无需依赖宿主机的 Clash。

## 容器（burner-ffmpeg）生产配置

镜像：`containers/burner-ffmpeg/`

1) 构建与推送

```bash
docker build -t <registry>/<project>/burner-ffmpeg:<tag> containers/burner-ffmpeg
docker push <registry>/<project>/burner-ffmpeg:<tag>
```

2) 运行参数

- 环境变量：
  - `JOB_CALLBACK_HMAC_SECRET`（与 Worker 保持一致；若启用 R2 直连，此变量只用于 fallback 回调）
- 出网：允许访问 R2 域名 `<bucket>.<accountid>.r2.cloudflarestorage.com`。
- 资源建议：2 vCPU / 2–4GB RAM；带 Noto CJK 字体与 fontconfig（镜像已内置）。

3) 服务端点

- 对外暴露 `/render`（POST），Worker 使用 `CONTAINER_BASE_URL` 调用。

## Next（本仓库）生产配置

1) 环境变量（.env / 平台配置）

```bash
CF_ORCHESTRATOR_URL=https://orchestrator.example.com
JOB_CALLBACK_HMAC_SECRET=<与 Worker 一致>
# 可选：R2_PUBLIC_BASE_URL=
```

2) 部署方式

- Vercel / 自建 Next Server / 其他平台均可；需要允许 Next 主动访问 Worker（对外网可达）。

## 模式与回退

- 生产（推荐）：设置 `R2_S3_*`，容器仅与 R2 交互，Worker 检测 R2 输出完成 → 回调 Next 落库。
- 开发兜底：未设置 `R2_S3_*` 时：
  - 容器从 Next 拉 `source/subtitles`；产物 POST 到 Worker `/upload/:jobId`；仍能完整闭环。

## 安全建议

- HMAC：Worker↔Next、容器↔Worker 回调均使用 `JOB_CALLBACK_HMAC_SECRET` 验签；回调体包含 `ts`/`nonce`，Worker KV 做 10 分钟防重放。
- 最小权限：R2 预签名 URL 有效期建议 5–10 分钟，且仅赋予单对象 GET/PUT。
- 速率与并发：Worker 对 `/jobs` 做速率限制与并发阈值；容器设置最大并发。
- 访问控制：可将 `/callbacks/container` 与 `/upload/:jobId` 只暴露在内网或通过 Zero Trust 保护（生产下推荐仅走 R2 直连，减少开放面）。

## 观测与告警

- 指标：作业时长 P50/P95、失败率、队列深度（如接入队列）、容器并发、R2 出入量。
- 日志：统一打 `jobId`；Worker/容器均记录阶段与耗时；Next 回调成功/失败打印。
- 告警：失败率/时长阈值告警；R2 存储/出网费用阈值提醒。

## 灰度与回滚

- 灰度：按用户或百分比开关“云端渲染”，观察 24–48 小时指标。
- 快速回滚：切换 Next 的 `renderBackend` 开关为 `local` 或关闭 R2_S3_* 退回兜底路径；或临时停止调用 `/jobs`。

## 冒烟测试（生产）

1) 上传 10–30 秒小样视频，手动触发 Step 3（Cloud）。
2) Worker 日志：`start job ...` → 无错误；容器日志：`inputs ready` → `ffmpeg done`。
3) 轮询 /jobs/:id：status 从 `queued`→`running`（或 `preparing`）→ 检测到 R2 `outputs/...` → `completed`。
4) Next 日志出现 `[cf-callback] recorded remote artifact for job <jobId>`，页面自动跳到 Step 4 可播放（Next 代理 Worker `/artifacts/:jobId`，支持 Range）。
5) 针对云端下载：在下载页选择 Cloud，确认 Worker /jobs/:id 状态从 `queued` → `running` → `completed`，Next 日志输出“Cloud download completed”并在 `operations/<mediaId>` 下生成 mp4/mp3/metadata.json。

## 常见问题

- 容器访问不到 Next/Worker：生产请启用 R2 直连，不依赖 host.docker.internal/localhost。
- 字体不一致/缺字：容器镜像已安装 Noto CJK + fontconfig，并在 ASS 中固定 `Noto Sans CJK SC`。
- 颜色/兼容性差异：两端编码参数统一为 `-c:v libx264 -pix_fmt yuv420p -crf 18 -preset medium -c:a aac -b:a 160k -movflags +faststart`。
- 400 `jobId required`：仅在生成 jobId 后再开始轮询；前端已修复。
