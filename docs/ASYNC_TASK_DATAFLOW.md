# 异步任务数据流向梳理（问题记录 & 后续整理方向）

目的：记录当前异步任务（下载 / 渲染 / ASR / 评论下载 / 频道同步 / 代理探活等）的数据流向与“为什么会感觉又主动又回调很乱”，方便后续按事件驱动统一。

## 现状：当前主链路（Command → Execute → Event/Callback → Projection → Query）

### 1) 发起（主动 Command：App 侧创建任务并启动）

- App 生成稳定的 `jobId`（用于 DB/manifest/orchestrator 全链路对齐）
- 写入 D1：
  - `tasks`（队列/进度/快照）
  - `media`/`channels` 等业务表（例如 `downloadJobId`）
- 写入 per-job manifest（R2/S3）：让 Worker/容器不依赖业务 DB
- 调用 Orchestrator 启动任务：`POST /jobs`（HMAC 签名）

相关代码入口：
- 启动/查询 Orchestrator：`apps/web/src/lib/cloudflare/jobs.ts`
- 写 job manifest：`apps/web/src/lib/cloudflare/manifests.ts`
- 各类任务发起点（ORPC / server）：`apps/web/src/orpc/procedures/*`、`apps/web/src/lib/subtitle/server/*`

### 2) 执行（Orchestrator 派发到容器）

- Orchestrator `POST /jobs`：
  - 校验 HMAC
  - 读取 per-job manifest 决定 inputs
  - 生成输出 key + presigned PUT URL
  - 调用容器 `/render`（Cloudflare Containers 或外部容器）
  - 让容器把进度/结果回调到 Orchestrator

相关代码入口：
- `workers/media-orchestrator/handlers/start.ts`

### 3) 进度回传（事件 Event：容器 → Orchestrator）

- 容器 `POST /callbacks/container`（HMAC）
- Orchestrator 将 payload 写入 Durable Object（强一致状态源）
- 某些任务会在回调里触发“链式步骤”（例如 ASR pipeline）

相关代码入口：
- `workers/media-orchestrator/handlers/callback.ts`
- Durable Object 状态：`workers/media-orchestrator/do/RenderJobDO.ts`

### 4) 业务落库回写（回调 Callback：Orchestrator/DO → App）

- Durable Object 在“终态且具备输出”时，回调 App：
  - `POST /api/render/cf-callback`（HMAC）
  - App 校验签名、更新 D1（tasks/media/计费/ASR 结果入库等）
- 该路由在 BasicAuth 保护中被 allowlist，确保 orchestrator 能访问：
  - `apps/web/src/worker.ts` 里 `ALLOWLIST_PREFIXES = ['/api/render/cf-callback']`

相关代码入口：
- DO 回调：`workers/media-orchestrator/do/RenderJobDO.ts`（`notifyApp`）
- App 回调处理：`apps/web/src/lib/job/callbacks/cf-callback.ts`
- 路由挂载：`apps/web/src/routes/api/render/cf-callback.ts`

### 5) 状态查询（主动 Pull：客户端/服务轮询 Orchestrator）

- `GET /jobs/:jobId` → Orchestrator 直接从 DO 返回 job state
- UI / ORPC 的 `get*Status` 系列接口多采用轮询

相关代码入口：
- App 查询：`apps/web/src/lib/cloudflare/jobs.ts`（`getJobStatus`）
- Orchestrator 查询：`workers/media-orchestrator/handlers/status.ts`

## 症状：为什么会“又主动又回调，感觉很乱”

核心是：同一条业务链路里同时存在 “Callback 写库” + “Polling 也写库” + “同一 engine 多用途分流” 三种叠加。

### A) 回调与轮询“双写”造成认知负担

- 回调（`/api/render/cf-callback`）会更新 `tasks`/`media`，并做计费、ASR 入库等副作用。
- 多个 `get*Status`（轮询）接口也会在拉到 status 后 **best-effort 更新 `tasks`**，并且有时还会“补偿修复” `media` 字段。
- 结果：业务状态到底以谁为准、何时落库、谁触发副作用，会变得不清晰；代码中不可避免出现对账/兜底/重试逻辑。

### B) 单个 engine 承载多种“业务语义”，回调侧只能分流/忽略

例如 `media-downloader` 不仅做下载，还做：
- 评论下载（输出 metadata）
- 频道同步（输出 metadata）
- 元数据刷新（metadata-only）
- 代理探活（system-level proxy check）

因此 App callback 处理里存在较多分支：
- 按 `payload.metadata.kind`（如 `proxy-check`）走系统级更新
- 按 `tasks.kind` 判断是否是“真正的下载”，否则忽略对 `media.download*` 的写入

### C) “完成后还要 finalize” 让流程更像半拉子事件驱动

像评论下载/频道同步这类任务：
- Orchestrator/DO 回调只是把 job 标成 completed 并带回 metadata 的 key/url
- 真正把 metadata 拉回并写入业务表，依赖后续的 `finalize*` API 被调用（通常来自 UI/手动触发）
- 结果：终态事件没有闭环，链路会出现“完成了但页面没更新/需要点一下 finalize”的感觉

## 目标：事件驱动 + 流程清晰（拟定的“统一模型”）

建议目标形态：**Command → Event → Projection → Query**，并明确单一事实源（SSOT）。

### 建议 1：明确“单一写入源”（减少双写）

二选一（推荐第一种）：
- 推荐：**回调（Event）负责落库与副作用**；轮询只读，用于 UI 展示或补偿对账。
- 备选：完全依赖轮询写库，回调只做“唤醒/通知”（不建议，可靠性与时延更差）。

### 建议 2：把“业务语义”显式化（减少 callback 分流）

在启动 job 时把 `purpose/taskKind` 作为一等字段写入 DO，并在回调中原样带回（而不是 callback 里再查 DB 猜测）。

### 建议 3：把 finalize 从 UI 挪到事件侧（完成事件闭环）

对 comments/channel 这类 “completed 后还要 fetch metadata 再写 DB”：
- 把“拉 metadata → 写库”的动作做成 callback 的后续步骤（或后台消费者），让一次完成事件就能把业务投影更新完。

### 建议 4：轮询降级为“对账/补偿”

保留轮询/定时 reconciler 处理：
- 回调丢失
- 远端对象短时间不可读（已存在的 best-effort reconciliation 说明确实会发生）
- 旧版本回滚/兼容字段差异

## 后续 TODO（可按任务类型逐条收敛）

### 已落地（最小改动：只理顺/不引入新转码）

- 回调写库作为 SSOT：多个 `get*Status` 改为只读（不再 best-effort 更新 `tasks/media`）。
- Orchestrator 回调投递可靠化：DO 生成 `eventSeq/eventId/eventTs`，并用 alarm 重试 `/api/render/cf-callback`（需要幂等）。
- App 回调幂等/去重：按 `eventSeq` 写入 `tasks.jobStatusSnapshot.callback.lastEventSeq`，重复事件直接 ACK。
- comments/channel/metadata-refresh：把“completed 后还要 finalize”的落库闭环放进回调侧（UI 不再触发 finalize）。
- 计费幂等：points 计费以 `refId=jobId` 去重，避免回调重试导致重复扣费。

### 仍待完成

- [x] 选定 SSOT：回调写库为主，轮询只读/展示
- [ ] 统一 job payload：增加 `purpose/taskKind` 并贯穿 manifest → orchestrator → DO → app callback（减少 callback 侧查 DB 分流）
- [x] comments/channel：把 `finalize*` 收敛到事件侧闭环（避免 UI 再触发）
- [ ] 轮询降级为“对账/补偿”：保留必要的 reconciliation（回调丢失、对象短暂不可读、兼容旧 deploy）
- [ ] 为关键链路加“事件日志/审计”（最少包含 jobId、purpose、status、ts、source），便于排查回调/轮询竞态
