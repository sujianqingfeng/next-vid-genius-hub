# Threads Remotion Player 可配置模板（thread 级）实现计划

## 背景与范围

目标是让用户在 Web 里通过 `@remotion/player` 预览 threads 视频，并能在 **thread 粒度**选择/配置模板（布局可调），且可用于云端渲染（renderer-remotion）。

明确约束：
- 仅针对 Remotion 模板（不是 DOM/网页帖子渲染）。
- thread 粒度应用（不是 post 粒度）。
- 模板配置为 JSON（白名单字段 + 校验），不执行用户代码。
- 预览与云端渲染走同一份配置（可回放一致）。

## 当前代码现状（已存在）

- Remotion 线程视频组件：`packages/remotion-project/remotion/ThreadForumVideo.tsx`
- Remotion 线程模板注册：`packages/remotion-project/remotion/thread-templates/index.ts`
	- 当前仅 `ThreadTemplateId = 'thread-forum'`
- Web 预览卡：`apps/web/src/components/business/threads/thread-remotion-preview-card.tsx`
	- 目前从模板 registry 取 `component`，把 `ThreadVideoInputProps` 传给 Player
	- 需要把 `thread.templateConfig` 注入到 `inputProps.templateConfig`
- DB threads 表已包含：
	- `templateId: text('template_id')`
	- `templateConfig: text('template_config', { mode: 'json' })`
	- 定义位于：`apps/web/src/lib/db/schema.ts`
- 云端渲染：`apps/web/src/orpc/procedures/thread.ts` → `startCloudRender`
	- snapshot 会携带 `templateId` + `templateConfig`

## 现状差距（必须先修正，否则无法“thread 粒度一致”）

- Web 预览：`ThreadRemotionPreviewCard` 需要把 DB 的 `thread.templateConfig` 注入到 `inputProps`。（已完成）
- 云端渲染：`startCloudRender` 需要优先使用 DB 上 `threads.templateId`，避免默认值覆盖 thread 粒度设置。（已完成）
- snapshot 一致性：snapshot 需要记录“实际生效”的 `{ templateId, templateConfig(resolved) }`，而不是“请求输入”，保证回放一致。（已完成）

## 总体方案

把 “用户可配置模板” 定义为 `TemplateConfig v1`（JSON），并编译成 Remotion 侧可渲染的 `RenderTree`：

1) Web（线程详情页）选择模板/编辑配置（thread 粒度）→ 写入 `threads.templateId/templateConfig`
2) Web 预览：`ThreadRemotionPreviewCard` 把 `templateId/templateConfig` 注入 Player
3) Remotion 组件：`ThreadForumVideo` 读取 `templateConfig`，把配置编译为 `RenderTree`，并用统一 renderer 渲染
4) Cloud render：复用相同 `templateId/templateConfig`（来自 snapshot）

关键原则（落地到代码/存储）：
- 预览与云端渲染以同一套「规范化后的 resolved config」为准（而不是“用户原始 JSON 字符串”）。
- 所有模板配置都必须满足「白名单 schema + 默认值 + clamp/限制」，未知字段忽略/回退，不报错中断渲染。
- 模板扩展后，配置 schema 与默认值应按模板分发（每个模板可以有不同的 default + 可选字段）。

## TemplateConfig v1（建议）

设计目标：布局自由度主要体现在两个“场景”里，而不是修改时间轴。

- `scenes.cover`：封面场景（标题/来源/背景/水印）
- `scenes.post`：帖子场景（root/reply 复用同一布局，或后续拆 `scenes.root/scenes.reply`）

推荐结构（示例，非最终）：

```json
{
	"version": 1,
	"theme": {
		"background": "#0b1020",
		"surface": "rgba(255,255,255,0.06)",
		"border": "rgba(255,255,255,0.10)",
		"textPrimary": "#e5e7eb",
		"textMuted": "rgba(229,231,235,0.65)",
		"accent": "#22c55e"
	},
	"typography": { "fontPreset": "noto", "fontScale": 1 },
	"motion": { "enabled": true, "intensity": "normal" },
	"scenes": {
		"cover": { "root": { "type": "Stack", "direction": "column", "gap": 18, "children": [] } },
		"post": { "root": { "type": "Stack", "direction": "column", "gap": 14, "children": [] } }
	}
}
```

> 第一版重点是把 `scenes.*.root` 变成可配置的 RenderTree 节点组合；theme/typography 沿用现有实现并逐步扩展。

### 配置与模板绑定（建议：按模板分发 schema/default/compile）

为避免后续新增模板时“一个全局 schema 绑死所有模板”，建议把下面能力收敛到模板 registry：
- `defaultConfig`：模板级默认配置（用于填充缺省值）
- `configSchema`：模板级 zod schema（用于校验/裁剪/compat）
- `normalizeConfig(raw) -> ResolvedConfig`：把 unknown/raw 转成稳定结构（丢弃未知字段、补默认、clamp）
- `compile(resolved) -> CompiledRenderTree`：把 resolved config 编译成 RenderTree（或在 v1 直接用 scenes.root 作为 RenderTree）

模板 registry 形态示例（概念，不是最终代码）：
- `THREAD_TEMPLATES[id] = { ..., defaultConfig, configSchema, normalizeConfig, compile, compileVersion }`

## RenderTree v1 原语（建议）

容器（布局）节点：
- `Stack`：direction/align/justify/gap/padding
- `Grid`：columns/gap
- `Box`：padding/border/background/radius
- `Absolute`：x/y/width/height（用于固定布局/安全区）

内容（数据绑定）节点：
- `Text`：从数据源取值（thread.title、post.author、post.plainText、post.translations 等），含 maxLines、fontSize、weight、color token
- `Avatar`：作者头像（assets map 或 fallback）
- `Metrics`：likes 等
- `ContentBlocks`：渲染 post 的 `contentBlocks`（复用现有 image/video/link/quote/divider 逻辑）
- `Watermark` / `Background`

约束：
- 仅允许有限 props（白名单），未知字段丢弃或回退默认。
- 数值字段做范围限制（clamp），避免破坏布局/溢出。

## 编译器 compile（TemplateConfig -> RenderTree）

职责：
- 读取 `templateConfig`（允许为空/旧格式）→ 产出 `ResolvedConfig`（稳定结构）与 `CompiledRenderTree`
- 填默认值、合并 theme、裁剪非法字段、clamp 数值与列表长度（安全与稳定性）
- 兼容旧结构：
	- v0：当前 `CommentsTemplateConfig`（或其它历史结构）必须可被识别并映射到 v1（至少 theme/typography/motion 能沿用）
	- 若没有 `scenes`（或编译失败），使用当前 `ThreadForumVideo` 的默认布局包装（保证不 crash，且尽量“长相不变”）

输出应为纯 JSON，可用于：
- Web 端 Player 预览（inputProps 传入）
- Cloud render snapshot（回放一致）

### 确定性与回放（必须明确）

为了保证“现在预览什么，未来云渲染/回放就是什么”，建议 snapshot 写入以下字段：
- `templateId`：实际生效的 templateId（优先请求覆盖，其次 thread DB，最后默认）
- `templateConfigResolved`：规范化后的 resolved config（stable key order + 默认值已补齐）
- `templateConfigHash`：对 `templateConfigResolved` 计算 hash（用于对账/缓存/回放一致性）
- `compileVersion`：编译器版本号（当 compile 逻辑升级时可避免旧任务回放变形）

注意：
- hash 必须基于 resolved config（而不是用户原始 JSON 文本），否则 key 顺序/默认值补齐会导致 hash 不稳定。
- thread 表可以继续存“用户原始 config”（便于编辑），但 render snapshot 必须固化 resolved config（便于回放）。

## Remotion 侧改造（ThreadForumVideo）

拆分建议：
- `compileThreadTemplateConfig(templateConfig, inputProps) => { cssVars, scenes }`
- `renderNode(node, ctx) => ReactNode`（递归渲染 RenderTree）
- `buildRenderContext({ scene, thread, post, assets, locale })`

时间轴逻辑（cover + replies durations）保持现有，布局仅影响每个场景内部。

### 安全模型（必须落地的硬约束）

- 资源引用只允许通过 `assetsMap`（或受控的 `assetId`），禁止任意 `http(s)`/`ext:` 直链在生产路径中生效。
	- 允许的资源：DB thread_assets（presign URL）或明确白名单的内置资源（bundled assets）。
	- 对外链：只能走现有下载/入库/预签流程；RenderTree 不能直接给 URL。
- RenderTree 节点与字段全白名单，未知字段丢弃；不允许 `dangerouslySetInnerHTML` 或任何 HTML 字符串渲染。
- 所有数值：clamp（含 padding/gap/fontSize/lineHeight/width/height/opacity 等）并有默认值兜底。
- 所有列表：限制长度（如 children、blocks）避免过深递归或内存爆炸。

### 限制与限额（建议 v1 就定死）

- `templateConfig` JSON 大小上限（例如 32KB 或 64KB，按 DB/传输/编辑体验取值）。
- RenderTree 限制：
	- 最大节点数（例如 200）
	- 最大深度（例如 12）
	- 最大文本长度（按字段，如 title/plainText 截断策略）
- 编译超时/异常策略：编译失败回退到默认布局（不能导致渲染任务失败）。

## Web 侧接入（最小闭环）

MVP（最快）：
- 在 `apps/web/src/routes/threads/$id/index.tsx` 增加：
	- 模板选择（读取 `thread.templateId`）
	- JSON 编辑 `templateConfig`（Textarea + 校验提示）
	- 保存（写入 `threads.templateConfig`）
- `ThreadRemotionPreviewCard`：
	- `templateId = thread.templateId ?? DEFAULT_THREAD_TEMPLATE_ID`
	- `inputProps.templateConfig = thread.templateConfig`（或 resolved config，二选一；推荐喂 raw 但由 Remotion 端 normalize）

V2（可视化编辑器）：
- blocks 列表（排序/显隐）
- 右侧属性面板（gap/padding/colors/fontScale…）
- 实时 Player 预览（本地 state 直接喂 Player，不必每次保存）

## ORPC 接口（建议补齐）

- `thread.setTemplate`：
	- input：`{ threadId, templateId?: string | null, templateConfig?: unknown | null }`
	- server：schema 校验（zod），写入 `threads.templateId/templateConfig`

### startCloudRender 生效规则（建议明确）

为了符合“thread 粒度应用”，`startCloudRender` 的实际生效值建议为：
- `effectiveTemplateId = input.templateId ?? thread.templateId ?? DEFAULT_THREAD_TEMPLATE_ID`
- `effectiveTemplateConfig = input.templateConfig ?? thread.templateConfig ?? null`

并且 snapshot/任务 options 必须写入 `effective*`（而不是 input 原值）。

## 模板库（可选增强）

当需要跨 thread 复用模板时新增：
- 表：`thread_render_templates`（workspace/user 级）
- thread 仅引用 `templateId` + optional overrides（或继续存 resolved config）

## 里程碑与验收

- M0（一致性打底）：预览与云渲染都使用 thread 的 `templateId/templateConfig`（允许请求覆盖），snapshot 记录 effective + hash/version
- M1（编辑闭环）：`thread.setTemplate` + 线程详情页 JSON 编辑/校验/保存 + 预览实时生效
- M2（可配置布局）：RenderTree v1 + normalize/compile + ThreadForumVideo 渐进迁移到 RenderTree 驱动
- M3（产品化）：Web 可视化编辑器 + 模板库（复用/版本化/回滚）+ 更完善的兼容迁移策略

## 当前已支持（实现状态）

### RenderTree v1 节点

- 布局/容器：`Stack`、`Box`
- 文本：`Text`
- 头像：`Avatar`
- 内容：`ContentBlocks`
- 媒体：`Image`、`Video`（仅允许 `assetId` → `assetsMap`，不允许外链 URL）
- 辅助：`Spacer`、`Divider`
- 内置：`Builtin(cover)`、`Builtin(repliesList)`
	- `repliesList` 支持 `rootRoot`（左侧 ROOT）与 `itemRoot`（右侧每条 reply）做自定义布局

### Web 编辑体验（当前）

- 线程详情页：支持 templateId 选择 + JSON 编辑 + 保存（raw/normalized）+ 规范化提示
- 示例配置：`Insert Cover Example` / `Insert Example`（含 `Image/Video`）
- Assets 插入器：支持把 `thread_assets.id` 插入/替换到模板 JSON（可复制 assetId，按 kind 优先替换占位符）
- 媒体占位符：
	- `__IMAGE_ASSET_ID__`
	- `__VIDEO_ASSET_ID__`

### 云渲染一致性（当前）

- snapshot 固化 `templateConfigResolved` + `templateConfigHash` + `compileVersion`

### 资产（assetId）工作流（必须）

1) 如果帖子里含 `ext:`/`http(s)` 外链资源，先在线程详情页点 `Download/ingest` 把外链素材入库为 `thread_assets`。
2) 模板里 `Image/Video.assetId` 必须填写入库后的 `thread_assets.id`（而不是 URL）。
3) Web 端会提示：占位符未替换、assetId 不存在、status 非 ready、storageKey 缺失等问题。

## 执行进度（截至 2025-12-29）

### 已完成

- M0：预览与云渲染使用 thread 粒度 template 设置；snapshot 写入 resolved/hash/version
- M1：`thread.setTemplate` + 线程详情页 JSON 编辑/校验/保存 + 预览实时生效
- M2（部分）：RenderTree v1（含媒体/辅助节点）+ `post.*` 绑定 + `repliesList.rootRoot/itemRoot` + 资产入库/安全限制 + 示例/插入器 + 基础测试

### 未完成（明天可以做）

- M2 收口
	- 增加更丰富节点：`Grid`/绝对定位/对齐细节/更多样式能力（按需求逐步加）
	- 将更多“内置布局”迁移到纯 RenderTree（减少 Builtin 依赖；时间轴仍可保留在 Builtin）
	- 兼容迁移策略：识别历史 `templateConfig`（旧结构）并平滑迁移/回退
- M3（产品化）
	- 最小可视化编辑器（节点树 + 属性面板 + 实时预览），保留 JSON 高级模式
	- 模板库（跨 thread 复用、版本化、回滚、共享）
	- 更完善的验证与测试（覆盖更多节点/边界/资产状态）

## 风险与注意事项

- 兼容性：历史 `templateConfig` 可能是旧结构（当前 CommentsTemplateConfig 等），必须可识别并迁移，且尽量不改变既有视觉结果。
- 安全：严格白名单字段；不允许任意 HTML/JS；资源引用必须受控（禁止生产路径直链）。
- 一致性：Player 预览与 cloud render 必须使用相同的 resolved config；snapshot 需固化 resolved + hash + compileVersion，避免未来代码变更导致回放不同。
