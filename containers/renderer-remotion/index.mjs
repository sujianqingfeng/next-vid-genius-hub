import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { startJsonServer, createStatusHelpers, sanitizeEngineOptions, sendJson } from "./shared.mjs";
import { fetch as undiciFetch } from "undici";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";
import { verifyHmacSHA256 } from "@app/job-callbacks";
import {
  buildCommentTimeline,
  REMOTION_FPS,
  inlineRemoteImage as inlineRemoteImageFromPkg,
  buildComposeArgs,
} from "@app/media-comments";
import {
  resolveForwardProxy,
  startMihomo as startMihomoProxy,
} from "@app/media-core";

const PORT = process.env.PORT || 8190;
const VALID_CHROME_MODES = new Set(["headless-shell", "chrome-for-testing"]);
const REMOTION_CHROME_MODE_RAW = String(process.env.REMOTION_CHROME_MODE || "");
const REMOTION_CHROME_MODE = VALID_CHROME_MODES.has(REMOTION_CHROME_MODE_RAW)
  ? REMOTION_CHROME_MODE_RAW
  : process.arch === "arm64"
    ? "headless-shell"
    : "chrome-for-testing";
const REMOTION_BROWSER_EXECUTABLE = process.env.REMOTION_BROWSER_EXECUTABLE || null;

async function execFFmpegWithProgress(args, totalDurationSeconds, onProgress) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args);
    const totalUs = Math.max(
      1,
      Math.floor((totalDurationSeconds || 0) * 1_000_000),
    );
    let lastPct = -1;
    let err = "";
    let buf = "";
    let lastTick = Date.now();
    const watchdogMs = 120000; // 2 minutes inactivity watchdog
    const timer = setInterval(() => {
      if (Date.now() - lastTick > watchdogMs) {
        console.error(
          "[remotion] ffmpeg no-progress watchdog fired, killing process",
        );
        try {
          p.kill("SIGKILL");
        } catch {}
      }
    }, 10000);

  p.stderr.on("data", (d) => {
    const s = d.toString();
    // Any stderr activity from ffmpeg indicates the process is alive; reset watchdog.
    lastTick = Date.now();
    err += s;
    buf += s;
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      // Parse -progress key=value output
      if (line.startsWith("out_time_us=")) {
        const us = parseInt(line.split("=")[1] || "0", 10);
        const ratio = Math.max(0, Math.min(1, us / totalUs));
        const pct = Math.round(ratio * 1000) / 10;
        if (pct !== lastPct) {
          lastPct = pct;
          lastTick = Date.now();
          try {
            if (typeof onProgress === "function") onProgress(ratio);
          } catch {}
          console.log(`[ffmpeg] compose progress=${pct}%`); // coarse-grained compose progress
        }
      }
      // Additional keep-alive: common keys from -progress output
      if (
        line.startsWith("frame=") ||
        line.startsWith("out_time_ms=") ||
        line.startsWith("out_time=") ||
        line.startsWith("progress=")
      ) {
        lastTick = Date.now();
      }
      if (line === "progress=end") {
        lastTick = Date.now();
      }
    }
  });
    p.on("exit", (code, signal) => {
      if (code !== 0) {
        console.error(
          `[remotion] ffmpeg exited code=${code} signal=${signal || "null"}`,
        );
      }
  });
    p.on("close", (code) => {
      clearInterval(timer);
      if (code === 0) return resolve(0);
      reject(new Error(err || `ffmpeg exit ${code}`));
    });
  });
}

// (timeline/layout helpers are provided by @app/media-comments)

async function handleRender(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  const secret = process.env.JOB_CALLBACK_HMAC_SECRET;
  if (!secret) {
    throw new Error("JOB_CALLBACK_HMAC_SECRET is required");
  }
  const sig = String(req.headers["x-signature"] || "");
  if (!verifyHmacSHA256(secret, body, sig)) {
    console.warn("[remotion] unauthorized request: invalid signature");
    return sendJson(res, 401, { error: "unauthorized" });
  }

  const payload = JSON.parse(body);
  const jobId =
    payload?.jobId || `job_${Math.random().toString(36).slice(2, 10)}`;
  const cbUrl = payload?.callbackUrl;
  const engineOptions = payload?.engineOptions || {};
  const safeEngineOptions = sanitizeEngineOptions(engineOptions);
  console.log(`[remotion] start job=${jobId}`);
  console.log("[remotion] engine options", {
    jobId,
    engineOptions: safeEngineOptions,
  });
  sendJson(res, 202, { jobId });

  const baseDefaultProxyUrl = engineOptions?.defaultProxyUrl || null;
  let clashController = null;

  // Optional progress helper
  const { postUpdate, progress } = createStatusHelpers({ callbackUrl: cbUrl, secret, jobId, fetchImpl: undiciFetch });

  try {
    const inputVideoUrl = payload?.inputVideoUrl;
    const inputDataUrl = payload?.inputDataUrl;
    const outputPutUrl = payload?.outputPutUrl;
    const outputVideoKey = payload?.outputVideoKey;
    const templateId = (engineOptions && engineOptions.templateId) || 'comments-default';
    const composeMode =
      (engineOptions && engineOptions.composeMode) ||
      (typeof templateId === 'string' && templateId.startsWith('thread') ? 'overlay-only' : 'compose-on-video');
    const requiresVideo = composeMode !== 'overlay-only';

    const clamp01 = (n) => Math.max(0, Math.min(1, n));
    let lastOverall = -1;
    let lastOverallSentAt = 0;
    const reportOverall = (phase, overall) => {
      const next = clamp01(overall);
      const now = Date.now();
      if (next < lastOverall) return;
      const delta = next - lastOverall;
      if (lastOverall >= 0) {
        if (delta <= 0) {
          if (now - lastOverallSentAt < 5000) return;
        } else if (delta < 0.003) {
          if (now - lastOverallSentAt < 1500) return;
        }
      }
      lastOverall = next;
      lastOverallSentAt = now;
      try {
        void progress(phase, next);
      } catch {}
    };

    if (!inputDataUrl || !outputPutUrl || !outputVideoKey || (requiresVideo && !inputVideoUrl)) {
      throw new Error(
        requiresVideo
          ? "missing required fields (inputVideoUrl/inputDataUrl/outputPutUrl/outputVideoKey)"
          : "missing required fields (inputDataUrl/outputPutUrl/outputVideoKey)",
      );
    }

    try {
      clashController = await startMihomoProxy(engineOptions, {
        logger: console,
      });
    } catch (error) {
      console.error("[remotion] Failed to start Clash/Mihomo", error);
    }
    const forwardProxy = resolveForwardProxy({
      proxy: engineOptions?.proxy,
      defaultProxyUrl: baseDefaultProxyUrl,
      logger: console,
    });
    const effectiveProxy =
      clashController?.proxyUrl || forwardProxy || baseDefaultProxyUrl;
    console.log("[remotion] resolved proxy", {
      jobId,
      viaMihomo: Boolean(clashController),
      proxy: effectiveProxy,
    });

    reportOverall("preparing", 0.05);
    const inFile = requiresVideo ? join(tmpdir(), `${jobId}_source.mp4`) : null;
    const dataJson = join(tmpdir(), `${jobId}_data.json`);
    const overlayOut = join(tmpdir(), `${jobId}_overlay.mp4`);
    const outFile = join(tmpdir(), `${jobId}_out.mp4`);

    if (requiresVideo) {
      console.log(
        "[remotion] downloading source video from:",
        inputVideoUrl.split("?")[0],
      );
      {
        const r = await undiciFetch(inputVideoUrl);
        if (!r.ok) throw new Error(`download source failed: ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        console.log(
          `[remotion] source video downloaded: ${(buf.length / 1024 / 1024).toFixed(2)} MB`,
        );
        writeFileSync(inFile, buf);
      }
    } else {
      console.log("[remotion] overlay-only mode: skipping source video download");
    }
    console.log(
      "[remotion] downloading comments data from:",
      inputDataUrl.split("?")[0],
    );
    {
      const r = await undiciFetch(inputDataUrl);
      if (!r.ok) throw new Error(`download comments-data failed: ${r.status}`);
      const txt = await r.text();
      console.log(
        `[remotion] comments data downloaded: ${(txt.length / 1024).toFixed(2)} KB`,
      );
      writeFileSync(dataJson, txt);
    }

    reportOverall("preparing", 0.12);

    // Parse input data
    const rawData = JSON.parse(readFileSync(dataJson, "utf8"));
    const isThreadTemplate = templateId === 'thread-forum';
    const kind = rawData?.kind;

    let inputProps = null;
    let compositionId = 'CommentsVideo';
    let coverDurationInFrames = 0;
    let totalDurationInFrames = 0;
    let totalDurationSeconds = 0;
    let coverDurationSeconds = 0;

    if (isThreadTemplate || kind === 'thread-render-snapshot') {
      console.log("[remotion] parsing thread snapshot data");
      const p = rawData?.inputProps || rawData;
      const replies = Array.isArray(p?.replies) ? p.replies : [];
      // Use comment-timeline helper for timing (map replies -> minimal Comment)
      const timingComments = replies.map((r) => ({
        id: r?.id || '',
        author: r?.author?.name || 'unknown',
        content: r?.plainText || '',
        likes: Number(r?.metrics?.likes || 0) || 0,
        replyCount: 0,
      }));
      const timeline = buildCommentTimeline(timingComments, REMOTION_FPS);
      coverDurationInFrames = Number(p?.coverDurationInFrames) || timeline.coverDurationInFrames;
      const replyDurationsInFrames =
        Array.isArray(p?.replyDurationsInFrames) && p.replyDurationsInFrames.length === replies.length
          ? p.replyDurationsInFrames
          : timeline.commentDurationsInFrames;

      inputProps = {
        ...p,
        coverDurationInFrames,
        replyDurationsInFrames,
        fps: REMOTION_FPS,
        templateConfig: engineOptions && engineOptions.templateConfig != null ? engineOptions.templateConfig : p?.templateConfig,
      };

      totalDurationInFrames =
        coverDurationInFrames +
        replyDurationsInFrames.reduce((sum, f) => sum + (Number(f) || 0), 0);
      totalDurationSeconds = totalDurationInFrames / REMOTION_FPS;
      coverDurationSeconds = coverDurationInFrames / REMOTION_FPS;
      compositionId = 'ThreadForumVideo';
      console.log(`[remotion] parsed thread replies=${replies.length}`);
    } else {
      console.log("[remotion] parsing comments data");
      const { videoInfo, comments } = rawData;
      console.log(`[remotion] parsed ${comments?.length || 0} comments`);

      // Inline remote images to avoid <Img> network stalls inside headless browser
      console.log(
        `[remotion] inlining remote images (1 video + ${comments?.length || 0} comment thumbnails)`,
      );
      const inlineRemoteImage = (url) =>
        inlineRemoteImageFromPkg(url, {
          proxyUrl: effectiveProxy || undefined,
          timeoutMs: 5000,
        });
      let inlineOk = 0,
        inlineFail = 0;

      // Download video thumbnail
      const preparedVideoInfo = {
        ...videoInfo,
        thumbnail: await inlineRemoteImage(videoInfo?.thumbnail).then((v) => {
          if (v) inlineOk++;
          else inlineFail++;
          return v;
        }),
      };

      // Download comment thumbnails in batches of 10 concurrent requests
      const preparedComments = [];
      const batchSize = 10;
      for (let i = 0; i < (comments || []).length; i += batchSize) {
        const batch = comments.slice(i, i + batchSize);
        console.log(
          `[remotion] inlining batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(comments.length / batchSize)} (${i + 1}-${Math.min(i + batchSize, comments.length)}/${comments.length})`,
        );
        const inlinedBatch = await Promise.all(
          batch.map(async (c) => {
            const inlined = await inlineRemoteImage(c?.authorThumbnail);
            if (inlined) inlineOk++;
            else inlineFail++;
            return { ...c, authorThumbnail: inlined || undefined };
          }),
        );
        preparedComments.push(...inlinedBatch);
      }
      const total = inlineOk + inlineFail;
      const successRate =
        total > 0 ? ((inlineOk / total) * 100).toFixed(1) : "0.0";
      console.log(
        `[remotion] images inlined: ok=${inlineOk} fail=${inlineFail} (${successRate}% success)`,
      );

      const timeline = buildCommentTimeline(preparedComments, REMOTION_FPS);
      coverDurationInFrames = timeline.coverDurationInFrames;
      totalDurationInFrames = timeline.totalDurationInFrames;
      totalDurationSeconds = timeline.totalDurationSeconds;
      coverDurationSeconds = timeline.coverDurationSeconds;

      inputProps = {
        videoInfo: preparedVideoInfo,
        comments: preparedComments,
        coverDurationInFrames,
        commentDurationsInFrames: timeline.commentDurationsInFrames,
        fps: REMOTION_FPS,
        templateConfig: engineOptions && engineOptions.templateConfig != null ? engineOptions.templateConfig : undefined,
      };

      compositionId = templateId === 'comments-vertical' ? 'CommentsVideoVertical' : 'CommentsVideo';
    }

    // Build overlay via Remotion
    reportOverall("preparing", 0.18);
    const tmpOut = join(tmpdir(), `${jobId}_bundle`);
    console.log("[remotion] bundling Remotion project...");
    const serveUrl = await bundle({
      entryPoint: join(process.cwd(), "remotion", "index.ts"),
      outDir: tmpOut,
      publicDir: join(process.cwd(), "public"),
      enableCaching: true,
      webpackOverride: (config) => ({
        ...config,
        resolve: {
          ...(config.resolve ?? {}),
          alias: {
            ...(config.resolve?.alias ?? {}),
            "~": process.cwd(),
          },
          extensions: [
            ".ts",
            ".tsx",
            ".js",
            ".jsx",
            ".mjs",
            ".cjs",
            ".json",
            ...(config.resolve?.extensions ?? []),
          ],
        },
      }),
    });
    console.log("[remotion] getting compositions...");
    console.log("[remotion] chrome", {
      jobId,
      chromeMode: REMOTION_CHROME_MODE,
      hasBrowserExecutable: Boolean(REMOTION_BROWSER_EXECUTABLE),
    });
    const compositions = await getCompositions(serveUrl, {
      inputProps,
      chromeMode: REMOTION_CHROME_MODE,
      browserExecutable: REMOTION_BROWSER_EXECUTABLE,
    });
    const composition = compositions.find((c) => c.id === compositionId);
    if (!composition)
      throw new Error(`Remotion composition "${compositionId}" not found`);
    console.log(
      "[remotion] composition ready. frames=",
      totalDurationInFrames,
      "fps=",
      REMOTION_FPS,
    );
    reportOverall("preparing", 0.2);
    let lastRenderProgress = -1;
    const renderRangeStart = 0.2;
    const renderRangeEnd = requiresVideo ? 0.75 : 0.9;
    await renderMedia({
      composition: {
        ...composition,
        durationInFrames: totalDurationInFrames,
        fps: REMOTION_FPS,
      },
      serveUrl,
      codec: "h264",
      audioCodec: "aac",
      outputLocation: overlayOut,
      inputProps,
      chromeMode: REMOTION_CHROME_MODE,
      browserExecutable: REMOTION_BROWSER_EXECUTABLE,
      chromiumOptions: {
        ignoreCertificateErrors: true,
        gl: "angle",
        enableMultiProcessOnLinux: true,
      },
      envVariables: {
        REMOTION_DISABLE_CHROMIUM_PROVIDED_HEADLESS_WARNING: "true",
      },
      timeoutInMilliseconds: 120000,
      onProgress: ({ progress, renderedFrames, encodedFrames }) => {
        if (typeof progress === "number") {
          const p = clamp01(progress);
          const overall =
            renderRangeStart + (renderRangeEnd - renderRangeStart) * p;
          reportOverall("running", overall);

          const currentProgress = Math.round(progress * 100);
          if (
            currentProgress !== lastRenderProgress &&
            (currentProgress % 5 === 0 || currentProgress === 100)
          ) {
            lastRenderProgress = currentProgress;
            console.log(
              `[remotion] render progress=${currentProgress}% frames=${renderedFrames}/${encodedFrames}`,
            );
          }
        }
      },
    });

    let finalOut = outFile;
    if (requiresVideo) {
      // Compose overlay with source video via FFmpeg
      reportOverall("running", 0.75);
      console.log("[remotion] starting FFmpeg composition...");
      // Optionally override source video slot for specific templates (e.g., vertical source on left)
      let overrideLayout = undefined;
      if (templateId === 'comments-vertical') {
        // Match left video box in CommentsVideoVertical overlay: paddingX=48, column width=560, inner box=540x960 centered -> x = 48 + 10
        overrideLayout = { x: 58, y: 36, width: 540, height: 960 };
      }

      const ffArgs = buildComposeArgs({
        overlayPath: overlayOut,
        sourceVideoPath: inFile,
        outputPath: outFile,
        fps: REMOTION_FPS,
        coverDurationSeconds,
        totalDurationSeconds,
        layout: overrideLayout,
        preset: "veryfast",
      });
      await execFFmpegWithProgress(ffArgs, totalDurationSeconds, (ratio) => {
        const p = clamp01(ratio);
        const overall = 0.75 + (0.9 - 0.75) * p;
        reportOverall("running", overall);
      });
      console.log("[remotion] FFmpeg composition complete");
      finalOut = outFile;
    } else {
      console.log("[remotion] overlay-only: skipping FFmpeg composition");
      finalOut = overlayOut;
    }
    try {
      rmSync(tmpOut, { recursive: true, force: true });
    } catch {}

    reportOverall("uploading", 0.95);
    const buf = readFileSync(finalOut);
    console.log(
      `[remotion] uploading artifact size=${buf.length} bytes ->`,
      outputPutUrl.split("?")[0],
    );
    const headers = {
      "content-type": "video/mp4",
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    };
    const up = await undiciFetch(outputPutUrl, {
      method: "PUT",
      headers,
      body: buf,
    });
    console.log(`[remotion] upload response status=${up.status}`);
    if (!up.ok) {
      let msg = "";
      try {
        msg = await up.text();
      } catch {}
      console.error("[remotion] upload error body:", msg);
      throw new Error(`upload failed: ${up.status}`);
    }
    try {
      reportOverall("uploading", 1);
    } catch {}
    console.log(`[remotion] completed job=${jobId}`);
    await postUpdate("completed", {
      phase: "completed",
      progress: 1,
      outputs: { video: { key: outputVideoKey } },
    });
  } catch (e) {
    console.error(`[remotion] job ${jobId} failed:`, e);
    try {
      await postUpdate("failed", { error: e?.message || "unknown error" });
    } catch {}
  } finally {
    try {
      if (clashController?.cleanup) {
        await clashController.cleanup();
      }
    } catch (cleanupError) {
      console.error(
        "[remotion] Failed to shutdown Clash cleanly",
        cleanupError,
      );
    }
  }
}

startJsonServer(PORT, handleRender, 'renderer-remotion scaffold');
