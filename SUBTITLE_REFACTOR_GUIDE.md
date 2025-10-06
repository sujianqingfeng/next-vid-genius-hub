# 字幕模块重构指南

本文档描述了字幕模块的重构过程和如何使用新的架构。

## 🎯 重构目标

1. **提高可读性** - 将复杂的组件拆分为更小的、职责单一的组件
2. **增强可维护性** - 统一配置管理，减少代码重复
3. **提升优雅性** - 更好的类型安全性和用户体验

## 📁 新的目录结构

```
lib/subtitle/
├── config/
│   ├── models.ts           # Whisper模型配置
│   ├── prompts.ts          # AI翻译提示词
│   ├── constants.ts        # 通用常量
│   └── presets.ts          # 字幕渲染预设
├── types/
│   └── index.ts            # 类型定义和验证Schema
├── utils/
│   ├── color.ts            # 颜色处理工具
│   ├── time.ts             # 时间处理工具
│   └── vtt.ts              # VTT文件处理工具
├── hooks/
│   ├── useSubtitleWorkflow.ts  # 工作流状态管理
│   ├── useVideoPreview.ts      # 视频预览管理
│   └── index.ts
└── index.ts                 # 统一导出入口

components/business/media/subtitles/
├── VideoPreview/           # 视频预览组件
├── SubtitleConfig/         # 字幕配置控制
├── HintTextConfig/         # 提示文本配置
├── SubtitleOverlay/        # 字幕覆盖层
├── HintTextOverlay/        # 提示文本覆盖层
├── TimeSegmentEffects/     # 时间段效果管理
├── Step1Transcribe.tsx     # 转录步骤
├── Step2Translate.tsx      # 翻译步骤
├── Step3Render.tsx         # 渲染步骤（原版）
├── Step3Render.refactored.tsx  # 渲染步骤（重构版）
├── Step4Preview.tsx        # 预览步骤
└── Stepper.tsx             # 步骤导航
```

## 🔧 主要改进

### 1. 配置统一管理

**之前**:
```typescript
// 配置分散在多个文件中
const DEFAULT_SUBTITLE_RENDER_CONFIG = {
  fontSize: 18,
  textColor: '#ffffff',
  // ...
}
```

**现在**:
```typescript
// 统一在 lib/subtitle/config/presets.ts
import { DEFAULT_SUBTITLE_RENDER_CONFIG } from '~/lib/subtitle/config/presets'
import { SUBTITLE_RENDER_PRESETS } from '~/lib/subtitle/config/presets'
```

### 2. 模型配置集中化

**之前**:
```typescript
// 硬编码模型列表
const getAvailableModels = (provider: TranscriptionProvider): WhisperModel[] => {
  if (provider === 'cloudflare') {
    return ['whisper-tiny-en', 'whisper-large-v3-turbo', 'whisper-medium']
  } else {
    return ['whisper-medium', 'whisper-large']
  }
}
```

**现在**:
```typescript
// 统一配置管理
import { getAvailableModels, WHISPER_MODELS } from '~/lib/subtitle/config/models'
```

### 3. 工具函数统一化

**之前**:
```typescript
// 重复的颜色处理函数
function hexToRgba(hex: string, opacity: number) {
  // 实现代码...
}
```

**现在**:
```typescript
// 统一的工具函数库
import { hexToRgba, isValidHexColor } from '~/lib/subtitle/utils/color'
import { parseVttTimestamp, formatTimeForDisplay } from '~/lib/subtitle/utils/time'
```

### 4. 组件拆分

**之前**:
```typescript
// Step3Render.tsx 超过600行，职责过多
export function Step3Render(props: Step3RenderProps) {
  // 600+ 行代码...
}
```

**现在**:
```typescript
// 拆分为多个子组件
import { VideoPreview } from './VideoPreview'
import { SubtitleConfigControls } from './SubtitleConfig'
import { HintTextConfigControls } from './HintTextConfig'
import { TimeSegmentEffectsManager } from './TimeSegmentEffects'

// Step3Render.refactored.tsx 现在只有约200行
export function Step3RenderRefactored(props: Step3RenderProps) {
  // 简洁的组件组合逻辑...
}
```

### 5. 状态管理优化

**之前**:
```typescript
// 复杂的状态管理逻辑分散在父组件中
const [activeTab, setActiveTab] = useState<StepId>('step1')
const [transcription, setTranscription] = useState<string>('')
// ... 更多状态
```

**现在**:
```typescript
// 使用自定义Hook统一管理
import { useSubtitleWorkflow } from '~/lib/subtitle/hooks'

const {
  workflowState,
  setActiveStep,
  updateWorkflowState,
  hasTranscription,
  hasTranslation,
  // ... 其他便捷属性
} = useSubtitleWorkflow({ mediaId })
```

## 🚀 如何使用新架构

### 1. 基础导入

```typescript
// 统一从主入口导入
import {
  // 配置
  DEFAULT_SUBTITLE_RENDER_CONFIG,
  SUBTITLE_RENDER_PRESETS,
  getAvailableModels,

  // 工具函数
  hexToRgba,
  parseVttTimestamp,
  parseVttCues,

  // 类型
  type SubtitleRenderConfig,
  type TimeSegmentEffect,

  // Hooks
  useSubtitleWorkflow,
  useVideoPreview,
} from '~/lib/subtitle'
```

### 2. 使用新的工作流Hook

```typescript
function MySubtitleComponent({ mediaId }: { mediaId: string }) {
  const {
    workflowState,
    activeStep,
    hasTranscription,
    hasTranslation,
    setActiveStep,
    updateWorkflowState,
  } = useSubtitleWorkflow({ mediaId })

  return (
    <div>
      <div>当前步骤: {activeStep}</div>
      <div>转录完成: {hasTranscription ? '是' : '否'}</div>
      <div>翻译完成: {hasTranslation ? '是' : '否'}</div>
    </div>
  )
}
```

### 3. 使用视频预览Hook

```typescript
function MyVideoPreview({ mediaId, cues }: { mediaId: string, cues: VttCue[] }) {
  const {
    videoRef,
    containerRef,
    currentTime,
    activeCue,
    togglePlayPause,
    seekTo,
  } = useVideoPreview({ mediaId, cues })

  return (
    <div ref={containerRef}>
      <video ref={videoRef} controls>
        <source src={`/api/media/${mediaId}/source`} />
      </video>
      {activeCue && <div>{activeCue.lines.join('\n')}</div>}
    </div>
  )
}
```

### 4. 使用新的组件

```typescript
import { Step3RenderRefactored } from '~/components/business/media/subtitles/Step3Render.refactored'

function MyPage() {
  return (
    <Step3RenderRefactored
      mediaId="abc123"
      translationAvailable={true}
      translation="WEBVTT\n\n00:00.000 --> 00:02.000\nHello\n你好"
      config={DEFAULT_SUBTITLE_RENDER_CONFIG}
      onConfigChange={(config) => console.log(config)}
      onStart={(config) => console.log('Rendering:', config)}
    />
  )
}
```

## 🔄 迁移步骤

### 第一阶段：基础迁移（已完成）
- [x] 创建新的目录结构
- [x] 提取配置常量
- [x] 创建工具函数库
- [x] 定义类型和验证
- [x] 创建自定义Hook
- [x] 重构Step3Render组件

### 第二阶段：逐步迁移
- [ ] 更新现有组件使用新的配置和工具函数
- [ ] 迁移Step1Transcribe和Step2Translate使用新架构
- [ ] 更新主页面使用新的Hook
- [ ] 添加单元测试

### 第三阶段：清理和优化
- [ ] 删除旧的重复代码
- [ ] 更新导入路径
- [ ] 优化性能
- [ ] 完善文档

## 🎯 具体迁移示例

### 更新orpc/subtitle.ts

**之前**:
```typescript
const translateInput = z.object({
  mediaId: z.string(),
  model: z.enum(AIModelIds),
})

// 硬编码的提示词
const bilingualPrompt = `You are a professional translator...`
```

**之后**:
```typescript
import { getTranslationPrompt, DEFAULT_TRANSLATION_PROMPT_ID } from '~/lib/subtitle/config/prompts'

const translateInput = z.object({
  mediaId: z.string(),
  model: z.enum(AIModelIds),
  promptId: z.string().default(DEFAULT_TRANSLATION_PROMPT_ID).optional(),
})

// 使用配置化的提示词
const prompt = getTranslationPrompt(input.promptId || DEFAULT_TRANSLATION_PROMPT_ID)
```

### 更新Step1Transcribe组件

**之前**:
```typescript
const getAvailableModels = (provider: TranscriptionProvider): WhisperModel[] => {
  if (provider === 'cloudflare') {
    return ['whisper-tiny-en', 'whisper-large-v3-turbo', 'whisper-medium']
  } else {
    return ['whisper-medium', 'whisper-large']
  }
}
```

**之后**:
```typescript
import { getAvailableModels, getModelLabel, getModelDescription } from '~/lib/subtitle/config/models'
```

## 📋 检查清单

在完成迁移后，请确认以下事项：

- [ ] 所有旧代码已移除
- [ ] 新的导入路径正确
- [ ] 类型检查通过
- [ ] 功能测试正常
- [ ] 性能没有退化
- [ ] 代码覆盖率达标

## 🆘 常见问题

### Q: 如何处理向后兼容性？
A: 可以暂时保留旧的接口，在新接口稳定后再逐步移除。

### Q: 类型错误如何解决？
A: 确保导入了正确的类型定义，特别是 `~/lib/subtitle/types` 中的类型。

### Q: 性能如何保证？
A: 新架构通过更好的代码分割和懒加载，应该有更好的性能。如果发现性能问题，请检查是否有不必要的重新渲染。

### Q: 如何扩展新功能？
A: 新架构设计为可扩展的。可以在相应的目录下添加新的配置、工具函数或组件。

## 📞 支持

如果在迁移过程中遇到问题，请：
1. 查看本文档的常见问题部分
2. 检查类型定义和接口
3. 参考重构后的组件示例
4. 联系开发团队获取帮助