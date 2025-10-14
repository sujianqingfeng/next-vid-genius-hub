# 本地开发同生产的同构方案（MinIO + S3 预签名）

目标：让本地开发与生产路径一致，容器仅访问对象存储（S3 兼容）与编排（Worker），不依赖 `localhost/host.docker.internal`。

## 组件

- MinIO（S3 兼容）作为本地对象存储
- 渲染容器 `burner-ffmpeg`（仅访问 S3）
- Worker（wrangler dev）负责：
  - 读取 Next 的 `/api/media/:id/{source|subtitles}`，镜像到 S3（MinIO）
  - 生成 S3 预签名 URL（GET/PUT）
  - 触发容器 /render，仅下发 S3 URL
  - 轮询时 HEAD S3 输出对象，完成后回调 Next 落库

## 启动 MinIO 与容器

```bash
docker compose -f docker-compose.dev.yml up -d
```

Docker Compose 会同时编译/启动下列服务：MinIO、burner-ffmpeg、renderer-remotion、media-downloader。

MinIO 控制台：`http://localhost:9001`（账号/密码：`minioadmin`/`minioadmin`）

首次登录后创建桶：`vidgen-render`

### 本地代理（Clash / Mihomo）

- `media-downloader` 容器会在任务开始时自动生成 Clash(Mihomo) 配置：
  - 优先使用数据库 Proxy 表中传递的 `nodeUrl`（SSR / Trojan / VLESS 等）或 HTTP(S) / SOCKS 参数；
  - 若未提供节点，可在 Compose 中通过环境变量注入订阅地址，例如：`CLASH_SUBSCRIPTION_URL=https://example.com/subscription.yaml`；
  - 也可使用 `CLASH_RAW_CONFIG` 直接提供完整的 Clash YAML。
- 默认在容器内开放 `http://127.0.0.1:7890`，yt-dlp/ffmpeg 会通过该端口访问外网。
- 遇到无法连通的情况时，请确认订阅 URL 可被容器访问，或为数据库中的代理补充可用的 SSR/HTTP 节点。

## Worker 本地配置

编辑 `cloudflare/media-orchestrator/wrangler.toml`，在 `[vars]` 中设置：

```toml
S3_ENDPOINT = "http://127.0.0.1:9000"   # MinIO API
S3_INTERNAL_ENDPOINT = "http://minio:9000" # 容器内部访问 MinIO
S3_STYLE = "path"                        # 路径风格
S3_ACCESS_KEY_ID = "minioadmin"
S3_SECRET_ACCESS_KEY = "minioadmin"
S3_BUCKET_NAME = "vidgen-render"
NEXT_BASE_URL = "http://localhost:3000"
CONTAINER_BASE_URL = "http://localhost:8080"        # 字幕烧录容器
CONTAINER_BASE_URL_REMOTION = "http://localhost:8090"  # 评论渲染容器
CONTAINER_BASE_URL_DOWNLOADER = "http://localhost:8100" # Cloud 下载容器
```

运行 Worker：

```bash
pnpm cf:dev
```

## Next 本地

```bash
pnpm dev:host   # 监听 0.0.0.0:3000（供 Worker 拉取源素材）
```

### 本地是否回传大文件（ENABLE_LOCAL_HYDRATE）

- 默认：`ENABLE_LOCAL_HYDRATE=true`，回调后会把云端下载/渲染产物（视频/音频/metadata）落到 `OPERATIONS_DIR/<mediaId>/`，方便后续本地处理与调试。
- 若磁盘紧张或希望完全走 R2 播放链路，可在 `.env` 设置 `ENABLE_LOCAL_HYDRATE=false`，此时仅保存远端 Key；预览/播放通过 Worker 预签 URL 或 `/artifacts/:jobId` 进行。

## 流程验证

1) 在字幕流程 Step 3 或下载页选择 Cloud → 启动任务。
2) Worker 日志：
   - `start job` → `mirror inputs to S3` → `trigger container`。
3) 容器日志：
   - 字幕渲染：`preparing` → `inputs ready` → `ffmpeg done` → `uploading artifact`。
- 云端下载：`preparing` → `fetching_metadata` → `downloading` → `extracting_audio` → `uploading`。
4) 轮询 /jobs/:id：
   - 渲染：R2 出现 `outputs/by-media/<mediaId>/<jobId>/video.mp4` 即标记完成。
- 下载：R2 出现 `downloads/<mediaId>/<jobId>/{video.mp4,audio.mp3,metadata.json}` 后标记完成。
5) Next 日志打印 `[cf-callback] ... job <jobId>`，并将产物落库到 `.operations/<mediaId>/`。
6) 前端自动刷新：渲染流程跳到 Step 4 预览；下载页出现“Cloud download completed”并可继续字幕流程。

## 注意事项

- 若 MinIO 与 Worker 不在同一网络（wrangler dev 在宿主机），将 `S3_ENDPOINT` 设置为 `http://127.0.0.1:9000`。
- 若使用 compose 内网络，则把 `S3_ENDPOINT` 设为 `http://minio:9000` 并在容器中运行 wrangler。
- 不建议在本地模式下再使用 `/upload` 或容器回调；S3 直连路径更稳、更贴近生产。
 - 新逻辑将 jobId 持久化在浏览器（`subtitleCloudJob:<mediaId>`），刷新后自动恢复轮询；页面失焦会暂停轮询、聚焦恢复。
