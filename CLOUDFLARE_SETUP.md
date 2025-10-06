# Cloudflare Workers AI 转录配置指南

本项目现已支持使用 Cloudflare Workers AI 进行语音转录，作为本地 Whisper.cpp 的替代方案。

## 功能特点

- **双重支持**：同时支持本地 Whisper.cpp 和 Cloudflare Workers AI
- **多种模型**：支持 whisper-tiny-en 和 whisper-large-v3-turbo 模型
- **按需付费**：仅为使用的转录时间付费
- **全球分布**：利用 Cloudflare 的全球网络实现低延迟
- **无需本地资源**：不需要本地 GPU 或大内存配置

## 配置步骤

### 1. 获取 Cloudflare API 凭据

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 获取您的 **Account ID**：
   - 在右侧边栏的 "Overview" 部分找到 Account ID
3. 创建 API Token：
   - 前往 [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - 点击 "Create Token"
   - 选择 "Custom token" 模板
   - 配置权限：
     - Account: `Cloudflare Workers AI:Edit`
     - Zone Resources: `All zones` 或选择特定区域
   - 设置 TTL 并创建 token

### 2. 配置环境变量

在项目根目录创建 `.env.local` 文件：

```bash
# 数据库配置
DATABASE_URL="file:./local.db"

# Cloudflare Workers AI 配置
CLOUDFLARE_ACCOUNT_ID="your-account-id-here"
CLOUDFLARE_API_TOKEN="your-api-token-here"

# 本地 Whisper 配置（可选）
WHISPER_CPP_PATH=""
```

**重要提示**：
- 将 `.env.local` 添加到 `.gitignore` 文件中
- 永远不要将 API token 提交到版本控制系统

### 3. 重启开发服务器

```bash
pnpm dev
```

## 使用方法

### 在转录界面中

1. 前往视频的字幕页面 `/media/[id]/subtitles`
2. 在第一步 "Generate Subtitles" 中：
   - **Transcription Provider**：选择 "Cloudflare API"
   - **Model**：选择可用的模型：
     - `Whisper Tiny (EN)`：快速，仅支持英语
     - `Whisper Large v3 Turbo`：高质量，速度较快
3. 点击 "Start Transcription" 开始转录

### 模型对比

| 模型 | 速度 | 质量 | 语言支持 | VTT 输出 | 适用场景 |
|------|------|------|----------|----------|----------|
| Whisper Tiny (EN) | 快 | 一般 | 英语仅 | ✅ 支持 | 快速转录英语内容 |
| Whisper Large v3 Turbo | 中等 | 高 | 多语言 | ✅ 支持 | 高质量多语言转录 |
| Whisper Medium (本地) | 慢 | 高 | 多语言 | ❌ 转换 | 离线转录，无额外成本 |
| Whisper Large (本地) | 很慢 | 最高 | 多语言 | ❌ 转换 | 最佳质量，离线使用 |

## 成本说明

Cloudflare Workers AI 按使用时长收费：

- **whisper-large-v3-turbo**：$0.00051 每音频分钟
- **whisper-tiny-en**：更低成本（具体价格请参考 Cloudflare 定价）

### API 技术细节

- **输入格式**：8位无符号整数数组 (0-255)
- **输出格式**：JSON，包含转录文本和可选的 VTT 格式
- **文件限制**：最大 25MB 音频文件
- **支持格式**：MP3, WAV, M4A, OGG 等常见音频格式

相比本地部署，可以节省：
- GPU 硬件成本
- 服务器维护成本
- 电费和散热成本

## 故障排除

### 常见错误

1. **"Cloudflare configuration is missing"**
   - 确保 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN` 已正确设置
   - 检查环境变量是否在 `.env.local` 文件中

2. **"Transcription failed: 401 Unauthorized"**
   - 检查 API Token 是否有效
   - 确认 Token 权限包含 "Cloudflare Workers AI:Edit"

3. **"Transcription failed: 403 Forbidden"**
   - 检查 Account ID 是否正确
   - 确认账户已启用 Workers AI 功能

4. **"Model is not supported"**
   - 确保选择的模型与 Cloudflare 提供者匹配
   - 检查模型名称拼写

### 网络问题

如果遇到网络连接问题：
1. 检查防火墙设置
2. 确认可以访问 `api.cloudflare.com`
3. 考虑使用本地转录作为备选方案

## API 使用限制

- 文件大小限制：最大 25MB
- 支持的音频格式：MP3, WAV, M4A, OGG 等
- 并发请求限制：根据账户类型而定

## 安全最佳实践

1. **保护 API Token**：
   - 使用环境变量存储敏感信息
   - 定期轮换 API Token
   - 限制 Token 权限范围

2. **监控使用情况**：
   - 在 Cloudflare Dashboard 中监控 API 使用量
   - 设置使用警报避免意外费用

3. **数据隐私**：
   - Cloudflare Workers AI 不会长期存储音频数据
   - 查看隐私政策了解数据处理详情

## 开发者信息

如需了解更多关于 Cloudflare Workers AI 的信息：

- [官方文档](https://developers.cloudflare.com/workers-ai/)
- [Whisper 模型文档](https://developers.cloudflare.com/workers-ai/models/whisper/)
- [API 参考](https://developers.cloudflare.com/workers-ai/api-reference/)

## 技术实现

本项目的 Cloudflare 集成包含以下组件：

- `lib/ai/cloudflare.ts`：Cloudflare API 客户端
- `lib/asr/whisper/index.ts`：转录提供者抽象
- `lib/constants.ts`：环境变量配置
- `orpc/procedures/subtitle.ts`：后端转录程序
- `components/business/media/subtitles/Step1Transcribe.tsx`：UI 组件

如需自定义或扩展功能，请参考上述文件中的实现。