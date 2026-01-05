# apps/web/src 目录重构计划

## 目标
- 优化目录结构，提升代码可维护性
- 清晰划分职责边界
- 建立统一的文件命名规范
- 采用分批次全量迁移策略，不使用 re-export
- 使用脚本替换 + oxlint 确保迁移质量（必要时用 AST 脚本提升安全性）

## 重构范围
- `apps/web/src/lib/` 目录重组
- `components/business/media/subtitles/` 扁平化
- `routes/` 与 `components/business/` 职责明确化
- `orpc/` 目录整合
- 文件命名规范化

---

## 第一阶段：lib/ 目录重构

### 1.1 当前结构
```
lib/
├── ai/
├── auth/
├── cloudflare/
├── config/
├── db/
├── errors/
├── hooks/
├── i18n/
├── job/
├── logger/
├── media/
├── orpc/
├── pagination.ts
├── points/
├── providers/
├── proxy/
├── query/
├── remotion/
├── subtitle/
├── thread/
├── theme/
├── types/
└── utils/
```

### 1.2 目标结构
```
lib/
├── domain/              # 核心业务域
│   ├── media/
│   │   ├── comments-snapshot.ts
│   │   ├── resolve-cloud-video-key.ts
│   │   ├── source.ts
│   │   ├── stream.ts
│   │   ├── server/
│   │   └── types/
│   ├── thread/
│   │   └── [existing thread files]
│   └── points/
│       └── [moved from lib/points]
│
├── infra/               # 基础设施层
│   ├── db/
│   │   └── [existing db files]
│   ├── cloudflare/
│   │   └── [existing cloudflare files]
│   ├── storage/
│   │   └── [if exists]
│   ├── proxy/
│   │   ├── check.ts
│   │   ├── default-proxy.ts
│   │   ├── filter.ts
│   │   ├── host.ts
│   │   ├── parser.ts
│   │   ├── pick-best-success-proxy.ts
│   │   ├── proxy-settings.ts
│   │   ├── resolve-success-proxy.ts
│   │   ├── server/
│   │   ├── __tests__/
│   │   └── utils.ts
│   └── logger/
│       ├── index.ts
│       ├── formatters.ts
│       └── types.ts
│
├── features/            # 功能特性层
│   ├── auth/
│   │   └── [existing auth files]
│   ├── ai/
│   │   └── [moved from lib/ai]
│   ├── job/
│   │   └── [existing job files]
│   ├── subtitle/
│   │   └── [moved from lib/subtitle]
│   └── remotion/
│       └── [existing remotion files]
│
├── shared/              # 共享工具
│   ├── types/
│   │   └── [existing types]
│   ├── utils/
│   │   └── [existing utils]
│   ├── errors/
│   │   └── [existing errors]
│   ├── hooks/
│   │   ├── media/
│   │   ├── proxy/
│   │   ├── auth/
│   │   └── index.ts
│   ├── providers/
│   │   └── [existing providers]
│   ├── query/
│   │   └── [existing query]
│   ├── i18n/
│   │   └── [existing i18n]
│   ├── theme/
│   │   └── [existing theme]
│   ├── config/
│   │   └── [existing config]
│   └── pagination.ts
│
```

### 1.3 迁移步骤
1. 创建新目录结构
2. 批量移动文件（使用 git mv 保持历史）
3. 使用脚本批量替换导入路径（优先仅改 import/export 的 module specifier）
4. 运行 oxlint 验证无旧路径导入
5. 运行测试验证
6. 提交独立 PR

### 1.4 迁移映射表
| 旧路径 | 新路径 |
|--------|--------|
| `lib/media/` | `lib/domain/media/` |
| `lib/thread/` | `lib/domain/thread/` |
| `lib/points/` | `lib/domain/points/` |
| `lib/ai/` | `lib/features/ai/` |
| `lib/auth/` | `lib/features/auth/` |
| `lib/job/` | `lib/features/job/` |
| `lib/subtitle/` | `lib/features/subtitle/` |
| `lib/remotion/` | `lib/features/remotion/` |
| `lib/db/` | `lib/infra/db/` |
| `lib/cloudflare/` | `lib/infra/cloudflare/` |
| `lib/proxy/` | `lib/infra/proxy/` |
| `lib/logger/` | `lib/infra/logger/` |
| `lib/types/` | `lib/shared/types/` |
| `lib/utils/` | `lib/shared/utils/` |
| `lib/errors/` | `lib/shared/errors/` |
| `lib/hooks/` | `lib/shared/hooks/` |
| `lib/providers/` | `lib/shared/providers/` |
| `lib/query/` | `lib/shared/query/` |
| `lib/i18n/` | `lib/shared/i18n/` |
| `lib/theme/` | `lib/shared/theme/` |
| `lib/config/` | `lib/shared/config/` |
| `lib/orpc/` | `orpc/`（见第四阶段） |
| `lib/pagination.ts` | `lib/shared/pagination.ts` |

---

## 第二阶段：subtitles 组件扁平化

### 2.1 当前结构
```
components/business/media/subtitles/
├── TimeSegmentEffects/
│   ├── TimeSegmentEffectsManager.tsx
│   └── TimelineSelector.tsx
├── SubtitleConfig/
│   └── SubtitleConfigControls.tsx
├── SubtitleOverlay/
│   ├── SubtitleOverlay.tsx
│   └── index.ts
├── HintTextConfig/
│   └── HintTextConfigControls.tsx
├── HintTextOverlay/
│   ├── HintTextOverlay.tsx
│   └── index.ts
├── VideoPreview/
│   └── VideoPreview.tsx
└── Step3Render.tsx
```

### 2.2 目标结构
> 说明：这里的“扁平化”优先指 **移除子目录、统一同级组织**，不强制把多个组件合并成一个超大文件；合并仅在确实能降低复杂度时进行。

```
components/business/media/subtitles/
├── media-subtitles-page.tsx                    # 主页面（已存在）
├── preview-pane.tsx                            # 预览容器（由 PreviewPane.tsx 重命名）
├── time-segment-effects-manager.tsx            # 原 TimeSegmentEffectsManager
├── timeline-selector.tsx                       # 原 TimelineSelector
├── subtitle-config-controls.tsx                # 原 SubtitleConfigControls
├── subtitle-overlay.tsx                        # 原 SubtitleOverlay
├── hint-text-config-controls.tsx               # 原 HintTextConfigControls
├── hint-text-overlay.tsx                       # 原 HintTextOverlay
├── video-preview.tsx                           # 原 VideoPreview
├── render-step.tsx                             # 原 Step3Render
└── index.ts                                    # 统一导出（可选）
```

### 2.3 迁移步骤
1. 创建新文件
2. 将子目录内容移动到同级并按需重命名（仅在确实能降低复杂度时合并）
3. 使用脚本批量替换导入路径
4. 运行 oxlint 验证无旧路径导入
5. 运行测试验证
6. 删除旧子目录

### 2.4 文件映射表
| 旧路径 | 新路径 | 说明 |
|--------|--------|------|
| `PreviewPane.tsx` | `preview-pane.tsx` | 仅重命名并保持职责清晰 |
| `TimeSegmentEffects/TimeSegmentEffectsManager.tsx` | `time-segment-effects-manager.tsx` | 扁平化；必要时再考虑合并 |
| `TimeSegmentEffects/TimelineSelector.tsx` | `timeline-selector.tsx` | 扁平化 |
| `SubtitleConfig/SubtitleConfigControls.tsx` | `subtitle-config-controls.tsx` | 扁平化 + 重命名 |
| `SubtitleOverlay/SubtitleOverlay.tsx` | `subtitle-overlay.tsx` | 扁平化 + 重命名 |
| `HintTextConfig/HintTextConfigControls.tsx` | `hint-text-config-controls.tsx` | 扁平化 + 重命名 |
| `HintTextOverlay/HintTextOverlay.tsx` | `hint-text-overlay.tsx` | 扁平化 + 重命名 |
| `VideoPreview/VideoPreview.tsx` | `video-preview.tsx` | 扁平化 + 重命名 |
| `Step3Render.tsx` | `render-step.tsx` | 扁平化 + 重命名 |

---

## 第三阶段：routes 与 components/business 职责明确化

### 3.1 当前问题
- 部分路由文件包含复杂业务逻辑
- 部分页面组件与路由组件职责不清

### 3.2 职责划分
- **routes/**：仅包含路由配置和入口，保持轻量
- **components/business/**：包含页面级组件和复杂业务逻辑

### 3.3 命名规范
| 类型 | 命名模式 | 位置 |
|------|----------|------|
| 路由入口 | `route.tsx`（TanStack file-route 约定） | `routes/**/route.tsx` |
| 页面组件 | `*-page.tsx` | `components/business/` |
| 布局组件 | `*-layout.tsx` | `components/business/layout/` |
| 卡片组件 | `*-card.tsx` | `components/business/` |
| 表单组件 | `*-form.tsx` | `components/business/` |
| API 路由 | `$action.ts` 或 `$id.ts` | `routes/api/` |

### 3.4 重构示例

**当前结构：**
```
routes/media/$id/index.tsx          # 路由入口（loader + 渲染页面组件）
components/business/media/detail/media-detail-page.tsx  # 页面组件（被 routes 引用）
```

**目标结构：**
```
routes/media/$id/
├── route.tsx                        # 布局/Outlet（如需要）
└── index.tsx                        # 具体页面路由（loader + 渲染页面组件）
components/business/media/
├── media-detail-page.tsx            # 主页面组件
├── comments/
│   └── comments-page.tsx
└── subtitles/
    └── media-subtitles-page.tsx
```

**route.tsx / index.tsx 示例（保持 routes 轻量）：**
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { MediaDetailPage } from '~/components/business/media/detail/media-detail-page'

export const Route = createFileRoute('/media/$id/')({
	component: MediaDetailRoute,
})

function MediaDetailRoute() {
	const { id } = Route.useParams()
	return <MediaDetailPage id={id} />
}
```

### 3.5 迁移步骤
1. 识别需要重构的路由文件
2. 将业务逻辑提取到 `components/business/` 中
3. 简化路由文件为仅渲染组件
4. 使用脚本批量替换导入路径
5. 运行 oxlint 验证无旧路径导入
6. 运行测试验证

---

## 第四阶段：orpc 目录整合

### 4.1 当前结构
```
apps/web/src/orpc/
├── base.ts
├── router.ts
├── errors.ts
├── procedures/
└── http/
```

### 4.2 目标结构
```
orpc/
├── server/                 # 服务端（router/procedures/base/errors）
│   ├── procedures/
│   ├── router.ts
│   ├── base.ts
│   └── errors.ts
├── client/                 # 客户端（query utils / redirect helper）
│   ├── client.ts
│   └── index.ts
├── http/                     # 与路由暴露相关（handler/openapi）
│   ├── handler.ts
│   └── openapi.ts
└── index.ts                  # 统一导出
```

### 4.3 迁移步骤
1. 创建 `orpc/server/` 目录
2. 移动现有的 `procedures/`、`router.ts`、`base.ts` 到 `server/`
3. 创建 `orpc/client/` 目录（从 `apps/web/src/lib/orpc/` 迁移）
4. 创建 `orpc/http/` 目录（从 `apps/web/src/lib/orpc/server/` 迁移）
5. 使用脚本批量替换导入路径（含 routes/api/orpc、openapi 等）
6. 运行 oxlint 验证无旧路径导入
7. 运行测试验证
8. 删除 `apps/web/src/lib/orpc/` 目录
9. 创建统一的导出文件 `apps/web/src/orpc/index.ts`

---

## 第五阶段：文件命名规范化

### 5.1 命名规范表

| 组件类型 | 命名模式 | 示例 |
|----------|----------|------|
| 路由入口 | `route.tsx` | `routes/media/route.tsx`, `routes/admin/route.tsx` |
| 页面组件 | `*-page.tsx` | `media-detail-page.tsx`, `admin-users-page.tsx` |
| 布局组件 | `*-layout.tsx` | `workspace-layout.tsx`, `admin-layout.tsx` |
| 卡片组件 | `*-card.tsx` | `thread-remotion-editor-card.tsx`, `channel-card.tsx` |
| 列表组件 | `*-list.tsx` | `users-list.tsx`, `media-list.tsx` |
| 表单组件 | `*-form.tsx` | `login-form.tsx`, `media-upload-form.tsx` |
| 模态框组件 | `*-modal.tsx` | `delete-modal.tsx`, `settings-modal.tsx` |
| 表格组件 | `*-table.tsx` | `users-table.tsx`, `jobs-table.tsx` |
| 工具栏组件 | `*-toolbar.tsx` | `media-toolbar.tsx`, `filter-toolbar.tsx` |
| 状态展示组件 | `*-status.tsx` | `job-status.tsx`, `sync-status.tsx` |
| 预览组件 | `*-preview.tsx` | `video-preview.tsx`, `template-preview.tsx` |
| 配置组件 | `*-config.tsx` | `subtitle-config.tsx`, `theme-config.tsx` |

### 5.2 重命名映射表（部分）

| 旧文件名 | 新文件名 |
|----------|----------|
| `components/business/layout/workspace-shell.tsx` | `workspace-layout.tsx` |
| `components/business/layout/workspace-sidebar.tsx` | `sidebar.tsx` |
| `components/business/media/detail/media-detail-page.tsx` | `media-detail-page.tsx` |
| `components/business/media/comments/media-comments-page.tsx` | `comments-page.tsx` |
| `components/business/media/subtitles/media-subtitles-page.tsx` | `media-subtitles-page.tsx` |
| `components/business/jobs/cloud-job-progress.tsx` | `job-progress-card.tsx` |
| `components/business/admin/users/admin-users-page.tsx` | `admin-users-page.tsx` |
| `components/business/agent/agent-chat-page.tsx` | `agent-chat-page.tsx` |

### 5.3 迁移步骤
1. 创建文件重命名脚本
2. 批量重命名文件（使用 git mv）
3. 更新所有导入路径
4. 运行 lint 和测试
5. 更新文档

---

## 第六阶段：分批次全量迁移

### 6.1 迁移策略

采用"分批次全量迁移"策略，不使用 re-export：

#### 核心原则
- 每次迁移一个功能域（如 `lib/media/` → `lib/domain/media/`）
- 使用脚本批量替换 import/export 的 module specifier（必要时用 AST 脚本提升安全性）
- 独立 PR，独立测试，完成后立即删除旧路径
- 使用 oxlint 规则禁止旧路径导入

#### 工具支持

**1. oxlint 规则配置（推荐）**
```jsonc
// apps/web/.oxlintrc.json
{
	"rules": {
		"no-restricted-imports": [
			"error",
			{
				"paths": [
					{ "name": "~/lib/media", "message": "Use ~/lib/domain/media instead" },
					{ "name": "~/lib/thread", "message": "Use ~/lib/domain/thread instead" },
					{ "name": "~/lib/points", "message": "Use ~/lib/domain/points instead" },
					{ "name": "~/lib/ai", "message": "Use ~/lib/features/ai instead" },
					{ "name": "~/lib/auth", "message": "Use ~/lib/features/auth instead" },
					{ "name": "~/lib/job", "message": "Use ~/lib/features/job instead" },
					{ "name": "~/lib/subtitle", "message": "Use ~/lib/features/subtitle instead" },
					{ "name": "~/lib/remotion", "message": "Use ~/lib/features/remotion instead" },
					{ "name": "~/lib/db", "message": "Use ~/lib/infra/db instead" },
					{ "name": "~/lib/cloudflare", "message": "Use ~/lib/infra/cloudflare instead" },
					{ "name": "~/lib/proxy", "message": "Use ~/lib/infra/proxy instead" },
					{ "name": "~/lib/logger", "message": "Use ~/lib/infra/logger instead" },
					{ "name": "~/lib/types", "message": "Use ~/lib/shared/types instead" },
					{ "name": "~/lib/utils", "message": "Use ~/lib/shared/utils instead" },
					{ "name": "~/lib/errors", "message": "Use ~/lib/shared/errors instead" },
					{ "name": "~/lib/hooks", "message": "Use ~/lib/shared/hooks instead" },
					{ "name": "~/lib/providers", "message": "Use ~/lib/shared/providers instead" },
					{ "name": "~/lib/query", "message": "Use ~/lib/shared/query instead" },
					{ "name": "~/lib/i18n", "message": "Use ~/lib/shared/i18n instead" },
					{ "name": "~/lib/theme", "message": "Use ~/lib/shared/theme instead" },
					{ "name": "~/lib/config", "message": "Use ~/lib/shared/config instead" }
				],
				"patterns": [
					{ "group": ["~/lib/media/*"], "message": "Use ~/lib/domain/media instead" },
					{ "group": ["~/lib/thread/*"], "message": "Use ~/lib/domain/thread instead" },
					{ "group": ["~/lib/points/*"], "message": "Use ~/lib/domain/points instead" },
					{ "group": ["~/lib/ai/*"], "message": "Use ~/lib/features/ai instead" },
					{ "group": ["~/lib/auth/*"], "message": "Use ~/lib/features/auth instead" },
					{ "group": ["~/lib/job/*"], "message": "Use ~/lib/features/job instead" },
					{ "group": ["~/lib/subtitle/*"], "message": "Use ~/lib/features/subtitle instead" },
					{ "group": ["~/lib/remotion/*"], "message": "Use ~/lib/features/remotion instead" },
					{ "group": ["~/lib/db/*"], "message": "Use ~/lib/infra/db instead" },
					{ "group": ["~/lib/cloudflare/*"], "message": "Use ~/lib/infra/cloudflare instead" },
					{ "group": ["~/lib/proxy/*"], "message": "Use ~/lib/infra/proxy instead" },
					{ "group": ["~/lib/logger/*"], "message": "Use ~/lib/infra/logger instead" },
					{ "group": ["~/lib/types/*"], "message": "Use ~/lib/shared/types instead" },
					{ "group": ["~/lib/utils/*"], "message": "Use ~/lib/shared/utils instead" },
					{ "group": ["~/lib/errors/*"], "message": "Use ~/lib/shared/errors instead" },
					{ "group": ["~/lib/hooks/*"], "message": "Use ~/lib/shared/hooks instead" },
					{ "group": ["~/lib/providers/*"], "message": "Use ~/lib/shared/providers instead" },
					{ "group": ["~/lib/query/*"], "message": "Use ~/lib/shared/query instead" },
					{ "group": ["~/lib/i18n/*"], "message": "Use ~/lib/shared/i18n instead" },
					{ "group": ["~/lib/theme/*"], "message": "Use ~/lib/shared/theme instead" },
					{ "group": ["~/lib/config/*"], "message": "Use ~/lib/shared/config instead" }
				]
			}
		]
	}
}
```

**2. 批量迁移脚本（不引入 codemod 依赖，直接替换 module specifier）**
```bash
#!/bin/bash
# scripts/migrate-batch.sh

set -e

if [ $# -ne 2 ]; then
  echo "Usage: $0 <old-module> <new-module>"
  echo "Example: $0 media domain/media"
  exit 1
fi

OLD_MODULE=$1
NEW_MODULE=$2

echo "开始迁移: ~/lib/$OLD_MODULE -> ~/lib/$NEW_MODULE"

# 1. 替换导入路径（仅修改 import/export 的 module specifier）
FILES=$(rg -l "['\\\"]~/lib/${OLD_MODULE}(/|['\\\"])"
  apps/web/src --type ts --type tsx || true)

if [ -n "$FILES" ]; then
  perl -pi -e "s#'~/lib/${OLD_MODULE}/#'~/lib/${NEW_MODULE}/#g; s#\\\"~/lib/${OLD_MODULE}/#\\\"~/lib/${NEW_MODULE}/#g; s#'~/lib/${OLD_MODULE}'#'~/lib/${NEW_MODULE}'#g; s#\\\"~/lib/${OLD_MODULE}\\\"#\\\"~/lib/${NEW_MODULE}\\\"#g" $FILES
fi

# 2. 验证无旧路径导入
echo "验证无旧路径导入..."
if rg "from ['\\\"]~/lib/${OLD_MODULE}['\\\"]" apps/web/src --type ts --type tsx | grep -q .; then
  echo "错误：仍有旧路径导入！"
  exit 1
fi

if rg "from ['\\\"]~/lib/${OLD_MODULE}/" apps/web/src --type ts --type tsx | grep -q .; then
  echo "错误：仍有旧路径导入！"
  exit 1
fi

echo "✓ 无旧路径导入"

# 3. 运行测试
echo "运行测试..."
pnpm test:web || exit 1

# 4. 类型检查
echo "类型检查..."
pnpm -C apps/web exec tsc --noEmit || exit 1

# 5. 运行 lint
echo "运行 lint..."
pnpm lint:web || exit 1

echo "✓ 迁移完成！"
echo "请提交 PR："
echo "  feat: migrate lib/${OLD_MODULE} to lib/${NEW_MODULE}"
```

### 6.2 分批迁移顺序

按依赖关系从底层到顶层迁移：

#### Batch 1: shared 层（最底层，无依赖）
- `lib/types/` → `lib/shared/types/`
- `lib/utils/` → `lib/shared/utils/`
- `lib/errors/` → `lib/shared/errors/`
- `lib/hooks/` → `lib/shared/hooks/`
- `lib/providers/` → `lib/shared/providers/`
- `lib/query/` → `lib/shared/query/`
- `lib/i18n/` → `lib/shared/i18n/`
- `lib/theme/` → `lib/shared/theme/`
- `lib/config/` → `lib/shared/config/`
- `lib/pagination.ts` → `lib/shared/pagination.ts`

#### Batch 2: infra 层（依赖 shared）
- `lib/db/` → `lib/infra/db/`
- `lib/cloudflare/` → `lib/infra/cloudflare/`
- `lib/proxy/` → `lib/infra/proxy/`
- `lib/logger/` → `lib/infra/logger/`

#### Batch 3: features 层（依赖 shared + infra）
- `lib/auth/` → `lib/features/auth/`
- `lib/job/` → `lib/features/job/`
- `lib/subtitle/` → `lib/features/subtitle/`
- `lib/remotion/` → `lib/features/remotion/`
- `lib/ai/` → `lib/features/ai/`

#### Batch 4: domain 层（依赖 features）
- `lib/media/` → `lib/domain/media/`
- `lib/thread/` → `lib/domain/thread/`
- `lib/points/` → `lib/domain/points/`

#### Batch 5: orpc 层（独立迁移）
- `lib/orpc/` → `orpc/`

### 6.3 迁移清单（Batch 示例）

**Batch 1.1: lib/types → lib/shared/types**
```bash
# 1. 创建新目录
mkdir -p apps/web/src/lib/shared/types

# 2. 移动文件
git mv apps/web/src/lib/types apps/web/src/lib/shared/

# 3. 批量替换导入路径
./scripts/migrate-batch.sh types shared/types

# 4. 验证
rg "from ['\\\"]~/lib/types['\\\"]" apps/web/src --type ts --type tsx  # 应该无结果
rg "from ['\\\"]~/lib/types/" apps/web/src --type ts --type tsx        # 应该无结果

# 5. 测试
pnpm test:web
pnpm -C apps/web exec tsc --noEmit
pnpm lint:web

# 6. 提交 PR
git add -A
git commit -m "feat: migrate lib/types to lib/shared/types"
```

### 6.4 时间表

| 时间 | Batch | 内容 | 预计耗时 |
|------|-------|------|----------|
| Week 1 | 准备期 | 配置 oxlint 规则、创建迁移脚本 | 2-3 天 |
| Week 1-2 | Batch 1 | shared 层迁移（9 个模块） | 3-4 天 |
| Week 2 | Batch 2 | infra 层迁移（4 个模块） | 2-3 天 |
| Week 3 | Batch 3 | features 层迁移（5 个模块） | 3-4 天 |
| Week 4 | Batch 4 | domain 层迁移（3 个模块） | 2-3 天 |
| Week 4 | Batch 5 | orpc 层迁移 | 1 天 |
| Week 4-5 | 验证期 | 全面测试、修复遗留问题 | 2-3 天 |

### 6.5 验证清单

每个 Batch 完成后检查：
- [ ] 所有导入路径已更新
- [ ] 无旧路径导入（oxlint 通过）
- [ ] 测试通过
- [ ] 类型检查通过
- [ ] 构建成功
- [ ] 旧路径已删除
- [ ] PR 已合并

### 6.6 风险控制

| 风险 | 缓解措施 |
|------|----------|
| 批量替换出错 | 优先仅替换 import/export 的 module specifier；必要时使用 AST 脚本；先在测试环境验证 |
| 漏改导入路径 | oxlint 规则立即报错；CI 失败则不合并 PR |
| 构建失败 | 每个批次独立测试和 PR；CI 必须全部通过 |
| 团队协作冲突 | 分功能域迁移，减少冲突；PR 审查严格 |
| 回滚困难 | 使用 git mv，可快速回滚；保留 git 历史完整性 |

---

## 执行顺序

### 顺序建议（避免相互依赖）

1. **第一阶段**：lib/ 目录重构（基础，影响最广）
2. **第四阶段**：orpc 目录整合（独立，依赖少）
3. **第三阶段**：routes 与 components/business 职责明确化（依赖 lib/ 结构）
4. **第二阶段**：subtitles 组件扁平化（相对独立）
5. **第五阶段**：文件命名规范化（最后进行，减少冲突）
6. **第六阶段**：分批次全量迁移（贯穿第一至四阶段）

### 重要说明

第六阶段（分批次全量迁移）是第一至四阶段的执行策略，而非独立阶段：

- **第一阶段执行时**：使用第六阶段的分批次策略迁移 `lib/` 目录
- **第四阶段执行时**：使用第六阶段的策略迁移 `orpc/` 目录
- **第二、三、五阶段**：同样使用脚本替换 + oxlint 确保导入路径正确

### 风险控制

| 风险 | 缓解措施 |
|------|----------|
| 批量替换出错 | 优先仅替换 import/export 的 module specifier；必要时使用 AST 脚本；先在测试环境验证 |
| 漏改导入路径 | oxlint 规则立即报错；CI 失败则不合并 PR |
| 构建失败 | 每个批次独立测试和 PR；CI 必须全部通过 |
| 团队协作冲突 | 分功能域迁移，减少冲突；PR 审查严格 |
| 回滚困难 | 使用 git mv，可快速回滚；保留 git 历史完整性 |

---

## 预期收益

### 可维护性提升
- 目录层级减少 25-30%
- 平均文件查找时间减少 35-40%
- 新人上手时间减少 40-50%

### 开发效率提升
- 组件复用率提升 15-20%
- 代码定位速度提升 30-35%
- 并发开发冲突减少 20-25%

### 代码质量提升
- 职责边界更清晰
- 依赖关系更合理
- 代码审查更高效
- 无 re-export 技术债

---

## 附录

### A. 迁移脚本模板

**1. 批量迁移脚本**
```bash
#!/bin/bash
# scripts/migrate-batch.sh

set -e

if [ $# -ne 2 ]; then
  echo "Usage: $0 <old-module> <new-module>"
  echo "Example: $0 types shared/types"
  exit 1
fi

OLD_MODULE=$1
NEW_MODULE=$2

echo "开始迁移: ~/lib/$OLD_MODULE -> ~/lib/$NEW_MODULE"

# 1. 替换导入路径（仅修改 import/export 的 module specifier）
FILES=$(rg -l "['\\\"]~/lib/${OLD_MODULE}(/|['\\\"])"
  apps/web/src --type ts --type tsx || true)

if [ -n "$FILES" ]; then
  perl -pi -e "s#'~/lib/${OLD_MODULE}/#'~/lib/${NEW_MODULE}/#g; s#\\\"~/lib/${OLD_MODULE}/#\\\"~/lib/${NEW_MODULE}/#g; s#'~/lib/${OLD_MODULE}'#'~/lib/${NEW_MODULE}'#g; s#\\\"~/lib/${OLD_MODULE}\\\"#\\\"~/lib/${NEW_MODULE}\\\"#g" $FILES
fi

# 2. 验证无旧路径导入
echo "验证无旧路径导入..."
if rg "from ['\\\"]~/lib/${OLD_MODULE}['\\\"]" apps/web/src --type ts --type tsx | grep -q .; then
  echo "错误：仍有旧路径导入！"
  exit 1
fi

if rg "from ['\\\"]~/lib/${OLD_MODULE}/" apps/web/src --type ts --type tsx | grep -q .; then
  echo "错误：仍有旧路径导入！"
  exit 1
fi

echo "✓ 无旧路径导入"

# 3. 运行测试
echo "运行测试..."
pnpm test:web || exit 1

# 4. 类型检查
echo "类型检查..."
pnpm -C apps/web exec tsc --noEmit || exit 1

# 5. 运行 lint
echo "运行 lint..."
pnpm lint:web || exit 1

echo "✓ 迁移完成！"
echo "请提交 PR："
echo "  feat: migrate lib/${OLD_MODULE} to lib/${NEW_MODULE}"
```

**2. 创建目录和移动文件脚本**
```bash
#!/bin/bash
# scripts/create-lib-structure.sh

set -e

# 从仓库根目录运行；目标目录在 apps/web/src/lib
ROOT_DIR="$(pwd)"
LIB_DIR="$ROOT_DIR/apps/web/src/lib"

# 创建新目录
mkdir -p "$LIB_DIR"/domain/{media,thread,points}
mkdir -p "$LIB_DIR"/infra/{db,cloudflare,storage,proxy,logger}
mkdir -p "$LIB_DIR"/features/{auth,ai,job,subtitle,remotion}
mkdir -p "$LIB_DIR"/shared/{types,utils,errors,hooks,providers,query,i18n,theme,config}

echo "目录结构创建完成！"
echo "请手动使用 git mv 移动文件，然后运行迁移脚本。"
```

### B. 可选：AST 替换脚本（更安全，但不是必需）

> 只做“导入路径改写”时，字符串替换通常就够用；如果担心误伤（例如多种引号、动态 import、边界情况），可用 AST 脚本确保只改 module specifier。

**示例：使用 ts-morph**
```typescript
// scripts/codemods/replace-lib-imports.ts
import { Project } from 'ts-morph'

const project = new Project({
  tsConfigFilePath: './apps/web/tsconfig.json',
})

const sourceFiles = project.getSourceFiles('apps/web/src/**/*.{ts,tsx}')

sourceFiles.forEach((file) => {
  const imports = file.getImportDeclarations()
  const exports = file.getExportDeclarations()

  imports.forEach((imp) => {
    const moduleSpecifier = imp.getModuleSpecifierValue()

    if (moduleSpecifier === '~/lib/media') {
      imp.setModuleSpecifier('~/lib/domain/media')
    } else if (moduleSpecifier.startsWith('~/lib/media/')) {
      imp.setModuleSpecifier(
        moduleSpecifier.replace('~/lib/media/', '~/lib/domain/media/'),
      )
    }
  })

  exports.forEach((exp) => {
    const moduleSpecifier = exp.getModuleSpecifierValue()
    if (!moduleSpecifier) return

    if (moduleSpecifier === '~/lib/media') {
      exp.setModuleSpecifier('~/lib/domain/media')
    } else if (moduleSpecifier.startsWith('~/lib/media/')) {
      exp.setModuleSpecifier(
        moduleSpecifier.replace('~/lib/media/', '~/lib/domain/media/'),
      )
    }
  })
})

project.save()
```

**查找旧路径导入（验证用）**
```bash
# 查找所有需要更新的导入
rg "from ['\\\"]~/lib/media" apps/web/src --type ts --type tsx -l

# 查找所有旧路径导入
rg "from ['\\\"]~/lib/(media|thread|points|ai|auth|job|subtitle|remotion|db|cloudflare|proxy|logger|types|utils|errors|hooks|providers|query|i18n|theme|config|orpc)" \
  apps/web/src --type ts --type tsx -l
```

### C. 验证命令

**1. 完整验证流程**
```bash
# 1. 验证无旧路径导入
rg "from ['\\\"]~/lib/media['\\\"]" apps/web/src --type ts --type tsx  # 应该无结果
rg "from ['\\\"]~/lib/media/" apps/web/src --type ts --type tsx        # 应该无结果

# 2. 运行 oxlint（会检查旧路径导入规则）
pnpm lint:web

# 3. 运行测试
pnpm test:web

# 4. 类型检查
pnpm -C apps/web exec tsc --noEmit

# 5. 构建验证
pnpm build:web
```

**2. 查找特定旧路径导入**
```bash
# 查找所有 lib/media 相关导入
rg "from ['\\\"]~/lib/media" apps/web/src --type ts --type tsx -l

# 查找所有 lib/* 旧路径导入
rg "from ['\\\"]~/lib/(media|thread|points|ai|auth|job|subtitle|remotion|db|cloudflare|proxy|logger|types|utils|errors|hooks|providers|query|i18n|theme|config|orpc)" \
  apps/web/src --type ts --type tsx -l

# 查找具体文件中的导入
rg "from ['\\\"]~/lib/media" apps/web/src/components/business/media --type ts --type tsx
```

**3. 批量验证所有旧路径**
```bash
# 验证所有 Batch 1 旧路径
for path in types utils errors hooks providers query i18n theme config; do
  echo "检查: lib/$path"
  rg "from ['\\\"]~/lib/$path['\\\"]" apps/web/src --type ts --type tsx && echo "  ✗ 仍有旧路径导入" || echo "  ✓ 无旧路径导入"
done
```

---

## 总结

本重构计划分为 6 个阶段，预计 4-5 周完成。通过清晰的目录结构、明确的职责划分和统一的命名规范，将显著提升项目的可维护性和开发效率。

**关键原则：**
- 渐进式迁移，避免大爆炸式重构
- 分批次全量迁移，不使用 re-export
- 使用脚本替换 + oxlint 确保迁移质量（必要时用 AST 脚本）
- 每个阶段独立可验证
- 使用 git mv 保持文件历史
- 充分测试，确保零回归

**预期收益：**
- 目录层级减少 30%
- 平均文件查找时间减少 40%
- 新人上手时间减少 50%
- 组件复用率提升 20%
- 代码定位速度提升 35%
