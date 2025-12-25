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

async function execFFmpegWithProgress(args, totalDurationSeconds) {
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
    if (!inputVideoUrl || !inputDataUrl || !outputPutUrl) {
      throw new Error(
        "missing required URLs (inputVideoUrl/inputDataUrl/outputPutUrl)",
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

    await progress("preparing", 0.05);
    const inFile = join(tmpdir(), `${jobId}_source.mp4`);
    const dataJson = join(tmpdir(), `${jobId}_data.json`);
    const overlayOut = join(tmpdir(), `${jobId}_overlay.mp4`);
    const outFile = join(tmpdir(), `${jobId}_out.mp4`);

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

    // Parse input data
    console.log("[remotion] parsing comments data");
    const { videoInfo, comments } = JSON.parse(readFileSync(dataJson, "utf8"));
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

    // Build overlay via Remotion
    await progress("running", 0.15);
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
    console.log("[remotion] bundle complete, building timeline");
    const {
      coverDurationInFrames,
      commentDurationsInFrames,
      totalDurationInFrames,
      totalDurationSeconds,
      coverDurationSeconds,
    } = buildCommentTimeline(preparedComments, REMOTION_FPS);
    console.log(
      `[remotion] timeline: cover=${coverDurationSeconds}s total=${totalDurationSeconds}s`,
    );
    const inputProps = {
      videoInfo: preparedVideoInfo,
      comments: preparedComments,
      coverDurationInFrames,
      commentDurationsInFrames,
      fps: REMOTION_FPS,
      templateConfig: engineOptions && engineOptions.templateConfig != null ? engineOptions.templateConfig : undefined,
    };
    console.log("[remotion] getting compositions...");
    const compositions = await getCompositions(serveUrl, { inputProps });
    // Pick composition by templateId when provided
    const templateId = (engineOptions && engineOptions.templateId) || 'comments-default';
    const compositionId = templateId === 'comments-vertical' ? 'CommentsVideoVertical' : 'CommentsVideo';
    const composition = compositions.find((c) => c.id === compositionId);
    if (!composition)
      throw new Error(`Remotion composition "${compositionId}" not found`);
    console.log(
      "[remotion] composition ready. frames=",
      totalDurationInFrames,
      "fps=",
      REMOTION_FPS,
    );
    let lastRenderProgress = -1;
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

    // Compose overlay with source video via FFmpeg
    await progress("running", 0.8);
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
    await execFFmpegWithProgress(ffArgs, totalDurationSeconds);
    console.log("[remotion] FFmpeg composition complete");
    try {
      rmSync(tmpOut, { recursive: true, force: true });
    } catch {}

    await progress("uploading", 0.95);
    const buf = readFileSync(outFile);
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
      await progress("uploading", 1);
    } catch {}
    console.log(`[remotion] completed job=${jobId}`);
    await postUpdate("completed", { phase: "completed", progress: 1 });
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
