# Thread Template Editor 升级计划（落盘）

目标：把 `/thread-templates/:libraryId/versions/:versionId/editor` 做成更“专业工具”的编辑器体验，解决「三栏不可拖拽 / 面板不好收起 / 快捷键不可发现 / 结构树弱 / Inspector 不够专业」等问题。

已完成（2026-01-01）：
- 顶部工具栏收口（Version / Preview Thread / Undo/Redo/Reset / Edit/Play / JSON / Publish / Back）
- 结构树与画布选中联动（tree ↔ canvas）
- 修复三栏布局中「中栏顶部空白很大」的网格自动换行问题
- 未发布改动（dirty）提示 + 离开/切版本/重置确认

---

## 1. 体验目标

1) **可调布局**：三栏可拖拽调整宽度；左右面板可折叠；状态全局记忆。
2) **可发现的快捷键**：常用操作有快捷键 + UI 显示（tooltip/对话框）。
3) **更强结构树**：层级树（可折叠/定位/过滤），并且每次进入默认全展开（不持久化折叠状态）。
4) **更专业 Inspector**：分组、对齐、字段级 reset；Reset 的基线来自“当前选中的版本（baseline）”，而不是硬编码默认值。

---

## 2. 关键决策（已确认）

- **布局状态全局通用**：不按 templateId/versionId 区分；所有版本编辑页共享一套布局。
- **Reset 基线**：任何 reset（整体/分组/字段）都回到「当前选中版本的 template config」。
- **结构树默认全展开**：允许会话内折叠，但不做跨会话持久化；每次进入页重新全展开。

---

## 3. 里程碑（实现顺序）

### M1：Plan 落盘（本文件）
- 记录需求、决策、快捷键、存储 key、验收标准

### M2：持久化 Layout 状态（全局）
- 新增 `useLocalStorageState`（SSR-safe + 容错 + versioned）
- 存储 key：`vg.threadTemplateEditor.layout.v1`
- 状态包含：
  - 左/中/右栏宽度（px 或比例）
  - 左/右是否折叠
  -（可选）上次打开的 Inspector 分组（不影响“结构树默认全展开”原则）

### M3：可拖拽分栏 + 折叠面板
- 三栏改为可拖拽分割条（pointer events）
- 左/右面板折叠为窄 rail（仍可一键展开）
- 双击分割条恢复默认宽度
- 有最小宽度保护（避免 0 宽导致不可用）

### M4：快捷键 + 可发现性
- `Shift + /` 打开 “Shortcuts” 对话框
- Tooltip 显示主要按钮的快捷键提示
- 新增快捷键（不影响输入框）：
  - `Cmd/Ctrl+Z` Undo
  - `Cmd/Ctrl+Shift+Z` / `Cmd/Ctrl+Y` Redo
  - `Cmd/Ctrl+C` Copy node
  - `Cmd/Ctrl+V` Paste node
  - `Cmd/Ctrl+D` Duplicate node
  - `[` / `]` 选中上一个/下一个节点（按结构树顺序）
  - `Cmd/Ctrl+\\` 折叠/展开左栏（Structure）
  - `Cmd/Ctrl+Enter` Publish（有条件：已选 preview thread 且非 pending）

### M5：结构树增强（默认全展开）
- 显示为层级树（而不是纯扁平缩进列表）
- 支持：
  - 按类型/文本/bind 搜索（搜索时自动展开命中路径）
  - “Reveal selection”（选中后自动滚动到可视区域）
  - 节点右键/更多菜单（后续：wrap/duplicate/delete）
- 折叠状态仅会话内；进入页面默认全展开（resetKey 或版本切换时重置为全展开）

### M6：Inspector 专业化 + baseline reset
- 将右侧属性按语义分组（Layout / Spacing / Typography / Data / Media / Effects…）
- 字段级 reset（对照 baseline config 的该字段）
- 分组级 reset（对照 baseline config 的该分组）
- 在 header 显示 “Modified” 标记（和 baseline diff）

---

## 4. 验收标准（Done 的定义）

- 可以拖拽调节左右栏宽度；刷新页面宽度保持。
- 左/右栏可折叠；刷新页面折叠状态保持；快捷键可用且不影响输入框。
- 结构树默认全展开；切版本/刷新后仍全展开；搜索可用且会展开命中路径。
- Inspector 的 reset 回到“当前选中版本的 config”；切版本后基线随之变化。
- `pnpm -C apps/web lint` 与 `pnpm -C apps/web build` 通过。

