# 容器迁移指南（v2）：分层方案

## 概览
本文档（v2）更新迁移方案：不再将全部逻辑放入 `@app/media-core`，改为分层设计：

- `@app/media-core`：纯编排与类型（不依赖 Node/HTTP/二进制）
- `@app/media-node`：Node 适配层（yt-dlp、ffmpeg、文件系统）
- `@app/media-providers`：平台适配层（YouTube/TikTok，基于 `youtubei.js` + `undici`）

容器通过简单的适配器注入来组合这些包。目标仍是消除重复代码、统一进度上报，并通过端口完成上传。

## 架构（v2）
- `@app/media-core`
  - 流水线：`runDownloadPipeline`、`runCommentsPipeline`（仅编排）
  - 类型/端口：`artifactStore`、`VideoDownloader`、`AudioExtractor`、`CommentsDownloader`、`ProgressReporter`
- `@app/media-node`
  - `downloadVideo(url, quality, out, { proxy?, captureJson? })`（yt-dlp/yt-dlp-wrap）
  - `extractAudio(videoPath, audioPath)`（ffmpeg）
- `@app/media-providers`
  - `downloadYoutubeComments({ url, pages?, proxy? })`
  - `downloadTikTokCommentsByUrl({ url, pages?, proxy? })`
  - `extractVideoId(url)`
  
### 字幕渲染复用（新）

为消除“本地与容器”两套字幕渲染实现（VTT→ASS + FFmpeg + 黑屏/静音段），新增共享包：

- `@app/media-subtitles`
  - `renderVideoWithSubtitles(videoPath, vtt, outputPath, config?)`
  - `convertWebVttToAss(vtt, config)`、`escapeForFFmpegFilterPath(path)`、`getVideoResolution(path)`
  - 不依赖 Next/React，容器与应用可复用同一实现，保证视觉与参数一致。

容器集成步骤（示例：burner-ffmpeg）：

1) package.json（容器目录）引入本地包：
```
{
  "dependencies": {
    "@app/media-subtitles": "file:./packages/media-subtitles"
  }
}
```

2) Dockerfile 在仓库根构建并复制包后安装：
```
WORKDIR /app
COPY containers/burner-ffmpeg/package.json ./package.json
COPY packages/media-subtitles ./packages/media-subtitles
RUN npm install --omit=dev
COPY containers/burner-ffmpeg/index.mjs ./index.mjs
```

3) 代码使用共享包渲染：
```js
import { renderVideoWithSubtitles } from '@app/media-subtitles'
await renderVideoWithSubtitles(inFile, vttText, outFile, engineOptions.subtitleConfig)
```

迁移完成后，可删除容器内自实现的 `convertWebVttToAss`、FFmpeg 拼接与颜色/路径工具，降低分叉维护成本。
- 容器装配：
  - 解析请求 → 准备临时路径
  - 将 node/provider 适配器注入 `@app/media-core` 流水线
  - 通过 `artifactStore` 注入实现上传，并映射进度

## 前置条件
- 仓库通过 `pnpm` workspace 管理（`pnpm-workspace.yaml` 仅包含 `packages/*`），根 `package.json` 使用 `workspace:*` 引用内部包。容器自身的 `package.json` 保留 `file:` 依赖，以便在 Docker 内执行 `npm install`。
- 从仓库根目录构建容器，以安装本地工作区包：
  - `COPY containers/<container>/package.json ./package.json`
  - `COPY packages/media-core ./packages/media-core`
  - `COPY packages/media-node ./packages/media-node`
  - `COPY packages/media-providers ./packages/media-providers`
  - `RUN npm install --omit=dev`
  - `COPY containers/<container>/index.mjs ./index.mjs`
- 二进制：相应镜像中提供 `yt-dlp` 与 `ffmpeg`。

## 迁移步骤

1) 为容器增加依赖
- 文件：`containers/<container>/package.json`
```
{
  "dependencies": {
    "@app/media-core": "file:./packages/media-core",
    "@app/media-node": "file:./packages/media-node",
    "@app/media-providers": "file:./packages/media-providers"
  }
}
```

2) 修改 Dockerfile 以从 monorepo 安装（示例）：
```
WORKDIR /app
COPY containers/<container>/package.json ./package.json
COPY packages/media-core ./packages/media-core
COPY packages/media-node ./packages/media-node
COPY packages/media-providers ./packages/media-providers
RUN npm install --omit=dev
COPY containers/<container>/index.mjs ./index.mjs
```

3) 注入适配器并调用流水线
- 下载/抽音（类似 downloader 容器）：
```js
import { runDownloadPipeline } from '@app/media-core'
import { downloadVideo as nodeDownloadVideo, extractAudio as nodeExtractAudio } from '@app/media-node'

await runDownloadPipeline(
  { url, quality },
  {
    ensureDir: (dir) => fsPromises.mkdir(dir, { recursive: true }),
    resolvePaths: async () => ({ videoPath, audioPath }),
    downloader: (u, q, out) => nodeDownloadVideo(u, q, out, { proxy, captureJson: Boolean(outputMetadataPutUrl) }),
    audioExtractor: outputAudioPutUrl ? (v, a) => nodeExtractAudio(v, a) : async () => {},
    artifactStore: {
      uploadMetadata: async (data) => {
        if (!outputMetadataPutUrl) return
        const buf = Buffer.from(JSON.stringify(data, null, 2), 'utf8')
        await uploadArtifact(outputMetadataPutUrl, buf, 'application/json')
      },
      uploadVideo: async (path) => {
        const buf = Buffer.from(readFileSync(path))
        await uploadArtifact(outputVideoPutUrl, buf, 'video/mp4')
      },
      uploadAudio: async (path) => {
        if (!outputAudioPutUrl) return
        const buf = Buffer.from(readFileSync(path))
        await uploadArtifact(outputAudioPutUrl, buf, 'audio/mpeg')
      },
    },
  },
  (e) => {
    const stage = e.stage === 'completed' ? 'running' : e.stage
    const pct = Math.max(0, Math.min(1, e.progress ?? 0))
    // 这里映射到 orchestrator 回调
  }
)
```

```js
import { runCommentsPipeline } from '@app/media-core'
import { downloadYoutubeComments, downloadTikTokCommentsByUrl } from '@app/media-providers'

await runCommentsPipeline(
  { url, source, pages, proxy },
  {
    commentsDownloader: async ({ url: commentUrl, source: commentSource, pages: commentPages, proxy: commentProxy }) => (
      commentSource === 'tiktok'
        ? downloadTikTokCommentsByUrl({ url: commentUrl, pages: commentPages, proxy: commentProxy })
        : downloadYoutubeComments({ url: commentUrl, pages: commentPages, proxy: commentProxy })
    ),
    artifactStore: { /* 同上 */ },
  },
  onProgress
)
```

4) 清理容器内冗余代码
- 迁移后可删除：
  - 内嵌的 `yt-dlp` 下载封装、`ffmpeg` 抽音辅助
  - 自研 YouTube/TikTok 评论抓取逻辑（已在 provider 包）
  - 本地代理 fetch 包装（provider 包负责 Request 正常化 + 代理）

5) 收缩容器依赖
- 容器不再直接引入 `undici` / `youtubei.js`，它们在 `@app/media-providers` 中。
- `yt-dlp-wrap` 放在 `@app/media-node`（容器不再显式依赖）。
- 仅保留容器自身依赖（如 `yaml` 生成 Clash 配置）。

6) 验证
- 仓库根执行：
  - `pnpm install`
  - `docker compose build <container>`
  - `docker compose up -d <container>`
- 发起代表性任务，检查：
  - 进度回调（status/phase/progress）
  - 产物上传（video/audio/metadata）键

## 本地服务集成（可选）
- 本地 `DownloadService` 支持注入 artifact store，便于在本地模式也上传/同步：
```ts
import { downloadService } from '~/lib/services/download/download.service'

downloadService.withArtifactStore({
  uploadMetadata: async (data, ctx) => ({ key: `media/${ctx.operationDir.split('/').pop()}/metadata.json` }),
  uploadVideo: async (path, ctx) => ({ key: `media/${ctx.operationDir.split('/').pop()}.mp4` }),
  uploadAudio: async (path, ctx) => ({ key: `media/${ctx.operationDir.split('/').pop()}.mp3` }),
})
```
- 返回的 `{ key }` 会在数据库中持久化到 `remote*Key` 字段。

## 代理处理
- 若容器中运行 Clash/Mihomo，向流水线注入形如 `http://127.0.0.1:7890` 的 HTTP 代理。
- `@app/media-providers` 对 `youtubei.js`/Undici 的 Request 输入做了 URL 正常化，避免 `ERR_INVALID_URL`。

## 发布与回滚
- 逐个迁移容器；保留旧镜像 tag 以便快速回滚。
- 在 PR 中记录验证步骤与日志（进度回调、对象存储上传）。

## 故障排查
- “Module not found” 报错
  - Docker 构建上下文需为仓库根，且 `packages/media-core`、`packages/media-node`、`packages/media-providers` 必须在 `npm install` 之前复制到镜像。
  - 本地重新执行 `pnpm install` 并重启 dev 进程。
- YouTube 评论 + 代理异常
  - 确认代理可达；provider 包的 fetch 包装已处理 Request→URL 正常化。
- yt-dlp 相关问题
  - 确认下载容器中安装了 yt-dlp；本地模式下 core 会降级使用 `yt-dlp-wrap`。
