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

MinIO 控制台：`http://localhost:9001`（账号/密码：`minioadmin`/`minioadmin`）

首次登录后创建桶：`vidgen-render`

## Worker 本地配置

编辑 `cloudflare/media-orchestrator/wrangler.toml`，在 `[vars]` 中设置：

```toml
S3_ENDPOINT = "http://127.0.0.1:9000"   # MinIO API
S3_STYLE = "path"                        # 路径风格
S3_ACCESS_KEY_ID = "minioadmin"
S3_SECRET_ACCESS_KEY = "minioadmin"
S3_BUCKET_NAME = "vidgen-render"
NEXT_BASE_URL = "http://localhost:3000"
CONTAINER_BASE_URL = "http://localhost:8080"   # 本地容器
```

运行 Worker：

```bash
pnpm cf:dev
```

## Next 本地

```bash
pnpm dev:host   # 监听 0.0.0.0:3000（供 Worker 拉取源素材）
```

## 流程验证

1) 在 UI Step 3 选择 Cloud → 开始渲染。
2) Worker 日志：
   - `start job` → `mirror inputs to S3` → `trigger container`。
3) 容器日志：
   - `preparing` → `inputs ready` → `ffmpeg done` → `uploading artifact` → `completed`。
4) 轮询 /jobs/:id：Worker 检测到 S3 出现 `outputs/by-media/<mediaId>/<jobId>/video.mp4`，标记完成并回调 Next。
5) Next 终端出现 `[cf-callback] recorded remote artifact for job <jobId>`。
6) 页面自动跳至 Step 4，可经 `/api/media/:id/rendered` 代理 Worker `/artifacts/:jobId` 播放（支持 Range）。

## 注意事项

- 若 MinIO 与 Worker 不在同一网络（wrangler dev 在宿主机），将 `S3_ENDPOINT` 设置为 `http://127.0.0.1:9000`。
- 若使用 compose 内网络，则把 `S3_ENDPOINT` 设为 `http://minio:9000` 并在容器中运行 wrangler。
- 不建议在本地模式下再使用 `/upload` 或容器回调；S3 直连路径更稳、更贴近生产。
 - 新逻辑将 jobId 持久化在浏览器（`subtitleCloudJob:<mediaId>`），刷新后自动恢复轮询；页面失焦会暂停轮询、聚焦恢复。
