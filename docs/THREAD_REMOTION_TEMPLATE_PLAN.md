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

1. Web（线程详情页）选择模板/编辑配置（thread 粒度）→ 写入 `threads.templateId/templateConfig`
2. Web 预览：`ThreadRemotionPreviewCard` 把 `templateId/templateConfig` 注入 Player
3. Remotion 组件：`ThreadForumVideo` 读取 `templateConfig`，把配置编译为 `RenderTree`，并用统一 renderer 渲染
4. Cloud render：复用相同 `templateId/templateConfig`（来自 snapshot）

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
- `Absolute`：x/y/width/height + zIndex/transform（用于固定布局/安全区/叠层）

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

## V2.5（推荐）：Edit 画布（Thumbnail）+ Play 预览（Player）

背景：当前预览用 `@remotion/player` 的 `Player`，天然是“播放器”，会带来 click-to-play/空格快捷键/控件遮挡等交互冲突；而布局编辑更像“画布”操作（点选、拖拽、对齐、精调），更适合用静态帧渲染。

目标：在 thread 模板编辑页面实现两种预览模式：

- `Edit`：用 `@remotion/player` 的 `Thumbnail` 渲染单帧静态画布，支持：
  - 选择场景（Cover/Post）
  - 拖动 frame 滑条选择任意帧（冻结画面）
  - 点选节点（后续：仅 `Absolute` 支持拖拽移动）
- `Play`：用 `Player` 进行播放检查（动效/节奏/时长），编辑交互在该模式下关闭或弱化。

### 关键设计点

1. **单帧画布**：Edit 模式用 `Thumbnail` 的 `frameToDisplay` 冻结画面，避免每帧变化导致编辑反馈不稳定。
2. **Frame 滑条**：Edit 模式提供 `frame` slider（范围 `0..durationInFrames-1`）。
   - 支持快捷跳转：Cover 起始帧、Post 起始帧。
   - 可选：显示当前帧对应的 scene（Cover/Post）提示。
3. **scene 与 frame 的关系**：
   - 最小实现：`scene` 仅用于“节点选择/编辑器状态”（比如选中 cover/post 树），`frame` 仅用于画布展示。
   - 推荐实现：`scene` 与 `frame` 双向绑定：
     - 切换 `scene=cover` 自动跳 `frame=0`
     - 切换 `scene=post` 自动跳 `frame=coverDurationInFrames`（或 `+1`）
     - 拖动 `frame` 时可推断当前 scene（`frame < coverDuration` → cover，否则 post），并更新 `scene`（但要避免来回抖动：可加阈值或只在用户拖动时更新）。
4. **坐标换算**（为 Absolute 拖拽做准备）：
   - 通过 `Thumbnail` ref 的 `getScale()`（或容器尺寸/compositionWidth 的比值）把屏幕像素 delta 转换为 composition 坐标 delta。
5. **节点可选中标记**：
   - 在 Remotion 模板渲染时给每个节点可点击 DOM 打 `data-tt-key`（包含 `scene + path`）和 `data-tt-type`（节点类型），Edit 画布用 `closest('[data-tt-key]')` 定位选中节点。
   - Repeat/Builtin：第一版先按“模板节点”维度选中（不区分每个重复实例）；后续再扩展“实例选择”（instance index）。

### 文件与改动点（第一版）

- 预览组件：
  - `apps/web/src/components/business/threads/thread-remotion-preview-card.tsx`
    - 新增 `mode: 'edit' | 'play'`
    - `edit`：渲染 `Thumbnail`（frameToDisplay 可控）
    - `play`：保留 `Player`（controls/loop 仅在 play 开启）
    - 新增 `frame`、`scene` 状态（或由外部传入），以及 UI（slider + scene buttons）
    - 暴露 `onSceneChange/onFrameChange`（可选），为路由页联动提供接口
- 线程详情页：
  - `apps/web/src/routes/threads/$id/index.tsx`
    - 在 Preview 区块增加 `Edit/Play` 切换
    - Edit 默认；Play 仅用于检查
    - 把 `scene/frame/mode` 状态传给 `ThreadRemotionPreviewCard`
- Remotion 模板打标记：
  - `packages/remotion-project/remotion/ThreadForumVideo.tsx`
    - 在 `renderThreadTemplateNode()` 渲染每个节点时，给对应 DOM 根元素附加：
      - `data-tt-key`：建议形如 `cover:children.0.children.2`（与 Web 端 pathKey 一致）
      - `data-tt-type`：如 `Absolute/Text/Image`
      - 可选：`data-tt-scene`（cover/post）

### 交互实现步骤（MVP → 可用）

1. **引入 Thumbnail 并切模式**
   - Edit 模式：静态画布（Thumbnail）
   - Play 模式：播放器（Player）
2. **Frame 滑条**
   - slider：`min=0`、`max=durationInFrames-1`、`value=frame`
   - 显示：`frame / duration`（可选：显示时间 `frame/fps`）
3. **Scene 切换**
   - buttons：Cover/Post
   - 点击时更新 scene，并（推荐）跳转到对应起始 frame
4. **点选节点（先不拖拽）**
   - Edit 画布外层加 overlay 捕获 pointer 事件
   - `event.target.closest('[data-tt-key]')` → setSelectedKey
   - 选中后在画布绘制高亮框（读取目标元素 `getBoundingClientRect()` 转成 overlay 坐标）
5. **拖拽 Absolute（第二小步）**
   - 仅当选中节点 `data-tt-type==='Absolute'` 时启用拖拽
   - 拖拽结束一次性提交到 `visualTemplateConfig`（避免每像素都写 history）
   - 更新 config：通过 `scene + path` 找到节点并修改 `x/y`

### 验收标准

- Edit 模式：
  - slider 拖动时画布稳定刷新到对应帧，无播放控件干扰。
  - Cover/Post 切换可用，且能快速跳到对应段落。
- Play 模式：
  - 仍可播放预览，不影响现有渲染逻辑。
- 点选（与后续拖拽）：
  - 点击画面元素能选中对应节点，并在画布显示高亮框。
  - 仅 Absolute 节点支持拖拽移动，拖拽后预览立刻更新，保存后刷新仍生效。

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

- 布局/容器：`Stack`、`Grid`、`Absolute`、`Box`（容器节点支持 `flex`，用于填充剩余高度/控制左右比例）
  - 容器通用：支持 `opacity`（0..1，normalize 时 clamp）
  - `Box`：支持 `borderWidth` / `borderColor`（配合 `border=true`）
  - `Stack` / `Grid`：支持 `background` / `border` / `radius` / `borderWidth` / `borderColor`
  - `Stack` / `Grid` / `Box`：支持 `overflow: 'hidden'`（用于裁剪）
  - `Absolute`：支持 `zIndex` / `pointerEvents` / `rotate` / `scale` / `origin`（用于叠层/穿透/变换）
- 背景：`Background`（color/assetId + opacity/blur）
- 文本：`Text`
  - bind：支持 `timeline.replyIndicator` / `timeline.replyIndex` / `timeline.replyCount`（用于用纯 RenderTree 自定义 header）
  - style：支持 `opacity` / `uppercase` / `letterSpacing` / `lineHeight`
- 指标：`Metrics`（当前支持 likes；支持 `opacity`）
- 头像：`Avatar`（支持 `opacity`）
- 内容：`ContentBlocks`（支持 `opacity`）
- 媒体：`Image`、`Video`（仅允许 `assetId` → `assetsMap`，不允许外链 URL）
  - `Image` / `Video`：支持 `opacity` / `position` / `blur`（用于蒙版/裁剪对齐/模糊）

### Edit 画布（Thumbnail）交互

- `Edit/Play` 双模式：
  - `Edit`：`Thumbnail` 单帧画布（`frameToDisplay`）
  - `Play`：`Player` 播放检查（带 controls）
- 帧选择：`frame` slider（支持快速跳转 `Cover` / `Post` 起始帧）
- 画布点选/悬停：
  - Remotion 侧为节点打 `data-tt-key` / `data-tt-type`，Web 侧用 `closest('[data-tt-key]')` 选中
  - hover/selection 都会绘制 overlay 高亮框
- 多选（Figma 风格基础版）：
  - `Shift+Click`：切换选中
  - 画布空白处拖拽：框选（`Shift` 为 additive）
- 选择体验增强：
  - 框选命中：与框相交即可命中（不再依赖中心点）
  - 重叠元素点选：连续点击同一位置会循环选中（click-through）
- 拖拽/缩放：
  - 多选时拖拽会移动所有选中的 `Absolute`（统一 delta）
  - resize handles 仅对 primary 选中的 `Absolute` 生效
- 画布导航（View）：
  - `Tool: Select/Pan`（Pan 支持拖拽平移）
  - `Zoom: 50 / 100 / 200 / - / Fit / Sel / +`（Pan 模式下可滚轮缩放；或 `Ctrl/Meta + Wheel`）
- 对齐/分布：
  - `Align`：L / HC / R / T / VC / B（按选中集合外接框对齐）
  - `Distribute`：H / V（按间距分布，需 ≥3 个 `Absolute`）
- Snap：
  - 支持对齐到画布边/中心与其他元素参考线
  - `Alt` 临时禁用 snapping；同时提供开关
- Undo/Redo：
  - 预览画布与 Visual 编辑器共用同一份 history（拖拽/缩放一次只入栈一次）
- 水印：`Watermark`（由 `brand.showWatermark` + `brand.watermarkText` 控制）
- 辅助：`Spacer`、`Divider`
- 内置：`Builtin(cover)`、`Builtin(repliesList)`
  - `repliesList` 支持 `rootRoot`（左侧 ROOT）与 `itemRoot`（右侧每条 reply）做自定义布局
  - 默认 `cover` 已使用纯 RenderTree；`Builtin(cover)` 仍可用于自定义/回退
  - `repliesList` 外层可拆分为 `Builtin(repliesListHeader)` + `Builtin(repliesListRootPost)` + `Builtin(repliesListReplies)`，用于自定义 header/左右栏容器布局
  - `repliesListReplies` 支持 `gap`（控制每条 reply 的间距）
  - `repliesList` / `repliesListReplies` 支持 `highlight`（控制当前/下一个 reply 的高亮边框）
    - `highlight: { enabled?, color?, thickness?, radius?, opacity? }`（均为可选；数值会做 clamp）
  - `repliesList` / `repliesListReplies` 支持 `wrapItemRoot`（当提供 `itemRoot` 时，是否用内置卡片外框包裹每条 reply；split 布局默认 `false`）
  - `repliesList` / `repliesListRootPost` 支持 `wrapRootRoot`（当提供 `rootRoot` 时，是否用内置卡片外框包裹 ROOT 帖子；split 布局默认 `false`）
- 循环：`Repeat(replies)`
  - 纯 RenderTree 的 replies 列表渲染能力：遍历 `ctx.replies`，并对每条 reply 以 `ctx.post = reply` 渲染 `itemRoot`
  - 支持：`gap` / `maxItems` / `wrapItemRoot` / `scroll` / `highlight`（时间轴驱动滚动与高亮），用于逐步减少 `Builtin(repliesList*)` 依赖

### Web 编辑体验（当前）

- 线程详情页：支持 templateId 选择 + JSON 编辑 + 保存（raw/normalized）+ 规范化提示
- 示例配置：`Insert Cover Example` / `Insert Example`（含 `Image/Video`）
- 布局片段：`Insert Replies Layout`（Repeat 版）/ `Insert RepliesList Layout`（Builtin 版）/ `Insert Header Snippet` / `Insert Root Snippet` / `Insert Reply Snippet` / `Insert Repeat Snippet`
- 一键迁移：`Migrate Builtins → Repeat`（把 `Builtin(repliesList*)` 尽量转换为纯 RenderTree / `Repeat(replies)`）
- Assets 插入器：支持把 `thread_assets.id` 插入/替换到模板 JSON（可复制 assetId，按 kind 优先替换占位符）
- 媒体占位符：
  - `__IMAGE_ASSET_ID__`
  - `__VIDEO_ASSET_ID__`

### 云渲染一致性（当前）

- snapshot 固化 `templateConfigResolved` + `templateConfigHash` + `compileVersion`

### 资产（assetId）工作流（必须）

1. 如果帖子里含 `ext:`/`http(s)` 外链资源，先在线程详情页点 `Download/ingest` 把外链素材入库为 `thread_assets`。
2. 模板里 `Image/Video.assetId` 必须填写入库后的 `thread_assets.id`（而不是 URL）。
3. Web 端会提示：占位符未替换、assetId 不存在、status 非 ready、storageKey 缺失等问题。

## 执行进度（截至 2025-12-30）

### 已完成

- M0：预览与云渲染使用 thread 粒度 template 设置；snapshot 写入 resolved/hash/version
- M1：`thread.setTemplate` + 线程详情页 JSON 编辑/校验/保存 + 预览实时生效
- 体验：线程页 apply 后自动同步 editor 状态（templateId/config），减少 UI 与 DB 状态不一致
- M2（部分）：RenderTree v1（含媒体/辅助节点）+ `post.*` 绑定 + `repliesList.rootRoot/itemRoot` + 资产入库/安全限制 + 示例/插入器 + 基础测试
  - 新增：更多节点支持 `opacity`（容器/文本/Avatar/Metrics/ContentBlocks），并贯穿 normalize + 预览/渲染 + 编辑器 + 校验 + 测试
  - 兼容：无 `version` 的旧配置会被映射到 v1（theme/typography/motion；可选 scenes）
  - 默认 `cover` 已切到纯 RenderTree（仍保留 `Builtin(cover)` 作为可选回退/自定义）
  - 线程详情页增加：`Insert Replies Layout`（插入拆分的 repliesList 布局片段）
  - 线程详情页增加：`Insert Header Snippet` / `Insert Highlight Snippet`
- M3（模板库 v1 / 本地闭环）：可视化编辑器 + 模板库（版本化/回滚/复用）+ 管理页 + 自动化测试
  - 可视化编辑器（节点树 + 属性面板 + 实时预览）：
    - 基础节点编辑（Add/Insert/Duplicate/Wrap/Unwrap/Move/Delete）
    - Undo/Redo + Copy/Paste + 快捷键
    - 仍保留 JSON 高级模式，可双向 Sync
  - 模板库（user-scoped，线程间复用）：
    - 表：`thread_template_library` / `thread_template_versions`
    - ORPC：create/addVersion/versions/list/applyToThread/rollback/update/deleteById
    - applyToThread：应用时写入 resolved config（`templateConfigResolved`，必要时 normalize 兜底），保证预览/渲染确定性
    - Web 管理页：`/thread-templates`
  - 本地迁移：`0029_flawless_veda.sql` 已在本地 D1 通过 `pnpm db:d1:migrate:local` 验证
  - E2E：本地通过真实 ORPC + 本地 D1 冒烟（create → addVersion → apply → rollback → rename → delete）
  - 测试：补充 ORPC procedure Vitest，并抽取可复用的 D1 test helper（libsql → D1 adapter）

### 未完成（明天可以做）

- M2 收口
  - 增加更丰富节点：绝对定位/对齐细节/更多样式能力（按需求逐步加）
  - 将更多“内置布局”迁移到纯 RenderTree（减少 Builtin 依赖；时间轴仍可保留在 Builtin）
- M3（产品化）继续收口
  - 远端迁移：`pnpm db:d1:migrate:remote`（当前仅做本地迁移验证）
  - 更完善的验证与测试（覆盖更多节点/边界/资产状态；以及线程归属/无更新行等错误分支）

### 不在本次范围（已明确不做）

- 模板库：workspace 级/共享/权限（保持 user-scoped）

## 风险与注意事项

- 兼容性：当前策略为 v1-only，不兼容旧 `templateConfig`；升级时需要先全清 threads 的模板字段（见 `docs/THREAD_REMOTION_TEMPLATE_CLEAR.md`）。
- 安全：严格白名单字段；不允许任意 HTML/JS；资源引用必须受控（禁止生产路径直链）。
  - `theme.*` / `*.background` 等 CSS 字符串字段会拒绝包含 `url()` / `http(s)` / `ext:`，避免绕过 `assetId` 受控资源模型。
- 一致性：Player 预览与 cloud render 必须使用相同的 resolved config；snapshot 需固化 resolved + hash + compileVersion，避免未来代码变更导致回放不同。
