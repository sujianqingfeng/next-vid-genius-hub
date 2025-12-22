# Cloudflare 部署手册（TanStack Start + media-orchestrator + 外部容器）

本文档记录本仓库在 Cloudflare 的生产部署流程（Worker App + D1 + R2 + Orchestrator Worker + 外部容器）。

当前生产示例（可按需替换）：

- App（业务应用域名）：`https://vid-hub.temp-drop-files.store`
- Orchestrator Worker：`https://media-orchestrator.nieshuanghe.workers.dev`
- 外部容器（HTTPS，Path `/`）：
  - burner：`https://burner.temp-drop-files.store`（对外暴露 `POST /render`）
  - remotion：`https://remotion.temp-drop-files.store`（对外暴露 `POST /render`）
  - downloader：`https://downloader.temp-drop-files.store`（对外暴露 `POST /render`）

## 0. 部署目标与组件

- **业务应用（TanStack Start）**：Wrangler 部署到 Cloudflare Workers，负责 UI / API / D1 读写，以及接收 orchestrator 回调：`/api/render/cf-callback`。
- **媒体编排 Worker（`media-orchestrator`）**：负责读取 per-job manifest、生成 R2 预签名 URL、调用外部容器、轮询/回调落库、提供 `/artifacts/:jobId`。
- **外部容器**：只通过 R2 预签名 GET/PUT 读写对象存储，并向 orchestrator 回调进度/终态。

## 1. 关键配置文件

- 业务应用（Worker App）
  - Root 挂载（`/*`）：`wrangler.root.jsonc`
  - Vite base：`vite.config.ts`（默认 `/`）
- Orchestrator（Worker）
  - `wrangler.toml`（使用 `env.production`）
- D1 migrations
  - migrations 目录是 `drizzle/`（wrangler 配置已在 `d1_databases[*].migrations_dir` 指向 `drizzle`）

## 2. 一次性准备（Cloudflare 控制台）

1) 确保生产域名已接入 Cloudflare（不然 Worker routes 无法绑定）。

2) D1
- 创建 D1 数据库（例如 `vidgen_app`），并在 `wrangler.root.jsonc` 的 `d1_databases` 中填写 `database_id`。

3) R2
- 创建 bucket：`vidgen-render`（与 `wrangler.toml` 一致）。
- 开启/创建 R2 的 **S3 兼容 API** 访问密钥：`S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`（用于 orchestrator 生成预签名 URL）。

4) KV
- 创建 KV namespace（orchestrator 的 `JOBS`），并将 namespace id 写入 `wrangler.toml` 的 `[[env.production.kv_namespaces]]`。

## 3. 必须保持一致的密钥（非常重要）

`JOB_CALLBACK_HMAC_SECRET` 必须在三端保持一致：

- 业务应用 Worker（`vid-genius-start`）
- orchestrator Worker（`media-orchestrator`，`env.production`）
- 外部容器环境变量（burner/remotion/downloader）

否则会出现：
- orchestrator /jobs 401（验签失败）或
- 业务应用 `/api/render/cf-callback` 401（`x-signature` 验签失败）或
- 容器 `/callbacks/container` 401（回调验签失败）

## 4. 部署顺序（推荐）

### 4.1 部署 Orchestrator（media-orchestrator）

1) 确认 `wrangler.toml`（production）关键项：
- 外部容器基址：`CONTAINER_BASE_URL*`
- 回调业务应用：`APP_BASE_URL`（例如 `https://vid-hub.temp-drop-files.store`）
- R2 S3 endpoint：`S3_ENDPOINT` / `S3_INTERNAL_ENDPOINT`
- bucket：`S3_BUCKET_NAME=vidgen-render`
- KV / R2 bindings 与 DO bindings 正确

2) 注入 secrets（不要写进仓库）

```bash
pnpm exec wrangler secret put JOB_CALLBACK_HMAC_SECRET --config wrangler.toml --env production
pnpm exec wrangler secret put S3_ACCESS_KEY_ID --config wrangler.toml --env production
pnpm exec wrangler secret put S3_SECRET_ACCESS_KEY --config wrangler.toml --env production
```

3) 部署

```bash
pnpm cf:deploy
```

4) 冒烟：检查预签名是否工作（200 代表 S3 密钥已就绪）

```bash
curl -i 'https://media-orchestrator.<your>.workers.dev/debug/presign?key=debug/test.txt'
```

### 4.2 部署业务应用（TanStack Start）

1) 先注入回调验签 secret（生产建议用 `wrangler secret`，不要写入 `vars`）

```bash
pnpm exec wrangler secret put JOB_CALLBACK_HMAC_SECRET --config wrangler.root.jsonc
```

2) 确认生产变量
- `CF_ORCHESTRATOR_URL`：指向生产 orchestrator（在 `wrangler.root.jsonc` 的 `vars`）
- 业务应用域名本身由 Cloudflare `routes` 绑定（见 `wrangler.root.jsonc` 的 `routes` 配置）

3) 运行 D1 迁移（如需要）

```bash
pnpm db:d1:list:remote
pnpm db:d1:migrate:remote
```

4) 切根部署（挂载 `/*`）

```bash
pnpm deploy:root
```

## 5. 路由冲突与切换/回滚

如果生产域名的 `vid-hub.temp-drop-files.store/*` 已经被另一个 Worker 占用，`pnpm deploy:root` 会报错：

> Can't deploy routes that are assigned to another worker.

解决思路：先把旧 Worker 从 `/*` 挪走，再部署新 Worker 到 `/*`。

示例（把旧 Worker 挪到 `__legacy/*`，具体 worker 名称以你账号里实际为准）：

```bash
pnpm exec wrangler deployments list --name <old-worker-name>
pnpm exec wrangler triggers deploy --name <old-worker-name> --routes 'vid-hub.temp-drop-files.store/__legacy/*'
pnpm deploy:root
```

回滚：把旧 Worker 的 routes 改回 `vid-hub.temp-drop-files.store/*`，或在 Cloudflare Dashboard 里调整 route 归属。

## 6. 上线后验证清单（最小冒烟）

1) 业务应用首页可访问：

```bash
curl -I https://vid-hub.temp-drop-files.store/
```

2) orchestrator 预签名可用（200）：

```bash
curl -I 'https://media-orchestrator.<your>.workers.dev/debug/presign?key=debug/test.txt'
```

3) 跑一条最小“云任务”链路：
- 在 UI 触发一个 cloud render/download job
- 观察 orchestrator 日志（Cloudflare Workers logs/observability）
- 确认业务应用收到 `/api/render/cf-callback` 回调并更新任务状态

## 7. 安全备注

- 不要在仓库文件里保存任何 secrets（HMAC、S3 keys、token）。
- 如果密钥曾经在聊天/日志中暴露，建议在 Cloudflare 里 **立即旋转/重建** 该密钥，并重新注入到 orchestrator/容器。
