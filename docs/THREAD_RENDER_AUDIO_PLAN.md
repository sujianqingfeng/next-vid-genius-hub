# Thread 渲染：上传音频并在视频中循环播放（实现计划）

## 目标
- 仅针对帖子（Threads）渲染视频增加背景音频（BGM）。
- 若存在音频：在成片全时长覆盖并循环播放。
- 上传方式：浏览器直传到对象存储（预签名 PUT），不经 Worker 转发文件内容。

## 数据模型
- 扩展 `thread_assets.kind`：新增 `audio`（复用 `storageKey/contentType/bytes/durationMs/status`）。
- `threads` 表新增 `audioAssetId`：当前帖子选择的音频资产（可为空）。
- （可选）`thread_renders` 表新增 `audioAssetId`：记录当次渲染使用的音频，便于回溯与下载一致性。

## 上传流程（直传）
1) 前端选择文件后调用 ORPC：`thread.audio.createUpload`
   - 校验用户/线程归属、content-type、大小上限
   - 生成 `assetId`、`storageKey`
   - 向 orchestrator 请求 `putUrl/getUrl`（短 TTL）
   - 返回 `assetId/putUrl/getUrl/storageKey`
2) 前端用 `putUrl` 直接 `PUT` 上传音频文件
3) 前端用 `<audio>` 读取 `duration` 计算 `durationMs`
4) 前端回调 ORPC：`thread.audio.completeUpload`
   - 写入 `bytes/durationMs/status=ready`
   - （可选）服务端用 `getUrl` 做一次 range probe，确认对象可读

## 线程绑定与 UI
- 在线程详情/渲染页增加：
  - 上传音频
  - 选择/清除当前音频
  - 展示时长/大小/状态（pending/ready/failed）
- ORPC：`thread.setAudioAsset({ threadId, audioAssetId|null })`

## 渲染链路改造
- `startCloudRender` / `buildThreadRenderSnapshot`
  - 读取 `threads.audioAssetId`
  - 若存在音频且 `storageKey` 可用：对 `storageKey` 做 presign GET，写入 snapshot 的 `inputProps.audio`
- Manifest（可选增强）
  - `inputs` 增加 `audioKey` / `audioUrl`（用于容器侧诊断）

## Remotion 合成（循环覆盖）
- 扩展 `@app/remotion-project`：
  - `ThreadVideoInputProps` 增加 `audio?: { url: string; durationMs: number; volume?: number }`
- 在模板组件（`ThreadForumVideo`）根部：
  - 计算视频总时长 frames
  - 按 `durationMs` 换算每段音频 frames
  - 使用 Remotion `<Audio>` + 多个 `<Sequence>` 将音频按段循环铺满总时长（最后一段自动截断）

## CORS 与安全
- 对象存储需允许前端域名对预签名 URL 发起 `PUT`（CORS）。
- 预签名接口建议由 app worker（ORPC）代理调用 orchestrator，避免前端直接访问 `/debug/presign`。

## 验证
- Web 端 Remotion Player 预览：有声、循环、无音频时行为不变。
- 云端渲染产物：确认 mp4 含音轨（播放器/ffprobe）。
- 回归：线程渲染、下载、缓存代理、作业回调链路不受影响。

