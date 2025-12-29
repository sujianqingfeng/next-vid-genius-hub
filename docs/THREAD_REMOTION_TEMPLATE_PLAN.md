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

## 总体方案

把 “用户可配置模板” 定义为 `TemplateConfig v1`（JSON），并编译成 Remotion 侧可渲染的 `RenderTree`：

1) Web（线程详情页）选择模板/编辑配置（thread 粒度）→ 写入 `threads.templateId/templateConfig`
2) Web 预览：`ThreadRemotionPreviewCard` 把 `templateId/templateConfig` 注入 Player
3) Remotion 组件：`ThreadForumVideo` 读取 `templateConfig`，把配置编译为 `RenderTree`，并用统一 renderer 渲染
4) Cloud render：复用相同 `templateId/templateConfig`（来自 snapshot）

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
- 读取 `templateConfig`（允许为空/旧格式）→ 产出 `CompiledRenderTree`
- 填默认值、合并 theme、裁剪非法 block/字段
- 兼容旧结构：若没有 `scenes`，用当前 `ThreadForumVideo` 默认布局包装（保证不 crash）

输出应为纯 JSON，可用于：
- Web 端 Player 预览（inputProps 传入）
- Cloud render snapshot（回放一致）

## Remotion 侧改造（ThreadForumVideo）

拆分建议：
- `compileThreadTemplateConfig(templateConfig, inputProps) => { cssVars, scenes }`
- `renderNode(node, ctx) => ReactNode`（递归渲染 RenderTree）
- `buildRenderContext({ scene, thread, post, assets, locale })`

时间轴逻辑（cover + replies durations）保持现有，布局仅影响每个场景内部。

## Web 侧接入（最小闭环）

MVP（最快）：
- 在 `apps/web/src/routes/threads/$id/index.tsx` 增加：
	- 模板选择（读取 `thread.templateId`）
	- JSON 编辑 `templateConfig`（Textarea + 校验提示）
	- 保存（写入 `threads.templateConfig`）
- `ThreadRemotionPreviewCard`：
	- `inputProps.templateConfig = thread.templateConfig`
	- `templateId = thread.templateId ?? DEFAULT_THREAD_TEMPLATE_ID`

V2（可视化编辑器）：
- blocks 列表（排序/显隐）
- 右侧属性面板（gap/padding/colors/fontScale…）
- 实时 Player 预览（本地 state 直接喂 Player，不必每次保存）

## ORPC 接口（建议补齐）

- `thread.setTemplate`：
	- input：`{ threadId, templateId?: string | null, templateConfig?: unknown | null }`
	- server：schema 校验（zod），写入 `threads.templateId/templateConfig`

## 模板库（可选增强）

当需要跨 thread 复用模板时新增：
- 表：`thread_render_templates`（workspace/user 级）
- thread 仅引用 `templateId` + optional overrides（或继续存 resolved config）

## 里程碑与验收

- M1：thread.templateConfig 注入 Player + 云端渲染保持一致（无编辑器）
- M2：RenderTree v1 + compile + ThreadForumVideo 由 RenderTree 驱动（布局开始可调）
- M3：Web 可视化编辑器 + 模板库（复用/版本化/回滚）

## 风险与注意事项

- 兼容性：历史 `templateConfig` 可能是旧结构（当前 CommentsTemplateConfig），必须保证渲染不崩。
- 安全：严格白名单字段；不允许任意 HTML/JS；外链资源只走已有 assets/presign 流程。
- 一致性：Player 预览与 cloud render 必须使用相同的 resolved config（建议 snapshot 存 hash/version）。

