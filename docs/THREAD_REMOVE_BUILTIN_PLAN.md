# 移除 Thread 模板 `Builtin`（内部也完全移除）执行计划

目标：在 thread Remotion 模板体系里 **彻底移除** RenderTree 节点 `type: 'Builtin'`（类型、默认值、渲染器、编辑器都不再包含/生成/识别 `Builtin`），只保留纯原语节点（`Stack/Grid/Box/Text/Repeat/...`）。

前提与约束：

- 不做 legacy 迁移：历史 `threads.templateConfig` / snapshots 里如果存在 Builtin，允许直接清空 DB 数据（或清空相关表）。
- 允许回退默认：即便用户配置里塞了未知节点（包括旧 Builtin），normalize 之后回退到 `DEFAULT_SCENES`（不崩溃）。
- 需要同步更新 Web 侧可视化编辑器、路由里写死的 preset、以及测试用例。

---

## 影响范围（Breaking Changes）

- 任何包含 `{ type: 'Builtin', ... }` 的 `templateConfig` 都将不再被支持。
- 旧数据清空后，需要确保新写入的 `templateConfig` 都是纯 RenderTree 原语。
- 建议同步 bump 编译版本号：`THREAD_TEMPLATE_COMPILE_VERSION`（用于区分新旧 normalize/compile 逻辑）。

---

## 执行步骤（按顺序）

### 0) 基线扫描（锁定所有入口）

- 运行全仓扫描，列出所有 Builtin 的“生成点/使用点/测试点”：
  - `rg -n \"type:\\s*'Builtin'|\\{\\s*type:\\s*'Builtin'|Builtin\" packages apps containers workers`
- 记录需要改的文件清单（至少会命中）：
  - `packages/remotion-project/remotion/types.ts`
  - `packages/remotion-project/remotion/thread-template-config.ts`
  - `packages/remotion-project/remotion/ThreadForumVideo.tsx`
  - `apps/web/src/components/business/threads/thread-template-visual-editor.tsx`
  - `apps/web/src/routes/threads/$id/index.tsx`（含 preset/示例配置）
  - `apps/web/src/lib/thread/__tests__/*`（多处断言 Builtin）
  - `apps/web/src/messages/{en,zh}.json`（若 UI 上有 “Builtin” 标签）

验收点：

- 扫描结果里每个 Builtin 都能被解释为：要么删掉、要么替换为纯原语 preset。

### 1) 类型层彻底移除 Builtin

- 在 `packages/remotion-project/remotion/types.ts`：
  - 从 `ThreadRenderTreeNode` union 中删除所有 `{ type: 'Builtin', kind: ... }` 分支。
  - 检查是否还有其它类型/注释引用 Builtin（例如 i18n label），能删则删。

验收点：

- `ThreadRenderTreeNode` 不再包含 `Builtin`。

### 2) 规范化/默认配置确保纯原语（禁止 Builtin 输入）

- 在 `packages/remotion-project/remotion/thread-template-config.ts`：
  - 删除 `normalizeRenderTreeNode()` 中 `if (type === 'Builtin') { ... }` 分支（不再识别 Builtin 输入）。
  - 确认 `DEFAULT_SCENES`（以及 `DEFAULT_THREAD_TEMPLATE_CONFIG.scenes`）完全由原语节点构成（当前看是纯原语，保持不引入 Builtin）。
  - 如需更强约束：在 normalize 阶段对未知节点直接丢弃（保持当前行为即可）。
  - bump `THREAD_TEMPLATE_COMPILE_VERSION`（因为 normalize 行为改变）。

验收点：

- `thread-template-config.ts` 不再出现 `Builtin` 字样（除非仅在 docs 注释里，建议也删）。
- `DEFAULT_THREAD_TEMPLATE_CONFIG.scenes.*.root` 永远是纯原语树（且渲染侧缺失/非法 config 时回退默认）。

### 3) Remotion 渲染器删除 Builtin 分支

- 在 `packages/remotion-project/remotion/ThreadForumVideo.tsx`：
  - 删除 `renderThreadTemplateNode()` 内 `if (node.type === 'Builtin') { ... }` 全分支。
  - 调整 `ThreadForumVideo()` 中 `coverRoot/postRoot` 的 fallback：
    - 不再 fallback 到 `{ type: 'Builtin', kind: ... }`
    - 直接使用 `normalizedTemplateConfig.scenes.cover.root` / `.post.root`（normalize 已保证存在），或 fallback 到 `DEFAULT_THREAD_TEMPLATE_CONFIG.scenes.*.root`。
  - 评估是否仍需要保留 `CoverSlide/RepliesListSlide/...` 这些组件：
    - 如果没有其它调用者，建议保留一版先（避免大删引入无关冲突），或在确认无引用后删除并用纯树实现（见下一条）。

验收点：

- `ThreadForumVideo.tsx` 不再出现 `Builtin`。
- 任意输入都不会因为 “缺 Builtin” 崩溃（最多回退默认布局）。

### 4) 用纯原语替代 “内置布局” 的预设来源

目标：把之前 “Builtin 代表默认布局” 的概念改成 **“纯树 preset”**。

- 现状建议：
  - `DEFAULT_SCENES` 已经给出了 cover/post 的纯原语默认树，可以作为唯一默认布局来源。
- 修改点：
  - Web 编辑器里提供的 “插入/重置布局” preset 从 Builtin 改成拷贝 `DEFAULT_SCENES.*.root`。
  - 路由/页面里写死的 demo config（如果有）从 Builtin 改为纯树。

验收点：

- UI/编辑器不再生成 `{ type: 'Builtin' }`。

### 5) Web 可视化编辑器：移除 Builtin 选项与文案

- 在 `apps/web/src/components/business/threads/thread-template-visual-editor.tsx`：
  - 删除生成 Builtin 的 helper（例如 `return { type: 'Builtin', kind: 'cover' }` 之类）。
  - UI 下拉/节点面板里如果有 “Builtin/内置” 分类，改成：
    - “Preset/模板预设” 或 “Layout/布局” 等（具体看现有 UI 结构）。
  - 确认保存到 DB 的 JSON 不包含 Builtin。

验收点：

- 编辑器能完成：新建模板 / 重置 cover/post root / 插入常用结构，且产物都是纯原语。

### 6) 更新 threads 详情页/路由内的 preset（若存在）

- 在 `apps/web/src/routes/threads/$id/index.tsx`：
  - 搜索 `{ type: 'Builtin' ... }` 的 preset/demo，改成纯原语树。
  - 如果页面上有 “Builtin” 文案或选择器，改成 “Preset”。

验收点：

- 页面不再写入 Builtin JSON。

### 7) 测试与文案同步

- 更新/删除所有断言 Builtin 的用例：
  - `apps/web/src/lib/thread/__tests__/thread-template-config.test.ts`
  - `apps/web/src/lib/thread/__tests__/template-migrations.test.ts`（如果测试的是 Builtin 迁移逻辑，可直接删除该测试文件或改成“未知节点丢弃 + fallback 默认”）
  - `apps/web/src/lib/thread/__tests__/template-assets.test.ts`（如果依赖 Builtin 节点收集资产）
- i18n：
  - `apps/web/src/messages/en.json`、`apps/web/src/messages/zh.json` 若存在 `Builtin` label 且不再使用，删除或改名为 `Preset`。

验收点：

- `rg -n \"\\bBuiltin\\b\" apps packages` 只剩 docs（或完全为 0）。

---

## DB 清空建议（执行前/后）

根据你们“允许清空 DB”的前提，至少需要清掉会保存模板配置的表数据（按项目实际表结构选做）：

- `threads`（`template_config` / `template_id`）
- `thread_renders`（旧 snapshot/任务记录，避免误回放）
- 以及任何保存 “模板草稿/编辑状态” 的表（如有）

如果不清空 DB，也可以保留数据，但注意旧 Builtin 会被 normalize 丢弃并回退默认布局（不保证外观一致）。

---

## 验证与发布检查

建议执行命令（按仓库脚本）：

- `pnpm typecheck:packages`
- `pnpm test:web`
- `pnpm lint:web`
- `pnpm build:web`（可选，但用于确认 Remotion project 打包没问题）

最终验收清单：

- `packages/remotion-project/remotion/types.ts` 不再定义 Builtin。
- `packages/remotion-project/remotion/thread-template-config.ts` 不再识别/输出 Builtin。
- `packages/remotion-project/remotion/ThreadForumVideo.tsx` 不再渲染 Builtin。
- Web 编辑器/threads 页面不再生成 Builtin JSON。
- 全仓 `rg -n \"type:\\s*'Builtin'\"` 为 0（允许 docs 内出现，用于历史说明也可接受）。
