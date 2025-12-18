# Migration Checklist：TanStack Start（可执行版）

目标：在**不影响现网**的前提下，把“页面/UI”逐步迁到 TanStack Start，并通过 Cloudflare route pattern 灰度切流；API 先留在旧 Next Worker。

> 本 checklist 假设你继续部署在 Cloudflare Workers，并且暂时保留现有的 `wrangler.toml`（media-orchestrator）与 `wrangler.json`（OpenNext/Next Worker）。

## A. Bootstrap 一个 Start 应用（并行、不动现网）

1) 把 `apps/*` 加入 workspace（可选但推荐）
   - 修改 `pnpm-workspace.yaml`：
     - 增加：`- 'apps/*'`

2) 生成 Start 工程（Cloudflare + Biome + Tailwind）
   - 在仓库根目录执行：
     - `pnpm create @tanstack/start@latest vid-genius-start --framework React --deployment cloudflare --toolchain biome --tailwind --package-manager pnpm --no-git --target-dir apps/start --add-ons tanstack-query,oRPC,drizzle`

3) 让 Start 可以复用你现有的路径别名与共享代码（建议做其一）
   - 方案 1（推荐，低侵入）：让 Start app 直接 import 仓库根目录的 `~/lib`、`~/components` 等
     - 在 `apps/start` 的 Vite 配置里放开 `server.fs.allow`（允许访问 `../../`）
     - 配置 `resolve.alias`：把 `~` 指到仓库根（`../../`）
     - 让 `apps/start/tsconfig.json` `extends` 根 `tsconfig.json`，保持 `paths` 一致
   - 方案 2（更干净，中期工程）：把 `lib/`、`components/` 迁到 workspace package（例如 `packages/web-shared`），Start/Next 都依赖该 package

4) Start 先只跑“静态页面”验证部署链路
   - 目标：Start Worker 能在 Cloudflare 上跑起来（哪怕只有一个首页）

## B. Cloudflare 灰度切流（Start 页面 + 旧 Next API）

建议采用这种拆分方式（最小风险）：

- 旧 Next Worker：继续接管 `/api/*`
- 新 Start Worker：接管 `/*`

这样 Start 的页面请求会落到 Start Worker，但页面里的数据请求（oRPC 等）仍然落到旧 Next 的 `/api/orpc`。

落地步骤：

1) 先把 Start Worker 绑定到测试路径（例如 `/__start/*`）进行验证
2) 通过 Cloudflare route pattern 配置两条路由（“更具体的优先”）：
   - `your-domain.com/api/*` → Next Worker
   - `your-domain.com/*` → Start Worker

## C. UI 迁移顺序（按依赖复杂度）

优先迁“无复杂 SSR/无动态路由”的页面，建立信心：

1) `app/page.tsx` → Start route：`/`
2) `app/privacy/page.tsx` → Start route：`/privacy`
3) `app/login/page.tsx` → Start route：`/login`

然后迁 Workspace（依赖最多但价值最大）：

4) `app/(workspace)/layout.tsx`（侧边栏 + auth gate）
5) `app/(workspace)/media/page.tsx`
6) `app/(workspace)/media/[id]/page.tsx`
7) `app/(workspace)/media/[id]/comments/page.tsx`
8) `app/(workspace)/media/download/page.tsx`
9) `app/(workspace)/tasks/page.tsx`（search params）
10) `app/(workspace)/points/page.tsx`
11) `app/(workspace)/proxy/page.tsx`
12) `app/(workspace)/channels/page.tsx`

最后迁 Admin：

13) `app/admin/layout.tsx`
14) `app/admin/*/page.tsx`

## D. 迁移时要同时解决的“框架耦合点”

### 1) `next/navigation` / `next/link` / `next/image`

目标：把这些 import 收敛到适配层，否则每迁一个组件都要改一遍。

建议你在 Next 侧先做适配（不改变功能），例如：

- `components` 里统一改用 `~/lib/platform/link`（内部 Next 版本用 `next/link`，Start 版本用 TanStack Router 的 `Link`）
- `useRouter`/`useSearchParams`/`usePathname` 也做同样处理
- `next/image` 迁到一个 `Image` wrapper（Start 先用 `<img>`，后续再决定是否接 Cloudflare Images/自建优化）

### 2) i18n（`next-intl`）

这是你现在最大的“锁死点”：

- 服务端：`getTranslations`（例如 `app/(workspace)/page.tsx`）
- 客户端：`useTranslations`（多处）
- cookie：`i18n/request.ts`、`app/(workspace)/_actions/set-locale.ts`

建议迁移策略：

1) 把消息源继续用 `messages/*.json`（不动）
2) 把 `next-intl` 逐步替换为“框架无关”库（例如 `use-intl` 或 `i18next`）
3) cookie/locale 读取逻辑变成你自己的 request util（Start/Next 都能用）

### 3) D1/Cloudflare env（`lib/db/index.ts`）

现在 `lib/db/index.ts` 依赖 `@opennextjs/cloudflare` 的 `getCloudflareContext`。

Start 侧需要你在 request handler/loader 的上下文里提供 `env.DB`，否则：

- 所有 `getDb()` 调用都会失败（这是全局性的）

落地做法（推荐方向）：

- 把 `getDb()` 改造成“可注入 env”的形式（例如 `getDb({ env })` 或 AsyncLocalStorage 注入）
- Start/Next 各自负责把 Cloudflare bindings 注入进去

### 4) Node 兼容（`node:crypto`）

`lib/auth/session.ts` 使用 `node:crypto`：

- 如果 Start Worker 不启用 `nodejs_compat`，这里需要改为 WebCrypto
- 如果你希望最省事：在 Start 的 Worker 配置里也启用 `nodejs_compat`

### 5) 你现在的 Basic Auth guard 是否生效（Next 16 用 `proxy.ts`）

Next.js 16 使用 `proxy.ts` 约定替代 `middleware.ts`。

- 如果你需要“workspace protect”：确认 `proxy.ts` 的 `config.matcher` 覆盖需要保护的路径，并设置 `WORKSPACE_PROTECT=1` 做一次本地验证。

## E. API 迁移（可选：等 UI 稳定再做）

当 UI 已经跑在 Start，并且你想彻底去掉 Next 后，再迁 API：

- `app/api/orpc/[...slug]/route.ts`
- `app/api/openapi/route.ts`
- `app/api/media/**`
- `app/api/internal/**`
- `app/api/render/cf-callback/route.ts`

建议最终形态：

- `web`（Start）Worker：只服务页面与静态资源
- `api` Worker：服务 `/api/*`（oRPC/OpenAPI/媒体流式接口/回调）
