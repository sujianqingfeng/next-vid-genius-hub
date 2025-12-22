# 仓库目录结构迁移清单（Root 只做 Orchestration）

目标：

- 根目录只保留 orchestration（统一脚本、packages、containers、workers、docs）。
- Web 应用迁移到 `apps/web`（TanStack Start + Vite + Wrangler root worker）。
- Orchestrator Worker 迁移到 `workers/media-orchestrator`。
- Remotion 项目作为共享 workspace 包 `packages/remotion-project`，同时供：
	- Web UI（预览播放器、模板选择等）
	- `renderer-remotion` 容器（bundle/render）

本清单按“可回滚、每一步可验收”拆分，建议每个 Phase 结束都运行验收命令并在 git 里做一次 checkpoint（commit 或 tag）。

---

## Phase 0：准备（必做）

- 确保工作区干净：`git status`
- 新建迁移分支：`git switch -c chore/repo-layout`
- 记录迁移前基线（后续对照）：
	- Web（Worker runtime）：`pnpm dev`
	- Web（Vite dev）：`pnpm dev:vite`
	- Orchestrator：`pnpm cf:dev`
	- 测试：`pnpm test`（如当前可跑）

---

## Phase 1：扩展 workspace（不搬代码）

目标：让 workspace 识别 `apps/*` 与 `workers/*`，为后续搬迁做准备。

1) 创建目录

- `mkdir -p apps/web workers`

2) 更新 `pnpm-workspace.yaml`

- `packages/*` 之外新增：
	- `apps/*`
	- `workers/*`

验收：

- `pnpm -w install`

---

## Phase 2：迁移 Orchestrator Worker

目标：`cloudflare/media-orchestrator` → `workers/media-orchestrator`，根目录脚本继续可一键启动。

1) 目录搬迁

- `git mv cloudflare/media-orchestrator workers/media-orchestrator`

2) Wrangler 配置跟随工程移动（推荐）

- `git mv wrangler.toml workers/media-orchestrator/wrangler.toml`
- 更新 `workers/media-orchestrator/wrangler.toml`：
	- `main = "index.ts"`
	- `tsconfig = "tsconfig.json"`
	- 删除/修正任何写死的 `cloudflare/media-orchestrator/...` 路径

3) 根目录脚本改为 `wrangler --cwd`

根目录 `package.json`：

- `cf:dev`：
	- `wrangler --cwd workers/media-orchestrator dev --config wrangler.toml --env local-lite --port 8787`
- `cf:deploy`：
	- `wrangler --cwd workers/media-orchestrator deploy --config wrangler.toml --env production`

4) 更新 `.gitignore`

- 把 `cloudflare/media-orchestrator/...` 相关忽略规则改为 `workers/media-orchestrator/...`

验收：

- `pnpm cf:dev` 能启动
- （可选）配合 `pnpm dev:stack` 跑一次 orchestrator 触发链路（至少 `/start` / `/status`）

回滚：

- 将目录移回并还原脚本/配置即可

---

## Phase 3：迁移 Web 应用到 `apps/web`

目标：根目录不再承载 Web 应用代码与配置，统一通过根目录脚本转发运行。

1) 搬迁文件/目录（建议用 `git mv`）

- `src/` → `apps/web/src/`
- `public/` → `apps/web/public/`
- `vite.config.ts` → `apps/web/vite.config.ts`
- `vitest.config.ts` → `apps/web/vitest.config.ts`
- `postcss.config.mjs` → `apps/web/postcss.config.mjs`
- `wrangler.root.jsonc` → `apps/web/wrangler.root.jsonc`
- `wrangler.vite.jsonc` → `apps/web/wrangler.vite.jsonc`
- `drizzle/` → `apps/web/drizzle/`
- `drizzle.config.ts` → `apps/web/drizzle.config.ts`
- `tsconfig.json` → `apps/web/tsconfig.json`
- `components.json` → `apps/web/components.json`
- （可选）`.env` → `apps/web/.env`（Vite 默认从 cwd 读取 env）

2) 拆分 package.json

- 新建 `apps/web/package.json`（建议 `name: "@app/web"`）：
	- 搬迁 Web 相关 `scripts/deps/devDeps`
	- Web 相关脚本推荐全部使用 `wrangler --cwd .`，避免相对路径踩坑
- 根目录 `package.json`（orchestration）：
	- 新增：
		- `dev:web` → `pnpm -C apps/web dev`
		- `dev:web:vite` → `pnpm -C apps/web dev:vite`
		- `build:web` → `pnpm -C apps/web build`
		- `deploy:web` → `pnpm -C apps/web deploy`
		- `test:web` → `pnpm -C apps/web test`
	- 保留：
		- `dev:stack*`（容器）
		- `build:packages` / `typecheck:packages`
		- `cf:dev` / `cf:deploy`

3) tsconfig 基础配置（推荐）

- 根目录新增 `tsconfig.base.json`（抽公共 compilerOptions）
- `apps/web/tsconfig.json`：`extends: "../../tsconfig.base.json"`
- 根 `tsconfig.packages.json` 保持给 `packages/*` 使用

4) 更新 `apps/web/vite.config.ts`

- `cloudflare({ configPath: 'wrangler.vite.jsonc' })` 确保相对 `apps/web/` 工作

5) 更新 `apps/web` 的 DB/Wrangler 脚本路径

- `db:d1:*` 脚本使用 `wrangler --cwd . --config wrangler.root.jsonc ...`

验收：

- `pnpm dev:web:vite`
- `pnpm dev:web`（wrangler dev）
- `pnpm build:web`
- `pnpm test:web`

---

## Phase 4：Remotion 作为共享 workspace 包（Web UI + 容器共用）

目标：消除 `@remotion/*` 本地别名与真实 scope 冲突；让 Remotion 项目成为正式 workspace 依赖。

1) 新建包 `packages/remotion-project`

- 建议包名：`@app/remotion-project`
- 导出最少三个入口：
	- `@app/remotion-project/templates`
	- `@app/remotion-project/types`
	- 供 bundler 入口（给容器用，例如 `@app/remotion-project/entry` 或直接文件路径）

2) 共享类型收敛到 domain 包（避免 remotion 依赖 apps/web）

- 在 `packages/media-domain` 新增 `media-types.ts`：
	- `VideoInfo`、`Comment` 等 Remotion 与 Web 都需要的最小类型
- Web 侧 `apps/web/src/lib/media/types/index.ts` 保留文件但改为 re-export（或全仓替换为 domain import）

3) Web 侧替换本地别名 import

- 替换：
	- `@remotion/templates` → `@app/remotion-project/templates`
	- `@remotion/types` → `@app/remotion-project/types`
- 删除 `apps/web/tsconfig.json` 内 `paths["@remotion/*"]`（避免与真实 `@remotion/*` scope 冲突）

4) renderer-remotion 容器更新

- `containers/renderer-remotion/Dockerfile`：
	- `COPY remotion ./remotion` 改为 copy `packages/remotion-project/...`
	- `COPY public ./public` 改为 copy `apps/web/public`
- `containers/renderer-remotion/index.mjs`：
	- `entryPoint: .../remotion/index.ts` 改为新位置的入口

验收：

- `pnpm dev:stack:rebuild-remotion` 可 build
- 跑一次 `renderer-remotion` 任务能完成 bundling + render

---

## Phase 5：收尾与文档更新

1) `.gitignore` 收口

- 新增/确认：
	- `apps/**/dist`
	- `apps/**/.wrangler`
	- `workers/**/.wrangler`

2) 更新 `docs/DEV.md`

- 替换旧路径：
	- `cloudflare/media-orchestrator` → `workers/media-orchestrator`
	- Web 启动：`pnpm dev` → `pnpm dev:web`

3) 清理遗留包

- 已移除空/遗留包（无引用）：
	- `packages/callback-client`
	- `packages/webhook-gateway`
	- `packages/callback-registry`

---

## 迁移完成后的统一入口（建议）

- Web：
	- `pnpm dev:web`
	- `pnpm dev:web:vite`
	- `pnpm build:web`
- Orchestrator：
	- `pnpm cf:dev`
	- `pnpm cf:deploy`
- 容器：
	- `pnpm dev:stack`
	- `pnpm dev:stack:restart-remotion`
