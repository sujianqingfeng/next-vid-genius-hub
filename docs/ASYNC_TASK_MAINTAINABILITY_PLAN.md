# 异步任务（下载/渲染/ASR）可维护性重构计划（落盘）

目标：把“任务定义/启动/回调落库/补偿对账”的职责边界拆清，降低新增任务与改契约的维护成本。

说明：如果允许调整数据接口/数据结构（你已确认“只要清晰即可”），本计划会优先选择**用更清晰的结构换掉隐式约定**（例如把“字符串协议字段”改为显式 `jobId` 字段），并尽量减少隐式约定与双写双读分支。

关联现状梳理：见 `docs/ASYNC_TASK_DATAFLOW.md`。

---

## 0. 成功指标（Maintainability）

1) **单一职责**：`cf-callback` 入口只做验签/解析/去重/路由；业务副作用分散到按 `purpose` 划分的 handler 文件中。

2) **单一事实源**（代码层面）：每种任务的“purpose/engine/manifest inputs/outputs/engineOptions/落库策略”在代码中有且只有一个权威位置可查（避免散落在 ORPC、orchestrator、container、callback 多处分支里各写一份）。

3) **共享契约**：JobManifest/CallbackPayload/JobStatus（至少 types；最好带运行期校验）在 App Worker 与 Orchestrator Worker 之间共享，杜绝重复 interface 漂移。

4) **模板化启动**：启动云任务（写 tasks、生成 jobId、写 manifest、startCloudJob、回写 jobId）只有 1 个“模板函数”，ORPC procedure 只负责输入校验与组装参数。

5) **可读的目录结构**：新同学能在 5 分钟内从目录结构推断：
   - “发起任务”在哪里写
   - “回调落库”在哪里改
   - “manifest/inputs/outputs”在哪里定义

6) **语义清晰的数据结构**：DB 字段名/接口字段名表达业务语义，而不是“实现细节或历史遗留命名”。

---

## 0.1 计划状态（截至 2025-12-27）

前提（你已确认）：
- 仅本地运行/验证；不需要兼容旧部署。
- 允许调整数据接口/数据结构：只要更清晰即可。

已完成：
- [x] Phase A：拆分 `cf-callback`（入口验签/解析/去重/路由；业务副作用分散到 handlers）
- [x] Phase B：落地 `enqueueCloudTask` 启动模板（多个任务发起点已迁移）
- [x] Phase C：App/Orchestrator 共享契约（`@app/media-domain`）
- [x] Phase D：回调 payload v2-only + strict 校验（outputs-only）+ Admin 重放回调入口
- [x] Phase D（收口）：轮询只读；reconciler 收口为 tasks-only（不再写 media/channels/threadRenders 作为补偿）
- [x] Phase E：新增 `media.renderSubtitlesJobId` / `media.renderCommentsJobId` 并切到只写只读新字段
- [x] Phase E：thread render 纳入 `tasks`（`tasks.targetType=thread` + `TASK_KINDS.RENDER_THREAD`）
- [x] 发布动作（local）：已应用 DB migrations（`0025` + `0026`）到 D1 local

不做 / N/A（基于“本地-only、无需兼容旧部署”）：
- [ ] 发布动作（remote D1 migrations）：N/A
- [ ] v1/v2 并行兼容窗口、回填、双写双读：N/A

仍待确认/可选（不影响当前本地链路正确性）：
- [x] 清理遗留入口：删除 `finalizeCloudCommentsDownload`（comments 落库闭环已完全在 callback）
- [ ] 监控/告警阈值：`ignored-invalid-v2`、notify attempts（本地可先不做，线上才有意义）

## 1. 现状痛点（聚焦可维护性）

- `apps/web/src/lib/job/callbacks/cf-callback.ts` 是“上帝文件”：同时承担鉴权/去重/分发/落库/计费/远端探测/拉元数据/线程渲染等。
- 任务启动模板在多个位置重复：`download.ts`、`comment.ts`、`subtitle/server/*`、`thread.ts` 各有一套相似但不完全一致的流程。
- JobManifest/Status/Callback payload 的契约在 App/Orchestrator 各自定义一份，后续改字段容易漏。
- `purpose`/kind 的语义如果不收口到统一常量/注册表，长期会变成隐式约定（已开始用 `TASK_KINDS.*` 收敛，仍需继续消除散落字符串）。
- `tasks.targetType` 需要覆盖 thread/system 等非 media 目标（已加入 `thread`，后续仍需明确 system 类任务的模型归属）。
- 历史上曾用“语义不明字段 + 字符串协议”承载渲染产物引用，阅读成本高（已改为显式 `render*JobId`）。

---

## 2. 目标架构（职责边界）

### 2.1 App（apps/web）只负责两件事

1) **Command（发起）**：验证输入 → 生成 jobId → 持久化 tasks → 写 job manifest/snapshot → 调 orchestrator 启动。
2) **Projection（落库）**：消费 orchestrator 的 callback 事件 → 幂等去重 → 更新业务表（media/channels/threadRenders/tasks/points）。

### 2.2 Orchestrator（workers/media-orchestrator）只负责三件事

1) **派发**：读取 per-job manifest、计算 inputs/outputs、给容器 presign URL、启动容器。
2) **状态源**：Durable Object 维护强一致 job state。
3) **事件投递**：终态时可靠回调 App（带 eventSeq/eventId/eventTs + 重试）。

### 2.3 Container（containers/*）只负责执行

只认 orchestrator 传来的 presigned URL + engineOptions；进度/终态回调 orchestrator。

---

## 3. 目录与模块拆分方案（建议落地形态）

### 3.1 callback 处理拆分

把 `apps/web/src/lib/job/callbacks/cf-callback.ts` 拆成：

- `apps/web/src/lib/job/callbacks/cf-callback.ts`
  - 只保留：验签、解析、写 `jobEvents`、去重(eventSeq)、调用 router
- `apps/web/src/lib/job/callbacks/router.ts`
  - `routeByPurpose(payload, ctx) -> handler`
  - 统一 fallback：未知 purpose 的处理策略（只记录/不报错 or 软失败）
- `apps/web/src/lib/job/callbacks/handlers/*.ts`
  - 每个 purpose 一个文件：`download.ts`、`render-comments.ts`、`render-subtitles.ts`、`asr.ts`、`comments-download.ts`、`channel-sync.ts`、`metadata-refresh.ts`、`render-thread.ts`、`proxy-check.ts`

验收点：
- `cf-callback.ts` 主文件长度显著下降（目标 < 200 行）
- 新增任务只需要新增一个 handler 文件 + 在 router 注册

### 3.2 统一任务启动模板

新增一个薄层（示例命名）：

- `apps/web/src/lib/job/enqueue.ts`
  - `enqueueCloudTask({ kind, engine, targetType, targetId, userId, payload, buildManifest, startOptions })`
  - 内部统一完成：
    - insert `tasks`
    - 生成 `jobId`
    - `putJobManifest(jobId, manifest)`
    - `startCloudJob({ jobId, mediaId, engine, purpose, options })`
    - update `tasks.jobId/startedAt`

ORPC 侧改成：
- `procedures/*` 只做：输入校验、查 DB 取必要字段、调用 `enqueueCloudTask`

验收点：
- 仓库中不再出现多份“生成 jobId + putJobManifest + startCloudJob + update task”的手写流程

### 3.3 收口 purpose 常量

- 将 `'render-thread'` 这类散落字符串收口到 `apps/web/src/lib/job/task.ts`（或单独 `purpose.ts`），并在 orchestrator/app 两端复用同一份常量（最好放共享包）。

验收点：
- callback/router 里不再出现 magic string purpose

### 3.4（建议）允许改数据结构时的“清晰化改造”

这部分是**可选但强烈建议**：它不只是“拆文件”，而是把容易造成误解的数据结构改成语义明确的结构。

#### 3.4.1 用显式字段替代字符串协议

现状：
- 曾经用“字符串协议字段”承载 orchestrator artifact 引用，属于隐式约定（已废弃）。

落地状态（已完成）：
- 已新增并统一使用显式字段：
  - `media.renderSubtitlesJobId`（替代 `videoWithSubtitlesPath`）
  - `media.renderCommentsJobId`（替代 `videoWithInfoPath`；更贴近 renderer-remotion 的业务语义）
- callback 只写新字段；查询只读新字段（不再保留旧字段兼容分支）

#### 3.4.2 统一“所有 orchestrator job 都对应一条 tasks”

现状：
- thread render 走 `threadRenders`，但不进 `tasks`，导致 callback/router 必须特殊处理 `purpose === 'render-thread'`。

落地状态（已完成）：
- 已扩展 `tasks.targetType`：加入 `thread`
- thread render 发起时已同时写入 `tasks`（kind/purpose=`render-thread`），callback 路由与任务观测走统一模型

#### 3.4.3 callback payload 结构清晰化（可同时改 orchestrator + app）

建议将 Orchestrator → App 的 payload 明确成单一结构（可带版本号）：
- `purpose` 必填（不再 fallback 到 DB 查 task.kind 推断）
- 所有产物只出现在 `outputs`（移除/弃用顶层 `outputKey/outputUrl` 等历史字段，统一为 `outputs.*.{key,url}`）
- `progress` 统一为 `0..1`（或者明确命名为 `progressFraction`），避免 percent/fraction 混用

落地状态（已完成）：
- payload v2-only：`purpose` 必填（不再 fallback 到 DB 查 task.kind 推断）
- 所有产物只出现在 `outputs`（outputs-only）
- App callback 入口做 strict 校验：失败写入 `job_events(kind='ignored-invalid-v2')`，并把对应 task 标记为 failed（同时返回 200 ignored，避免 orchestrator 重试风暴）

---

## 3.5（新增）任务定义矩阵（把“隐式约定”写清楚）

目标：让每个任务的“语义/输入/输出/落库”在一张表里一眼可查，后续迁移到 `TaskRegistry` 时可以直接照抄。

> 下面的字段命名以“目标结构”为准：`purpose` 是业务语义；`engine` 是执行器；`manifest.inputs` 是容器可见输入；`callback.outputs` 是产物契约；`projection` 是 App 落库规则。

### 3.5.1 Media 任务

- **purpose=`download` / engine=`media-downloader`**
  - manifest.inputs：空（downloader 由 engineOptions 驱动）
  - engineOptions：`{ url, quality, source, proxy }`
  - callback.outputs：`video/audioProcessed/audioSource/metadata`
  - projection：更新 `media.download*`、`media.remote*Key`、`tasks.*`、download 计费

- **purpose=`metadata-refresh` / engine=`media-downloader`**
  - engineOptions：`{ url, source, proxy, ... }`（metadata-only 模式；以实际实现为准）
  - callback.outputs：`metadata`（可能无 video/audio）
  - projection：更新 `media.title/author/thumbnail/viewCount/likeCount/remoteMetadataKey`、`tasks.*`

- **purpose=`comments-download` / engine=`media-downloader`**
  - engineOptions：`{ url, source, pages, proxy }`（以实际实现为准）
  - callback.outputs：`metadata`（包含 comments 列表）
  - projection：更新 `media.comments/commentCount/commentsDownloadedAt`、`tasks.*`

- **purpose=`render-comments` / engine=`renderer-remotion`**
  - manifest.inputs：`videoKey`（源视频）、`commentsKey`（comments snapshot JSON）
  - engineOptions：`{ templateId, templateConfig, composeMode?, proxy? }`
  - callback.outputs：`video`
  - projection：写入“评论渲染 job 引用”（建议新字段 `media.renderCommentsJobId`）、`tasks.*`

- **purpose=`render-subtitles` / engine=`burner-ffmpeg`**
  - manifest.inputs：`videoKey`（源视频）、`vttKey`（字幕输入）
  - engineOptions：`{ subtitleConfig }`
  - callback.outputs：`video`
  - projection：写入“字幕渲染 job 引用”（建议新字段 `media.renderSubtitlesJobId`）、`tasks.*`

- **purpose=`asr` / engine=`asr-pipeline`**
  - manifest.inputs：`asrSourceKey`
  - engineOptions：`{ providerType, model/remoteModelId, maxBytes, targetBitrates, sampleRate, language? }`
  - callback.outputs：`vtt/words`
  - projection：ASR 结果入库（以现有实现为准）、`tasks.*`、ASR 计费

### 3.5.2 Channel 任务

- **purpose=`channel-sync` / engine=`media-downloader`**
  - engineOptions：`{ channelId/url, proxy }`
  - callback.outputs：`metadata`（包含 videos 列表）
  - projection：更新 `channelVideos`、`channels.lastSyncedAt/lastSyncStatus`、`tasks.*`

### 3.5.3 Thread 任务

- **purpose=`render-thread` / engine=`renderer-remotion`**
  - manifest.inputs：`commentsKey`（thread snapshot JSON；复用 commentsKey 但语义是 thread snapshot）
  - engineOptions：`{ resourceType:'thread', templateId, templateConfig, composeMode:'overlay-only' }`
  - callback.outputs：`video`
  - projection：更新 `threadRenders.outputVideoKey/status`，并写入 `tasks.*`

---

## 4. 分阶段执行（按风险从低到高）

### Phase A：只拆文件、不动逻辑（最优先）

1) 在 `callbacks/handlers/*` 中“原样搬迁”逻辑：不改分支、不改字段、不改错误文案。
2) `router` 按 `payload.purpose` 做路由（v2-only；purpose 必填）。
3) 保留现有去重（eventSeq snapshot）与 `recordJobEvent`。

产出：
- 纯重构 PR，可快速 review/回滚。

#### A.1 具体步骤（建议按以下顺序提交，便于 review）

1) 建目录与空壳文件（先不迁移逻辑）：
   - `apps/web/src/lib/job/callbacks/router.ts`
   - `apps/web/src/lib/job/callbacks/handlers/*.ts`
2) 将 `cf-callback.ts` 里的“大分支”按 purpose 拆到 handlers（保持分支结构与错误文案不变）。
3) `cf-callback.ts` 收敛为：
   - HMAC 验签、解析 payload（v2-only）
   - `recordJobEvent(...)`
   - eventSeq 去重写 snapshot
   - 调用 `routeByPurpose(...)` 并返回结果
4) Router 策略明确化：
   - `payload.purpose` 缺失/未知：记录 `job_events` 并返回 `{ ok: true, ignored: true }`（并将 task 标记 failed，避免“静默成功”）

#### A.2 验收用例（手工/冒烟）

- 模拟一个 callback payload（completed/failed 各一条），确认：
  - `job_events` 有记录
  - 去重逻辑仍然生效（重复 eventSeq 返回 deduped）
  - 原有业务表更新结果一致（对比改动前后）

### Phase B：启动模板化（减少重复、提升一致性）

1) 引入 `enqueueCloudTask`，将下载/渲染/ASR/频道同步/评论下载等逐个迁移。
2) 在模板内统一错误处理（标记 task failed、写 error、finishedAt）。
3) 明确哪些“准备步骤”属于 task payload（例如 proxy 解析） vs manifest inputs（例如 videoKey/commentsKey）。

产出：
- 启动逻辑集中，后续新增任务复制成本显著下降。

#### B.1 具体步骤

1) 新增 `apps/web/src/lib/job/enqueue.ts`：
   - `enqueueCloudTask(...)` 统一模板：insert tasks → jobId → manifest → startCloudJob → update tasks
2) 将“准备阶段”归类并固定边界：
   - App 本地准备：proxy 选择、comments/thread snapshot、vttKey/materialize 等
   - manifest.inputs：容器必须依赖的 key（videoKey/commentsKey/vttKey/asrSourceKey）
   - engineOptions：执行参数（模板/配置/proxy/阈值等）
3) 逐个迁移入口（每迁移一个就跑一次冒烟）：
   - `apps/web/src/orpc/procedures/thread.ts`（render-thread）
   - `apps/web/src/lib/subtitle/server/render.ts`（render-subtitles）
   - `apps/web/src/orpc/procedures/comment.ts`（render-comments）
   - `apps/web/src/lib/subtitle/server/transcribe.ts`（asr）
   - `apps/web/src/orpc/procedures/download.ts`（download；最后迁移）
4) 将 `TASK_KINDS` 与 purpose 常量绑定：
   - 代码中禁止写裸字符串 purpose（`'render-thread'` 这类）

### Phase C：共享契约与校验（消灭漂移）

1) 在 `packages/media-domain` 扩展/新增：
   - `JobManifest`（与 `workers/media-orchestrator/types.ts` 对齐）
   - `OrchestratorCallbackPayloadV2`（与 App `cf-callback` 对齐）
2) App/Orchestrator 两端都改为 import 共享 types。
3) 可选：加 zod 校验（至少在边界处：App callback、Orchestrator /jobs 请求）。

产出：
- 契约变更有编译期约束；边界处有运行期保护。

#### C.1 具体步骤

1) 在 `packages/media-domain` 新增（或扩展）模块（示例）：
   - `packages/media-domain/src/orchestrator-contracts.ts`
     - `JobManifest`
     - `OrchestratorStartJobInput`
     - `OrchestratorCallbackPayloadV2`（v2-only）
2) Orchestrator 侧替换：
   - `workers/media-orchestrator/types.ts`：保留 Env/Bindings 类型；JobManifest/StartBody/StatusDoc 改为 import 共享 type
3) App 侧替换：
   - `apps/web/src/lib/cloudflare/manifests.ts`
   - `apps/web/src/lib/cloudflare/jobs.ts`
   - `apps/web/src/lib/job/callbacks/*`
4) 运行期校验：
   - App callback：strict（校验失败返回 200 ignored + 记录 `job_events` + 标记 task failed）
   - Orchestrator `/jobs`：可按需要补充 strict 校验（本地-only 可先不做）

### Phase D：清理“对账/补偿”边界（可维护性增强）

目标：让 reconciler 收口为 tasks-only，不再承担任何业务投影写库：
- 明确：callback 是唯一业务投影写库入口；reconciler 只更新 `tasks` 快照/状态（用于展示与对账），不写 `media/channels/threadRenders`。

#### D.1 具体步骤

1) 把闭环放到 callback handlers：
   - 让 completed callback 直接完成业务投影更新（comments/channel/metadata-refresh 等也在事件侧闭环）
2) reconciler 只兜底“回调丢失/短暂不可读”：
   - 仅更新 `tasks`，不做业务补偿写入
3) 统一快照结构：
   - `jobStatusSnapshot.callback.*`（eventSeq 去重）
   - `jobStatusSnapshot.reconciler.*`（最后一次轮询）

### Phase E：数据结构清晰化（选择直接切换，不做回填/兼容）

1) DB：以显式字段表达渲染产物引用（`render*JobId`），不再使用“字符串协议字段”。
2) 回调：只写新字段；不再双写旧字段。
3) 查询：只读新字段；不再 fallback 旧字段。
4) 统一 tasks：thread render 进入 tasks（targetType=thread）。

#### E.1 DB 变更清单（建议最小集）

> 备注：D1/SQLite 下“删除列/重命名列”成本高且风险大；本仓库当前选择“新增新列并直接切换只写只读”，不保留旧字段兼容分支。

1) `media` 新增字段（示例命名）：
   - `render_comments_job_id`（nullable）
   - `render_subtitles_job_id`（nullable）
2) `tasks` enum 扩展：
   - `target_type` 加入 `thread`
   - `kind` 加入 `render-thread`（或统一为新的 purpose enum；二选一）

#### E.2 接口变更建议（让前端更容易理解）

1) Media 详情/ORPC 返回新增：
   - `renderCommentsJobId`、`renderSubtitlesJobId`

---

## 5. 迁移顺序建议（从最不容易出错的任务开始）

1) `render-thread`（独立表 threadRenders，边界清晰）
2) `render-subtitles`（burner-ffmpeg，输入输出明确）
3) `render-comments`（renderer-remotion，依赖 comments snapshot，但契约明确）
4) `asr`（asr-pipeline，涉及结果入库/计费）
5) `download`（media-downloader，逻辑最复杂、旁路最多：metadata-only/comments/channel/proxy-check）

---

## 6. 验收清单（每个 Phase 都要过）

- 回调：eventSeq 去重仍然生效（重复回调不会二次扣费/二次写入）。
- 产物：渲染视频通过 `render*JobId` 走 orchestrator `/artifacts/:jobId` 可播放/下载。
- 任务：tasks 状态流转、progress、jobStatusSnapshot 字段不变或向后兼容。
- 错误：失败场景下的 `downloadError`/task.error 仍可读、可排查。

---

## 7. 发布与回滚（只针对可维护性重构）

- Phase A/B：纯重构/内部抽象，不改外部 API，回滚=回退 commit。
- Phase C：本地-only 场景已直接采用 callback strict；若未来需要线上灰度，可再引入“warn-only → strict”的切换开关。

---

## 8. 交付拆分（建议按 PR 拆解）

为降低冲突与 review 成本，建议拆成多个 PR（每个 PR 都可独立回滚）：

1) PR-1：Phase A（callback 文件拆分 + router + handlers，逻辑不变）
2) PR-2：Phase B（引入 enqueueCloudTask + 迁移 render-thread/render-subtitles）
3) PR-3：Phase B（迁移 render-comments/asr）
4) PR-4：Phase B（迁移 download；最后做）
5) PR-5：Phase C（共享 types + callback strict 校验）
6) PR-6：Phase E（DB 新字段 + 只写只读；如果决定做）
7) PR-7：清理旧字段/旧分支（最后做）

> 备注：当前已走 v2-only 且不兼容旧部署，上述 PR 拆分仅作为历史建议参考。
