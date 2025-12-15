# ASR Whisper API：Cloudflare 524 超时问题记录

## 背景

> 说明：该文档记录的是旧的 Whisper API 方案；当前 `asr-pipeline` 已调整为由 orchestrator Worker 直接调用 Workers AI，不再经过 Next 的 `/api/asr/run`。

当前 ASR 流程（简化）：

1. Worker orchestrator 运行 `asr-pipeline`：
   - 从对象存储读取音频（key：`outputAudioKey` / `sourceKey`）。
2. Worker 直接调用 Workers AI ASR（`/ai/run/:model`）。
3. Worker 将 `vtt` / `words.json` 写回 R2，并回调 Next `cf-callback` 落库与计费。

## 现象（Symptoms）

- Worker 日志出现：
  - `Workers AI ASR failed: 524 ...`
- Whisper 服务端日志显示任务仍在持续进行：
  - 能看到 `Transcribing... 10% / 20% ...` 的进度输出。

结论：调用链路超时断开了，但源站 ASR 计算仍在后台继续跑。

## 关键报错（Error）

这是典型的 Cloudflare 524（代理等待源站响应超时）：

- 触发条件（推断）：`/v1/audio/transcriptions` 是“同步长耗时”接口，长时间不返回首字节；
- Cloudflare 在超时时间到达后返回 524；
- 客户端（Next）拿到 524 → 抛错 → `asr-pipeline` 判定失败；
- 源站继续处理，但结果无法回传到当前任务（除非额外做“结果回收/查询”机制）。

## 影响（Impact）

- 任务状态：ASR pipeline 失败（UI/任务状态会显示失败）。
- 资源浪费：ASR 服务端仍继续跑，计算资源已消耗但产物未入库。
- 可靠性：长音频会稳定触发该问题（越长越容易）。

## 根因（Root Cause）

请求链路走了 Cloudflare 代理，而 ASR 转录是同步长请求；代理层对“长时间无响应”的请求有硬超时，导致 524。

这不是代码逻辑 bug，属于架构/网络层约束导致的不可靠。

## 可选方案（按推荐顺序）

### 方案 A（最快落地）：绕过 Cloudflare 代理，直连源站

目标：避免 CF 524，让长请求能等到源站返回。

做法：

- 给 Whisper API 配一个“DNS only / 灰云”的域名，或直接用内网地址（例如同 docker network 的 `http://whisper-api:PORT`）。
- 将 Admin 里 `whisper_api` provider 的 `baseUrl` 改为直连地址（注意：当前实现会拼 `/v1/...`，所以 `baseUrl` 不要带 `/v1`）。

优点：改动最小、见效最快。
缺点：需要网络层/部署层支持（证书、访问控制、IP 白名单等）。

### 方案 B（最正规）：把转录接口改为异步 Job（推荐长期方案）

目标：转录请求立即返回 `job_id`，后续轮询/回调获取结果。

建议 API 形状：

- `POST /v1/audio/transcriptions` → `202 { jobId }`
- `GET /v1/jobs/{jobId}` → `{ status, progress, result? }`
- 结果落地：`result.vtt` / `result.words` 或提供下载链接

Next 侧改造：

- `/api/asr/run` 发起 job 后轮询直到完成（或交给 Worker 来轮询也可以）。

Worker 侧更贴合：

- orchestrator 本身已有 job 状态查询与轮询逻辑，适合承载“等待完成”的职责。

优点：彻底解决超时与稳定性问题，可扩展进度展示、重试、取消等。
缺点：需要改 ASR 服务端 + Next/Worker 集成。

### 方案 C：流式输出（SSE / chunked）

目标：持续向代理发送数据（哪怕是心跳/进度），避免长时间无首字节导致超时。

优点：服务端改动相对小于完整异步化。
缺点：对客户端与中间层行为有要求，复杂度与兼容性风险较高。

### 方案 D：音频分片转录 + 合并时间轴

目标：把一次长请求变成多个短请求，降低单次超时风险。

优点：可以继续沿用同步接口。
缺点：实现复杂（分片、偏移、合并 words 时间戳、边界断句/上下文质量问题）。

### 方案 E：提速（治标不治本）

例如换更快模型、GPU、`compute_type`、并发、VAD 参数等，缩短耗时。

优点：能降低触发概率。
缺点：无法保证不触发（长音频仍可能超时），根因仍在。

## 明天处理前的检查清单（Checklist）

1. 确认 Whisper API 是否被 Cloudflare 代理：
   - 若是：优先试方案 A（DNS only/直连）。
2. 确认服务端是否支持异步 job：
   - 若已有 job/队列能力：优先上方案 B。
3. 记录一次“成功短音频”和“失败长音频”的对比：
   - 音频时长、请求耗时、超时点、是否有任何 partial 输出。
4. 如果继续走同步接口：
   - 确认链路中是否还有其他超时（Next/Worker/反代/Nginx 等）。

## 临时缓解（Today Quick Fix）

- 若必须先跑通：把 Whisper API 换成直连地址（绕过 Cloudflare）。
- 否则：不要再依赖同步长请求（避免浪费算力）。
