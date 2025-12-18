# 迁移方案：Next.js → TanStack Start（针对本仓库）

这份文档基于当前仓库代码的“实地盘点”，给出可落地的迁移路径（优先保证可回滚、可灰度）。

## 结论（先说人话）

- **可行**：你现在的 UI/数据层已经大量使用 TanStack Query + oRPC（fetch 形态），这和 TanStack Start 的生态非常契合。
- **代价主要来自“Next 专属”部分**：`next-intl`、`next/navigation`、`next/link`/`next/image`、`next/headers`（cookies/headers）、以及 OpenNext 的 Cloudflare 运行时注入（D1 env）。
- **建议走“并行迁移/灰度切流”，不要一把梭**：先让 Start 跑起来，先迁 UI（页面路由 + 组件），API 先留在旧 Next Worker（通过 Cloudflare 路由把 `/api/*` 留给旧 Worker），等 UI 稳定后再拆 API。

## 你项目里对 Next 的依赖点（盘点）

### 1) Next App Router（页面 + 动态路由 + searchParams）

- 页面目录：`app/`、`app/(workspace)/`、`app/admin/`
- 动态路由：`app/(workspace)/media/[id]/...`
- `searchParams` 解析：`app/(workspace)/tasks/page.tsx`

### 2) Next Route Handlers（`app/api/**/route.ts`）

当前共有 **10 个**路由处理器：

- `app/api/orpc/[...slug]/route.ts`（oRPC 主入口）
- `app/api/openapi/route.ts`（OpenAPI 文档生成）
- `app/api/render/cf-callback/route.ts`（Worker/容器回调）
- `app/api/media/[id]/*`（媒体源/字幕/渲染/下载/评论数据）
- `app/api/internal/ai/asr-provider/route.ts`

这些路由里大量使用了 `NextRequest/NextResponse`（典型在 `app/api/**/route.ts` 与 `lib/media/stream.ts`）。

### 3) `next/navigation`（客户端路由能力）

用于登录跳转、筛选参数、侧边栏高亮等：

- `app/login/page.tsx`
- `components/auth/*-auth-gate.tsx`
- `components/business/layout/sidebar.tsx`
- `components/business/tasks/tasks-page.tsx`
- `components/business/layout/language-switcher.tsx`

### 4) `next-intl`（服务端 + 客户端）

你同时使用了：

- 服务端：`getTranslations`（例如 `app/(workspace)/page.tsx`）
- 客户端：`useTranslations`（大量组件/页面）
- 请求配置：`i18n/request.ts`（依赖 `next/headers` 的 cookies）
- 语言切换：`app/(workspace)/_actions/set-locale.ts`（Server Action 写 cookie）

这块是迁移里最“框架绑定”的部分之一。

### 5) OpenNext Cloudflare 运行时注入（D1）

- Next dev 初始化：`next.config.ts` 调用 `initOpenNextCloudflareForDev`
- D1 获取：`lib/db/index.ts` 依赖 `getCloudflareContext`（来自 `@opennextjs/cloudflare`）
- Next Worker 入口：`wrangler.json` 的 `main = .open-next/worker.js`

迁到 Start 后，这套注入方式会变，需要你在 Start/Worker 运行时提供等价的 `env.DB` 获取路径。

### 6) 其它 Next 专属点

- 字体：`app/layout.tsx` 用了 `next/font/google`
- 图片：少量 `next/image`
- 链接：少量 `next/link`

## 推荐迁移策略（最稳妥的）

核心目标：**让 Start 上线时，旧 Next 仍可提供 API（尤其 `/api/orpc`）**，先迁 UI，再迁 API。

### 阶段 0：做“解耦准备”（仍运行在 Next）

这一步的价值是：让你在不动路由/部署的情况下，先把“Next 专属 API”抽掉，后续 UI 迁移成本会显著下降。

1) **i18n 解耦**
   - 目标：把 `next-intl`（Next-only）逐步迁到一个框架无关的方案（例如 `use-intl`/`i18next` 任一均可）。
   - 保留现有 `messages/*.json` 与 `LOCALE_COOKIE_NAME` 逻辑。
   - 产出：UI 代码里不再直接 import `next-intl`。

2) **路由/Link 解耦**
   - 目标：把 `next/link`、`next/navigation` 的使用收敛到你自己的适配层（例如 `lib/platform/router`）。
   - 产出：组件层不再“直接依赖 Next”。

3) **`next/headers` 解耦（cookies/headers）**
   - 目标：把“读取/写入 cookie”的地方变成一个抽象接口（request/response 级别），为 Start 的 request context 留好口子。
   - 重点文件：`app/layout.tsx`、`i18n/request.ts`、`app/(workspace)/_actions/set-locale.ts`、`lib/orpc/client.ts`（SSR 时 forward headers）。

4) **确认是否真的需要“请求拦截/保护”（workspace basic auth）**
   - Next.js 16 推荐用 `proxy.ts` 约定（替代旧的 `middleware.ts`）。避免新增 `middleware.ts`，否则会出现 deprecated 警告，且可能无法识别你通过 re-export 的 `config`。
   - 如果你确实要保护 `/media`、`/proxy`、`/api`：确认 `proxy.ts` 的 `config.matcher` 覆盖这些路径，并在本地用 `WORKSPACE_PROTECT=1` 做一次验证。

### 阶段 1：并行引入 TanStack Start（不影响现网）

1) 在仓库里新增一个 Start 应用（建议 `apps/start` 或 `apps/web`），并把它加入 `pnpm-workspace.yaml`。
2) 先做最小可运行：
   - SSR 开启（TanStack Router + Query）
   - Tailwind v4 跑通
   - `~/` tsconfig paths 在 Vite 下可用（你已经有 `vite-tsconfig-paths`）
3) Start 应用的 API 先只做“静态页面 + 登录页”，所有数据请求依旧打到旧 Next 的 `/api/orpc`。

### 阶段 2：UI 路由迁移（Start 逐页替换）

按页面重要性从低到高迁：

1) `app/page.tsx`、`app/privacy/page.tsx`
2) `app/login/page.tsx`
3) Workspace：
   - `/media`、`/media/[id]/*`、`/tasks`、`/points`、`/proxy`、`/channels`
4) Admin：
   - `/admin/*`

迁移关键点：

- Next 的“服务端组件 + `dehydrate()`”模式，可在 Start 侧用 **Route loader** 做预取，然后在页面侧用 Hydration/QueryClient 复用。
- `notFound()`（Next）在 Start 里通常对应 `notFound()`/`redirect()`（TanStack Router 有等价机制），需要逐个路由改造。

### 阶段 3：切流（Cloudflare 路由拆分，最小风险）

推荐的 Cloudflare 路由拆分方式：

- 旧 Next Worker（现网）：继续接管 **`/api/*`**（以及你想保留的回调路由，如 `/api/render/cf-callback`）。
- 新 Start Worker：接管 **`/*`**（页面/静态资源）。

Cloudflare 的 route pattern 支持“更具体的匹配优先”，所以只要你把 `/api/*` 明确路由到旧 Worker，就能做到：

- 用户访问页面走 Start
- 页面里的数据请求仍走旧 Next 的 `/api/orpc`

### 阶段 4：API 迁移（可选，但长期更干净）

等 UI 稳定后，你可以把以下从 Next Route Handler 迁到 Start/独立 Worker：

- `app/api/orpc/[...slug]/route.ts`
- `app/api/openapi/route.ts`
- `app/api/media/**`
- `app/api/internal/**`
- `app/api/render/cf-callback/route.ts`

建议长期形态是 **“API Worker + Web Worker”** 分离（更符合 Cloudflare 体系，也能减少框架耦合）。

## 迁移难点/风险清单（结合本仓库）

1) **`next-intl` → 非 Next i18n**
   - 你现在既有 server `getTranslations`，也有 client `useTranslations`，需要统一迁移。
2) **Cloudflare D1 env 获取**
   - `lib/db/index.ts` 目前绑定 OpenNext。Start 需要新的 `env.DB` 注入路径。
3) **Node 兼容**
   - `lib/auth/session.ts` 使用 `node:crypto`；在 Cloudflare Worker 侧要么启用 `nodejs_compat`，要么改为 WebCrypto。
4) **NextRequest/NextResponse 类型耦合**
   - `lib/media/stream.ts` 与多个 route handler 依赖 Next 类型，迁 API 时要改为标准 `Request/Response`。

## 我建议你现在就做的 3 件事（性价比最高）

1) 确认你是否真的需要 `proxy.ts` 的 Basic Auth；如果需要，先把 `proxy.ts` 的 matcher/allowlist 跑通并验证，再迁到 Start/Worker 等价中间件。
2) 把 i18n 从 `next-intl` 迁到框架无关方案（保留消息文件结构），这是最大“锁死点”。
3) 把 `next/navigation`/`next/link` 的使用收敛到一层自定义适配（后续 Start 只需要换适配层实现）。

---

如果你愿意，我可以下一步直接在仓库里做两件“可见成果”（你选其一或都要）：

1) 新增 `docs/MIGRATION_CHECKLIST_START.md`：把上面的阶段拆成可执行 checklist（含每个路由/组件的改造点）。
2) 直接在仓库里 bootstrap 一个 `apps/start`（TanStack Start + Tailwind + tsconfig paths），并给出 Cloudflare 路由拆分的 `wrangler.*` 示例配置。
