# Apps/Web 按领域模块重构 TODO（接续文档）

目标：把 `apps/web/src` 从“按技术/集成混杂”改成“按领域模块分层”，并把 route 文件变薄（只保留路由声明 + loader/handler 入口），把 UI/业务逻辑下沉到 `components/business/**` 和 `lib/**`。

> 约定：所有 route 的 `createFileRoute('/...')` 字符串路径不改，避免路由 URL 变化；移动文件后用 `pnpm -C apps/web build` 重新生成 `apps/web/src/routeTree.gen.ts`。

---

## 已完成（当前状态）

### 1) 移除 `integrations/`（已删）
- 旧：`apps/web/src/integrations/**`
- 新（已迁移到 `lib/**`）：
	- `integrations/auth/hooks.ts` → `apps/web/src/lib/auth/hooks.ts`
	- `integrations/orpc/client.ts` → `apps/web/src/lib/orpc/client.ts`
	- `integrations/tanstack-query/*` → `apps/web/src/lib/query/*`
	- `integrations/theme/index.tsx` → `apps/web/src/lib/theme/index.tsx`
	- `integrations/i18n/index.tsx` → `apps/web/src/lib/i18n/start.ts`

### 2) Routes 按领域重组（路径不变）
`apps/web/src/routes/` 当前主要目录：
- `admin/`、`api/`、`auth/`、`channels/`、`legal/`、`marketing/`、`media/`、`points/`、`proxy/`、`tasks/`

### 3) UI 抽离到 `components/business/**`（route 变薄）
已做（示例）：
- `apps/web/src/routes/channels/route.tsx` → `apps/web/src/components/business/channels/channels-page.tsx`
- `apps/web/src/routes/points/route.tsx` → `apps/web/src/components/business/points/points-page.tsx`
- `apps/web/src/routes/tasks/route.tsx` → `apps/web/src/components/business/tasks/tasks-page.tsx`
- `apps/web/src/routes/admin/proxy.tsx` → `apps/web/src/components/business/admin/proxy/admin-proxy-page.tsx`
- `apps/web/src/routes/admin/points-pricing.tsx` → `apps/web/src/components/business/admin/points-pricing/points-pricing-page.tsx`

### 4) 从 API 开始：先让 /api 路由变薄（已做一部分）
- ORPC handler：`apps/web/src/routes/api/orpc/$.ts` → 逻辑在 `apps/web/src/lib/orpc/server/handler.ts`
- OpenAPI：`apps/web/src/routes/api/openapi.ts` → 逻辑在 `apps/web/src/lib/orpc/server/openapi.ts`

---

## 明天要做（未完成清单，建议按顺序）

### A) API（继续“从 API 开始”）

#### A1) Proxy Check：抽出 handlers（优先）
当前文件：
- `apps/web/src/routes/api/proxy-check/run.ts`（`runProxyChecksNow`，含 admin 鉴权 + waitUntil）
- `apps/web/src/routes/api/proxy-check/run-one.ts`（单个 proxy 探测 + startCloudJob + admin 鉴权 + waitUntil）

建议目标结构：
- 新增：`apps/web/src/lib/proxy/server/proxy-check.ts`
	- `handleProxyCheckRun(request: Request, runtime?: { waitUntil?: (p: Promise<unknown>) => void })`
	- `handleProxyCheckRunOne(request: Request, runtime?: { waitUntil?: (p: Promise<unknown>) => void })`
- route 侧只保留：
	- `POST: ({ request, context }) => handleProxyCheckRun(request, (context as any)?.ctx)`

注意点（容易踩坑）：
- `buildRequestContext(request)` 产生的 `ctx.responseCookies` 必须 append 到最终 response（401/403/200 全部情况都要带上）。
- `waitUntil` 存在时应返回 queued 响应；否则 await 任务并返回结果（保持现行为不变）。
- 这里的 admin 判断是重复逻辑，后续可考虑抽一个通用 helper：
	- 例如 `apps/web/src/lib/auth/server/ensure-admin.ts` 或 `withAdminRequestContext(...)`（先不做也行，先把 route 变薄）。

#### A2) Cloudflare Job Callback：拆分大文件（高价值）
当前文件（很大）：
- `apps/web/src/routes/api/render/cf-callback.ts`（~783 行）

建议目标结构：
- 新增目录：`apps/web/src/lib/job/callbacks/`
- 新增文件：`apps/web/src/lib/job/callbacks/cf-callback.ts`
	- `handleCfCallbackRequest(request: Request): Promise<Response>`
	- 按 engine 拆分内部函数（示例命名）：
		- `handleCloudDownloadCallback(...)`
		- `handleCloudAsrCallback(...)`
		- `handleCloudRenderCallback(...)`
	- 将签名校验、payload 解析、通用 DB 更新/日志等整理成小函数
- route 侧只保留：
	- `POST: ({ request }) => handleCfCallbackRequest(request)`

额外建议（可选）：
- 你会在多个 internal callback 里用到 HMAC 校验：可以抽一个小工具函数
	- 例如 `apps/web/src/lib/job/callbacks/hmac.ts` → `verifySignedJsonBody(...)`

#### A3) Media Source：抽 handler（中等）
当前文件：
- `apps/web/src/routes/api/media/$id/source.ts`（~274 行）

建议目标结构：
- 新增：`apps/web/src/lib/media/server/source.ts`
	- `handleMediaSourceRequest(request: Request, mediaId: string): Promise<Response>`
- route 侧只保留：
	- `GET: ({ request, params }) => handleMediaSourceRequest(request, params.id)`

保持行为不变的关键点：
- `variant=original|subtitles|auto` 分支逻辑不要改（只是移动/拆分函数）
- 对 orchestrator/remoteVideoKey 的 fallback 顺序保持一致
- 日志语义保持一致（方便追踪）

#### A4) Internal ASR Provider：抽 handler（中等，可跟 A2 一起做）
当前文件：
- `apps/web/src/routes/api/internal/ai/asr-provider.ts`（~104 行）

建议目标结构：
- 新增：`apps/web/src/lib/ai/server/asr-provider.ts`
	- `handleInternalAsrProviderRequest(request: Request): Promise<Response>`
- route 侧只保留：
	- `POST: ({ request }) => handleInternalAsrProviderRequest(request)`

注意点：
- 签名 header：`x-signature`
- 时钟漂移窗口：`±5min`（保持不变）
- 校验 provider/model enabled & kind/type（保持不变）

---

### B) UI Routes：继续把大页面抽到业务组件

#### B1) Media detail 子页（最大块）
当前最大文件：
- `apps/web/src/routes/media/$id/comments.tsx`（~1529 行）
- `apps/web/src/routes/media/$id/subtitles.tsx`（~1142 行）
- `apps/web/src/routes/media/$id/index.tsx`（~515 行）

建议目标结构（示例）：
- `apps/web/src/components/business/media/comments/media-comments-page.tsx`
- `apps/web/src/components/business/media/subtitles/media-subtitles-page.tsx`
- `apps/web/src/components/business/media/detail/media-detail-page.tsx`
- route 侧只保留 loader + wrapper，UI 全部下沉到 business 组件

建议拆分方法（减少一次性改动风险）：
1) 先把整个组件体“搬家”到 business 文件，route 只 import & render
2) 再在 business 文件内按功能拆小组件（表格、对话框、编辑器、预览卡片、toolbar 等）
3) 若需要 router 的 `Route.useNavigate()` / `Route.useSearch()`，优先在 route wrapper 里获取后通过 props 传入 business 组件，避免在 business 里 import route（减少循环依赖）

#### B2) Admin 页面（第二梯队）
当前文件（仍偏大）：
- `apps/web/src/routes/admin/users.tsx`（~559 行）
- `apps/web/src/routes/admin/ai-providers.tsx`（~455 行）
- `apps/web/src/routes/admin/ai-models.tsx`（~423 行）

建议目标结构（示例）：
- `apps/web/src/components/business/admin/users/admin-users-page.tsx`
- `apps/web/src/components/business/admin/ai-providers/admin-ai-providers-page.tsx`
- `apps/web/src/components/business/admin/ai-models/admin-ai-models-page.tsx`

---

## 每次移动/抽离的“固定流程”（明天照着做即可）

1) 新建 business 或 lib 文件，把原代码整体搬过去（先不拆小）
2) route 文件缩到只剩：
	- `createFileRoute('/...')({ loader/server.handlers, component })`
	- `component` 引用 business 组件（或 `server.handlers` 调用 lib handler）
3) 全局搜索修 import（只改路径不改逻辑）
4) 跑校验（每次一小步）：
	- `pnpm -C apps/web format`
	- `pnpm -C apps/web test`
	- `pnpm -C apps/web build`（用于 routeTree.gen.ts & SSR bundle 校验）

---

## 快速自检命令（明天开工前）

- 检查是否还有 integrations 引用：`rg -n \"integrations\" apps/web/src`
- 找最大的 route 文件：`find apps/web/src/routes -type f \\( -name '*.ts' -o -name '*.tsx' \\) -print0 | xargs -0 wc -l | sort -nr | head -n 20`
- 确认可构建：`pnpm -C apps/web build`

