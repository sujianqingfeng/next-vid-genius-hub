# Agent 媒体工作流（YouTube → 下载 → ASR → 优化 → 翻译 → 渲染）计划

目标：在 `apps/web/src/routes/agent/route.tsx` 的 Agent 体验里集成媒体工作流。Agent 只负责“提出下一步操作”，真正执行必须由用户确认（可配置为自动执行，但默认需要确认）。字幕翻译固定为 `zh-CN`，输出双语 VTT（每个 cue 第一行原文、第二行中文）。

## 核心原则

- **永不隐式执行**：Agent 只能产出“操作提案（Action Proposal）”，默认必须点击确认才会启动任何下载/ASR/渲染/扣点。
- **可配置自动执行**：提供 UI 配置开关，允许特定步骤自动执行，但必须有倒计时与取消窗口。
- **幂等防重复确认**：同一 `actionId` 只能成功执行一次；重复确认返回同一结果，不重复扣点、不重复启动任务。
- **自动建议下一步**：上一步完成后自动给出下一步提案卡片，但不自动串行执行（除非用户配置为 auto）。

## 配置（前端本地持久化）

建议以 `localStorage` 保存：

```ts
export type AgentWorkflowStep = 'download' | 'asr' | 'optimize' | 'translate' | 'render'
export type AgentWorkflowMode = 'confirm' | 'auto'

export type AgentWorkflowSettings = {
	autoSuggestNext: boolean
	defaultMode: AgentWorkflowMode
	perStepMode?: Partial<Record<AgentWorkflowStep, AgentWorkflowMode>>
	auto: {
		delayMs: number
		maxEstimatedPointsPerAction?: number
		requireConfirmOnUnknownCost: boolean
	}
}
```

默认值：
- `autoSuggestNext: true`
- `defaultMode: 'confirm'`
- `auto.delayMs: 2000`
- `auto.maxEstimatedPointsPerAction: 50`
- `auto.requireConfirmOnUnknownCost: true`（避免 token 费用未知时自动扣点）

## 状态机（自动建议规则）

基于 `media` 表字段确定下一步（不依赖 LLM，保证稳定与可控）：

1) 入口：用户给 YouTube URL → 提案 `download`
2) `download` 完成（Cloud job completed）：
   - 若 `media.transcription` / `media.optimizedTranscription` 为空 → 提案 `asr`
3) `asr` 完成：
   - 若 `media.optimizedTranscription` 为空 → 提案 `optimize`（使用默认参数）
4) `optimize` 完成：
   - 若 `media.translation` 为空 → 提案 `translate`（固定 zh-CN 双语 VTT）
5) `translate` 完成：
   - 提案 `render`（字幕烧录渲染）
6) 任一步失败：
   - 提案 “重试同一步”（生成新的 `actionId`），并展示错误原因

## 数据层：`agent_actions`（防重复确认）

新增表 `agent_actions`，用于记录提案、确认、执行与结果，并作为幂等 key。

最小字段建议：
- `id`（actionId，unique）
- `userId`
- `kind`：`download | asr | optimize | translate | render`
- `status`：`proposed | canceled | running | completed | failed`
- `params`（JSON：url/mediaId/modelId/quality/...）
- `estimate`（JSON：预计 points、依据说明、是否 unknown）
- `result`（JSON：mediaId/jobId/...）
- `error`
- `createdAt / confirmedAt / completedAt`

幂等规则（必须原子化）：
- `confirm(actionId)`：只允许 `proposed → running` 成功一次；若已 `running/completed/failed` 直接返回已保存的 `result/status`
- `cancel(actionId)`：只允许 `proposed → canceled`

## API（Worker / TanStack Start 路由）

1) Chat（data stream + tool 提案）
- `POST /api/agent/chat-stream`
  - 使用 AI SDK v6 的 data stream（`toDataStreamResponse()`）
  - tools 只负责 **创建提案**（写 `agent_actions(proposed)`），不做真实执行

2) 执行（确认才执行）
- `POST /api/agent/actions/confirm` `{ actionId }`
  - 校验登录 + action 归属
  - 原子切换 `proposed → running`（否则返回已执行结果）
  - 分发复用现有 ORPC：
    - download → `download.startCloudDownload`
    - asr → `subtitle.transcribe`
    - optimize → `subtitle.optimizeTranscription`
    - translate → `subtitle.translate`
    - render → `subtitle.startCloudRender`
  - 写回 `result/status/error`

3) 取消提案（用于 auto 倒计时取消）
- `POST /api/agent/actions/cancel` `{ actionId }`

4) 自动建议下一步（确定性，不走 LLM）
- `POST /api/agent/actions/suggest-next` `{ mediaId }`
  - 读取 `media` 状态并创建下一步 `agent_actions(proposed)` 返回

## 前端（Agent UI）

- `AgentChatPage` 切到 `@ai-sdk/react` 的 `useChat`，`streamProtocol: 'data'`
- 渲染 `tool-*` parts 输出为 `ActionCard`
- `ActionCard`：
  - 展示预计 points、影响范围（会扣点/写库/启动 job）、前置条件
  - 根据配置：显示确认按钮，或倒计时自动确认（可取消）
- 执行与进度：
  - confirm 后对下载/ASR/渲染轮询现有 status 接口
  - 完成后调用 `suggest-next` 自动追加下一步提案卡片

## 验收标准（MVP）

- 给 YouTube URL 能生成 `download` 提案卡片
- 点击确认只会启动一次下载；重复确认/双击不重复执行
- 下载完成后自动建议 `asr`（但不自动执行，除非配置）
- ASR → optimize → translate（双语 VTT）→ render 都能以“提案 → 确认”方式完成
- 下载/ASR/渲染进度可见；失败会给出可重试提案

