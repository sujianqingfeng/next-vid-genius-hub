# 目录重构迁移指南

## 新旧目录对照表

### 服务层 (Services)
```
旧位置 → 新位置
orpc/procedures/download.ts (业务逻辑部分) → lib/services/download/download.service.ts
lib/media/processing/index.ts → lib/services/media/processing.service.ts
lib/ai/translate.ts → lib/services/ai/translation.service.ts
lib/asr/whisper/index.ts → lib/services/ai/transcription.service.ts
```

### 提供者层 (Providers)
```
旧位置 → 新位置
lib/youtube/download.ts → lib/providers/youtube/downloader.ts
lib/youtube/client.ts → lib/providers/youtube/client.ts
lib/youtube/utils.ts → lib/providers/youtube/utils.ts
lib/tiktok/index.ts → lib/providers/tiktok/provider.ts
```

### 数据访问层 (Repositories)
```
旧位置 → 新位置
lib/db/media-utils.ts → lib/repositories/media.repository.ts
(新建) → lib/repositories/download.repository.ts
```

### 工具函数 (Utils)
```
旧位置 → 新位置
lib/utils/file-utils.ts → lib/utils/file/file-utils.ts
lib/utils/format.ts → lib/utils/format/format.ts
lib/media/utils/vtt.ts → lib/utils/format/vtt-utils.ts
lib/subtitle/utils/time.ts → lib/utils/time/time-utils.ts
lib/subtitle/utils/color.ts → lib/utils/format/color-utils.ts
```

### 类型定义 (Types)
```
旧位置 → 新位置
lib/media/types/index.ts → lib/types/media.types.ts
lib/media/providers/types.ts → lib/types/provider.types.ts
lib/subtitle/types/index.ts → lib/types/subtitle.types.ts
```

### 配置文件 (Config)
```
旧位置 → 新位置
lib/constants.ts → lib/config/app.config.ts
lib/subtitle/config/models.ts → lib/config/ai.config.ts
lib/subtitle/config/presets.ts → lib/config/subtitle.config.ts
```

### 常量定义 (Constants)
```
旧位置 → 新位置
lib/constants.ts 中的媒体常量 → lib/constants/media.constants.ts
lib/subtitle/config/constants.ts → lib/constants/subtitle.constants.ts
```

## 迁移步骤

### 1. 准备工作
```bash
# 创建迁移分支
git checkout -b refactor/directory-restructure

# 备份当前状态
git add .
git commit -m "Before refactoring: backup current structure"
```

### 2. 分批迁移

#### 批次 1: 工具函数 (低风险)
1. 移动文件到新位置
2. 更新 barrel exports
3. 更新引用路径
4. 运行测试验证

#### 批次 2: 服务层 (中风险)
1. 提取业务逻辑
2. 创建新的服务文件
3. 更新 oRPC procedures
4. 运行集成测试

#### 批次 3: 提供者层 (中风险)
1. 移动平台特定代码
2. 更新提供者注册
3. 更新引用路径
4. 测试平台功能

#### 批次 4: 配置和类型 (低风险)
1. 重组配置文件
2. 更新类型定义
3. 更新所有引用
4. 运行完整测试

### 3. 更新引用路径

#### 常见路径替换模式
```typescript
// 旧路径 → 新路径
import { downloadVideo } from '~/lib/youtube'
→ import { downloadVideo } from '~/lib/providers/youtube'

import { extractAudio } from '~/lib/media'
→ import { extractAudio } from '~/lib/services/media'

import { fileExists } from '~/lib/utils/file-utils'
→ import { fileExists } from '~/lib/utils/file'

import { BasicVideoInfo } from '~/lib/media/providers/types'
→ import { BasicVideoInfo } from '~/lib/types'

import { OPERATIONS_DIR } from '~/lib/constants'
→ import { OPERATIONS_DIR } from '~/lib/config'
```

### 4. 测试策略

#### 每个批次完成后测试
```bash
# 语法检查
pnpm lint

# 类型检查
pnpm build

# 单元测试
pnpm test

# 集成测试
pnpm dlx vitest run --integration
```

#### 关键功能测试
- [ ] YouTube 下载流程
- [ ] TikTok 下载流程
- [ ] 媒体处理流程
- [ ] AI 翻译功能
- [ ] 字幕生成功能
- [ ] 数据库操作
- [ ] API 端点响应

### 5. 清理工作

#### 删除旧文件 (确认无误后)
```bash
# 删除空的旧目录
rmdir lib/youtube
rmdir lib/tiktok
rmdir lib/media/utils
rmdir lib/subtitle/utils

# 清理不再使用的文件
git rm lib/youtube/download.ts
git rm lib/tiktok/index.ts
# 等等...
```

## 风险控制

### 回滚计划
如果迁移过程中出现问题：
```bash
# 回滚到迁移前状态
git reset --hard [backup-commit-hash]

# 或者使用 stash
git stash
git stash clear
```

### 渐进式迁移
- 一次只迁移一个模块
- 每次迁移后立即测试
- 保持旧文件直到新文件完全工作
- 逐步更新引用，而不是一次性全部更新

### 团队协作
- 在 PR 中明确标注迁移范围
- 提供详细的变更说明
- 要求代码审查
- 通知团队成员路径变更

## 验收标准

### 功能验收
- [ ] 所有现有功能正常工作
- [ ] 没有性能退化
- [ ] 错误日志没有增加
- [ ] 用户体验没有变化

### 代码质量验收
- [ ] 没有循环依赖
- [ ] TypeScript 编译通过
- [ ] ESLint 检查通过
- [ ] 测试覆盖率不降低

### 文档验收
- [ ] 更新 CLAUDE.md
- [ ] 更新 README
- [ ] 添加迁移文档
- [ ] 更新 API 文档

## 后续维护

### 开发规范
- 新功能必须按照新目录结构开发
- 禁止向旧目录添加新文件
- 定期检查是否有遗漏的引用

### 监控
- 监控构建时间变化
- 监控包大小变化
- 监控运行时性能
- 收集团队反馈

## 联系方式

如果在迁移过程中遇到问题：
1. 检查本文档是否有相关说明
2. 查看提交历史了解变更详情
3. 在团队频道中询问
4. 创建 issue 跟踪问题