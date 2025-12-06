# 容器收敛执行计划（方案 A）

目标：容器只做「收请求 → 组装 temp 路径/回调 → 调用 packages 中的 pipeline → 上传/回调」，所有媒资逻辑集中到 `packages/*`。

## 进度快照
- ✅ 第 1 步：media-downloader 不再自带 Clash/Mihomo 实现，改用 `@app/media-core.startMihomo`。
- ✅ 第 2 步：media-downloader 下载 / 评论 / metadata-only 分支只调 packages，容器不再包含媒资处理逻辑。
- ⏳ 第 3 步：音频转码逻辑已下沉到 `@app/media-node.transcodeToTargetSize`，容器改为调用该函数；待补测试/验证。
- ⏳ 第 4 步：channel-list 逻辑已下沉到 `@app/media-providers.listChannelVideos`，容器调用该 API；待补测试/验证。
- ✅ 第 5 步：迁移指南（中/英）已更新，覆盖 transcode/channel-list 下沉、依赖说明、示例代码。

## 详细步骤

### 1) 收敛代理 / Clash / Mihomo（已完成）
- 文件：`containers/media-downloader/index.mjs`
- 动作：删除本地 SSR/Trojan/VLESS 解析、Clash config/start 逻辑，改为调用 `@app/media-core.startMihomo` + `resolveForwardProxy`。
- 验证：下载/评论任务可用，代理仍生效。

### 2) 瘦身 media-downloader（下载/评论/metadata-only 全走 packages）
- 文件：`containers/media-downloader/index.mjs`
- 动作：
  - 下载分支：仅调用 `runDownloadPipeline` + `@app/media-node`（已基本如此，确认无残留 ffmpeg/yt-dlp 逻辑）。
  - 评论分支：只调用 `runCommentsPipeline` + `@app/media-providers`；平台扩展只在 providers。
  - metadata-only：只用 `fetchVideoMetadata` + `summariseMetadata`，容器不再加工。
  - 其余非回调/上传/路径逻辑若与媒资相关，迁移到 packages。
- 文档：更新 `docs/containers-migration-guide.*.md` 的代码示例与当前实现一致。
- 验证：下载 / comments-only / metadata-only 各跑一条，回调字段不变。

### 3) 抽离音频转码到包，瘦身 audio-transcoder（进行中）
- 已做：
  - `@app/media-node` 新增 `transcodeToTargetSize`，容器调用它完成码率迭代与体积控制。
  - `containers/audio-transcoder` 去除了内置 ffmpeg 循环和 execa 依赖，改为调包 + 统一上传/回调。
  - Dockerfile/manifest 已添加 `@app/media-node` 依赖。
- 待办：
  - 为 `transcodeToTargetSize` 补 Vitest（多码率收敛、ffmpeg 缺失/异常）。
  - 重建并 smoke 一条转码任务，确认回调/体积控制正常。

### 4) 将 channel-list 逻辑下沉到 provider 层
- 已做：
  - `@app/media-providers` 新增 `listChannelVideos`，封装 Innertube + ProxyAgent + 代理 fetch。
  - 容器 `channel-list` 分支改为只做参数校验、代理解析、上传/回调。
- 待办：
  - 为 `listChannelVideos` 写 Vitest（正常/代理错误）。
  - 跑一次 channel-list smoke，确认回调/输出结构不变。

### 5) 文档与清理
- 更新：
  - `docs/containers-migration-guide.*.md`：强调“唯一真相在 packages”，列出各包职责。
  - `docs/CLOUDFLARE_DEPLOY.zh-CN.md`：提醒新包需要 COPY/`file:` 依赖到容器 Dockerfile。
- 可选：写一份简短 ADR（`docs/` 下）说明容器瘦身决策。

## 推荐执行顺序
按 2 → 3 → 4 → 5 小步提交，便于回滚；每步一个 PR/变更集。

## 待办检查清单
- [x] 第 2 步完成 & 验证
- [ ] 第 3 步测试 & 验证
- [ ] 第 4 步测试 & 验证
- [x] 第 5 步文档更新
