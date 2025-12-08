# 本地开发同生产的同构方案（Cloudflare R2 直连）

目标：让本地开发与生产路径一致，容器仅访问对象存储（S3 兼容）与编排（Worker），不依赖 `localhost/host.docker.internal`。

## 组件

- Cloudflare R2（S3 兼容）作为统一对象存储（本地/线上同桶）
- 渲染容器 `burner-ffmpeg`（仅访问 S3）
- Worker（wrangler dev）负责（桶优先）：
  - 直接从桶读取/检测输入（`inputs/...` 或 manifest 指针），不再从 Next 拉取源数据
  - 生成 S3 预签名 URL（GET/PUT），仅将 URL 下发给容器
  - 触发容器 `/render` 并在 Durable Object 中维护强一致状态
  - 轮询时通过 HEAD 检测桶内产物；完成后回调 Next 落库
  - 当字幕渲染完成时，自动将成品物化到 `inputs/videos/subtitles/<mediaId>.mp4`，并写入 `manifest.subtitlesInputKey`

## 启动容器

```bash
docker compose -f docker-compose.dev.yml up -d burner-ffmpeg renderer-remotion media-downloader audio-transcoder
```

Compose 只负责拉起各类媒体容器；对象存储直接指向 Cloudflare R2，无需再运行 MinIO。

### 本地代理（Clash / Mihomo）

- `media-downloader` 容器会在任务开始时自动生成 Clash(Mihomo) 配置：
  - 优先使用数据库 Proxy 表中传递的 `nodeUrl`（SSR / Trojan / VLESS 等）或 HTTP(S) / SOCKS 参数；
  - 若未提供节点，可在 Compose 中通过环境变量注入订阅地址，例如：`CLASH_SUBSCRIPTION_URL=https://example.com/subscription.yaml`；
  - 也可使用 `CLASH_RAW_CONFIG` 直接提供完整的 Clash YAML。
- 默认在容器内开放 `http://127.0.0.1:7890`，yt-dlp/ffmpeg 会通过该端口访问外网。
- 遇到无法连通的情况时，请确认订阅 URL 可被容器访问，或为数据库中的代理补充可用的 SSR/HTTP 节点。

## Worker 本地配置

`cloudflare/media-orchestrator/wrangler.toml` 已默认将 `S3_ENDPOINT/S3_INTERNAL_ENDPOINT` 指向 Cloudflare R2（`https://<account>.r2.cloudflarestorage.com`，`S3_STYLE=vhost`）。确保 `.env` 中提供 `S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY`（使用 `wrangler secret put` 注入生产环境）即可。若短暂离线需要回退 MinIO，可临时改成 MinIO 端点并自行运行 MinIO。

运行 Worker：

```bash
pnpm cf:dev
```

### Workers AI（ASR）凭据（方案 A）

字幕 Step 1 若选择 Cloud（或降采样后端为 cloud/auto 触发 asr-pipeline），Worker 需要有 Workers AI 的 REST 凭据，否则会报错 `asr-pipeline: Workers AI credentials not configured`。

本地开发强烈建议使用 wrangler secret 注入（不要把密钥写入仓库）：

```bash
cd cloudflare/media-orchestrator
wrangler secret put CF_AI_ACCOUNT_ID   # 你的 Cloudflare Account ID（供 Workers AI 使用）
wrangler secret put CF_AI_API_TOKEN    # 具有 Workers AI 访问权限的 API Token
```

设置完成后，重启本地 Worker：

```bash
pnpm cf:dev
```

验证方式：在字幕页 Step 1 选择 `provider=cloudflare`，将“降采样后端”设为 `cloud`（或 `auto`），触发转录后，wrangler 控制台不应再出现凭据缺失报错；`/jobs/:id` 会在 audio-transcoder 完成后继续执行 ASR，并返回 `vtt/words` 产物。

## Next 本地

```bash
pnpm dev:host   # 监听 0.0.0.0:3000（本地 UI/接口；不再承担输入中转）
```

## 桶优先与清单（manifest）

- 清单位置：`manifests/media/<mediaId>.json`
- 字段说明：
  - `remoteVideoKey` / `remoteAudioKey` / `remoteMetadataKey`：云下载产物的远端 Key
  - `vttKey`：字幕文本输入（`inputs/subtitles/<mediaId>.vtt`）
  - `commentsKey`：评论数据输入（`inputs/comments/<mediaId>.json`）
  - `subtitlesInputKey`：带字幕视频输入（`inputs/videos/subtitles/<mediaId>.mp4`）
  - `renderedSubtitlesJobId` / `renderedInfoJobId`：渲染作业号（观测用）

示例：

```json
{
  "mediaId": "abc123",
  "remoteVideoKey": "downloads/abc123/job_xyz/video.mp4",
  "remoteAudioKey": "downloads/abc123/job_xyz/audio.mp3",
  "remoteMetadataKey": "downloads/abc123/job_xyz/metadata.json",
  "vttKey": "inputs/subtitles/abc123.vtt",
  "commentsKey": "inputs/comments/abc123.json",
  "subtitlesInputKey": "inputs/videos/subtitles/abc123.mp4",
  "renderedSubtitlesJobId": "job_sub_1",
  "renderedInfoJobId": "job_info_2"
}
```

物化职责：
- Next：
  - 转写完成后写入 `inputs/subtitles/<mediaId>.vtt` 并更新 `vttKey`
  - 评论下载/翻译后写入 `inputs/comments/<mediaId>.json` 并更新 `commentsKey`
  - 云下载回调时写入 `remote*Key`
- Worker：
  - 字幕渲染完成后，将成品物化到 `inputs/videos/subtitles/<mediaId>.mp4` 并更新 `subtitlesInputKey`

严格模式（无回退）：
- Worker 启动任务时仅依赖桶与 manifest；若缺少所需输入，直接返回 `missing_inputs`。
- 启动任务前请确保：
  - 原始视频：`inputs/videos/<mediaId>.mp4` 或存在 `remoteVideoKey`
  - 字幕文本（字幕烧录时需要）：`inputs/subtitles/<mediaId>.vtt` 或 `vttKey`
  - 评论数据（Remotion 渲染时需要）：`inputs/comments/<mediaId>.json` 或 `commentsKey`
  - 带字幕视频（若源策略选择 `subtitles` 或 `auto` 需要优先使用字幕版）：`inputs/videos/subtitles/<mediaId>.mp4` 或 `subtitlesInputKey`

### Source Policy（视频源策略）

`renderer-remotion` 引擎（目前用于“评论视频渲染”）支持通过 `sourcePolicy` 选择输入视频源，取值：

- `auto`（默认）
  - 优先使用“带字幕视频”变体：
    - `inputs/videos/subtitles/<mediaId>.mp4`，或
    - manifest 中的 `subtitlesInputKey`
  - 若不存在字幕变体，则回退到原始 `raw` 变体：
    - `inputs/videos/raw/<mediaId>.mp4`
  - 若仍不存在，则再回退到默认/远程源：
    - `inputs/videos/<mediaId>.mp4`，或
    - manifest 中的 `remoteVideoKey`
- `original`
  - 只尝试原始 `raw` 变体：`inputs/videos/raw/<mediaId>.mp4`；
  - 若不存在，则仅允许使用 manifest 的 `remoteVideoKey` 作为最后兜底；
  - 若两者都缺失，在严格模式下返回 `missing_inputs`。
- `subtitles`
  - 只使用“带字幕视频”变体：
    - `inputs/videos/subtitles/<mediaId>.mp4`，或
    - manifest 中的 `subtitlesInputKey`；
  - 若二者都缺失，在严格模式下返回 `missing_inputs`（不会再回退到原始视频）。

字幕烧录容器 `burner-ffmpeg` 当前不读取 `sourcePolicy`，仍然只依赖 `inputs/videos/<mediaId>.mp4`/`remoteVideoKey` + `inputs/subtitles/<mediaId>.vtt`/`vttKey` 作为输入。

### 云端产物存储

- 云端下载/渲染完成后不再将视频/音频/metadata 落地到 `OPERATIONS_DIR/<mediaId>/`，统一只记录远端 Key。
- 预览/播放通过 Worker 预签 URL 或 `/artifacts/:jobId` 进行，如需本地副本可手动下载对应对象。

## 流程验证

1) 在字幕流程 Step 3 或下载页选择 Cloud → 启动任务。
2) Worker 日志：
   - `start job` → `resolve inputs from bucket/manifest` → `trigger container`。
3) 容器日志：
   - 字幕渲染：`preparing` → `inputs ready` → `20%/30%/...`（每10%一条）→ `ffmpeg done` → `uploading artifact`。
   - 长时任务心跳：每 30s 打印一次 `running… <x>%`，频率可通过环境变量 `RENDER_HEARTBEAT_MS` 调整（设为 `0` 关闭）。
- 云端下载：`preparing` → `fetching_metadata` → `downloading` → `extracting_audio` → `uploading`。
4) 轮询 /jobs/:id：
   - 渲染：R2 出现 `outputs/by-media/<mediaId>/<jobId>/video.mp4` 即标记完成。
- 下载：R2 出现 `downloads/<mediaId>/<jobId>/{video.mp4,audio.mp3,metadata.json}` 后标记完成。
5) Next 日志打印 `[cf-callback] ... job <jobId>`，并将产物落库到 `.operations/<mediaId>/`。
6) 前端自动刷新：渲染流程跳到 Step 4 预览；下载页出现“Cloud download completed”并可继续字幕流程。

## 注意事项

- 如需在离线环境临时改用 MinIO，可把 `S3_ENDPOINT` 切换回 `http://127.0.0.1:9000`（或 compose 网络内的 `http://minio:9000`），并手动运行 MinIO；恢复网络后改回 R2 端点即可。
- 不建议在本地模式下再使用 `/upload` 或容器回调；S3 直连路径更稳、更贴近生产。
 - 新逻辑将 jobId 持久化在浏览器（`subtitleCloudJob:<mediaId>`），刷新后自动恢复轮询；页面失焦会暂停轮询、聚焦恢复。
