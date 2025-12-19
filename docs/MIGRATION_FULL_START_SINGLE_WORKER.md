# 全量迁移：TanStack Start 单 Worker（页面 + API）

目标：只部署 `apps/start` 一个 Worker，接管 `/*` 与 `/api/*`，不再依赖 Next/OpenNext。

## 本仓库已具备的前置条件

- Start 工程：`apps/start`
- API 对齐：Next 的 `app/api/**/route.ts`（10 个）在 Start 侧已有对应 `apps/start/src/routes/api.*`
- D1 注入：`apps/start/src/worker.ts` 在 `fetch()` 注入 `env.DB` 到 `~/lib/db`

## 本地开发（不跑 Next）

- 推荐（更贴近 Cloudflare 运行时）：`pnpm dev`（Start root）或 `pnpm dev:gray`（Start 挂在 `/__start/*`）
- 如需临时继续 proxy 到旧 Next（仅本地过渡）：`pnpm dev:legacy`（Vite dev，会把 `/api`、`/media` 转发到 `VITE_NEXT_API_ORIGIN`）
- 仅做纯前端/组件开发（Vite dev）：`pnpm dev:vite` / `pnpm dev:vite:gray`

## 线上部署（单 Worker 接管）

- 部署 root：`pnpm deploy:start:root`（使用 `apps/start/wrangler.root.jsonc`）
- Cloudflare routes：确保只有 `vid-genius-start`（Start Worker）接管：
  - `your-domain.com/*`
  - `your-domain.com/api/*`

## Workspace Basic Auth（可选）

Start Worker 侧已实现与 Next 类似的 Basic Auth：

- 开启：`WORKSPACE_PROTECT=1`
- 配置：
  - `WORKSPACE_AUTH_USERNAME`
  - `WORKSPACE_AUTH_PASSWORD`
- 默认允许公开回调：`/api/render/cf-callback`

实现入口：`apps/start/src/worker.ts`

## 下线 Next（可选但推荐）

当确认 Start 线上稳定后，再清理 Next/OpenNext：

- 不再部署：`wrangler.json` / `wrangler.api.json` 对应的 Next Worker
- 清理代码与依赖：
  - 删除 Next 路由与页面：`app/`
  - 删除 Next 配置：`next.config.ts`、`open-next.config.ts`
  - 删除 Next 运行期保护：`proxy.ts`
  - 移除依赖：`next`、`next-intl`、`eslint-config-next`、`@opennextjs/cloudflare`
  - 更新根 `package.json`：移除 Next 的 `build/start/lint` 脚本，保留 `apps/start` 为主入口
