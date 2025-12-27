import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReadStream, readFileSync, unlinkSync } from "node:fs";
import { promises as fsPromises } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { sendJson, sanitizeEngineOptions, createStatusHelpers, uploadArtifact, ensureDirExists, startJsonServer } from "./shared.mjs";
import { verifyHmacSHA256 } from "@app/job-callbacks";
// Compose pipelines via shared @app/media-* packages
// Compose pipelines with shared adapters from the monorepo packages
import {
  downloadVideo as coreDownloadVideo,
  extractAudio as coreExtractAudio,
  extractAudioSource as coreExtractAudioSource,
  transcodeAudioToWav as coreTranscodeAudioToWav,
  fetchVideoMetadata as coreFetchVideoMetadata,
} from "@app/media-node";
import {
  summariseMetadata,
  resolveForwardProxy as resolveForwardProxyCore,
  startMihomo as startMihomoProxy,
} from "@app/media-core";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import {
  downloadYoutubeComments as providerDownloadYoutubeComments,
  downloadTikTokCommentsByUrl as providerDownloadTikTokComments,
  listChannelVideos as providerListChannelVideos,
} from "@app/media-providers";

// Debug flag for verbose channel-list logging
const DEBUG_CHANNEL_LIST =
  process.env.DEBUG_CHANNEL_LIST === "1" ||
  process.env.MEDIA_DOWNLOADER_DEBUG === "1";
const dlog = (...args) => {
  if (DEBUG_CHANNEL_LIST) console.log("[channel-list/debug]", ...args);
};

const PORT = process.env.PORT || 8080;
const CALLBACK_SECRET = process.env.JOB_CALLBACK_HMAC_SECRET;
if (!CALLBACK_SECRET) {
  throw new Error("JOB_CALLBACK_HMAC_SECRET is required");
}
function parseNumber(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function extractLastJsonLine(text) {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {}
  }
  return null;
}

function extractLastNonEmptyLine(text) {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
}

async function runYtDlpJson(url, { proxy, timeoutMs }) {
  const { spawn } = await import("node:child_process");
  const args = [
    url,
    "--skip-download",
    "--print-json",
    "--no-playlist",
    // Prefer Deno when available (EJS / JS runtime may be required for YouTube extraction).
    "--js-runtimes",
    "deno",
    // Keep probe fast and bounded. (Do not change defaults used by other workflows.)
    "--retries",
    "1",
    "--extractor-retries",
    "1",
    "--fragment-retries",
    "0",
    "--socket-timeout",
    String(Math.max(5, Math.ceil(timeoutMs / 1000))),
  ];
  if (proxy) args.push("--proxy", proxy);

  return await new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
    }, timeoutMs);
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(extractLastJsonLine(stdout));
      reject(
        new Error(
          `yt-dlp exited with code ${code}: ${stderr || stdout}`.trim(),
        ),
      );
    });
  });
}

async function runYtDlpGetUrl(url, { proxy, timeoutMs }) {
  const { spawn } = await import("node:child_process");
  const args = [
    url,
    "--no-playlist",
    // Get a direct media URL (much smaller output than --print-json).
    "--get-url",
    // Prefer a single progressive MP4 if available; otherwise fallback to best.
    "--format",
    "best[ext=mp4]/best",
    // Prefer Deno when available (EJS / JS runtime may be required for YouTube extraction).
    "--js-runtimes",
    "deno",
    // Keep probe fast and bounded. (Do not change defaults used by other workflows.)
    "--retries",
    "1",
    "--extractor-retries",
    "1",
    "--fragment-retries",
    "0",
    "--socket-timeout",
    String(Math.max(5, Math.ceil(timeoutMs / 1000))),
  ];
  if (proxy) args.push("--proxy", proxy);

  return await new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {}
    }, timeoutMs);
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        const out = extractLastNonEmptyLine(stdout);
        if (out) return resolve(out);
        return reject(new Error("yt-dlp returned empty --get-url output"));
      }
      const reason = timedOut
        ? `timeout after ${timeoutMs}ms`
        : `code ${code ?? "null"}${signal ? ` signal ${signal}` : ""}`;
      reject(new Error(`yt-dlp failed (${reason}): ${stderr || stdout}`.trim()));
    });
  });
}

// Mihomo port allocator for concurrent jobs within a single container instance.
// Each job gets its own mihomo instance + unique ports + unique config directory.
const MIHOMO_BASE_PORT = parseNumber(process.env.MIHOMO_PORT, 7890);
let nextMihomoPort = MIHOMO_BASE_PORT % 2 === 0 ? MIHOMO_BASE_PORT : MIHOMO_BASE_PORT + 1;
const inUseMihomoPorts = new Set();
function allocateMihomoPortPair() {
  // Allocate an even http port and its adjacent socks port.
  for (let i = 0; i < 10_000; i++) {
    const httpPort = nextMihomoPort;
    const socksPort = httpPort + 1;
    nextMihomoPort += 2;
    if (inUseMihomoPorts.has(httpPort) || inUseMihomoPorts.has(socksPort)) continue;
    inUseMihomoPorts.add(httpPort);
    inUseMihomoPorts.add(socksPort);
    return {
      httpPort,
      socksPort,
      release() {
        inUseMihomoPorts.delete(httpPort);
        inUseMihomoPorts.delete(socksPort);
      },
    };
  }
  throw new Error("unable to allocate mihomo ports");
}

async function startMihomoForJob(engineOptions, jobId) {
  const ports = allocateMihomoPortPair();
  const baseDir = join(tmpdir(), `mihomo-${String(jobId).replace(/[^a-z0-9_-]+/gi, "_")}-${Date.now()}`);
  const providerDir = join(baseDir, "providers");
  let controller = null;
  try {
    controller = await startMihomoProxy(engineOptions, {
      logger: console,
      configDir: baseDir,
      providerDir,
      port: ports.httpPort,
      socksPort: ports.socksPort,
    });
    if (!controller) {
      ports.release();
      try {
        await fsPromises.rm(baseDir, { recursive: true, force: true });
      } catch {}
      return null;
    }
    const origCleanup = controller.cleanup;
    return {
      ...controller,
      async cleanup() {
        try {
          await origCleanup?.();
        } finally {
          ports.release();
          try {
            await fsPromises.rm(baseDir, { recursive: true, force: true });
          } catch {}
        }
      },
    };
  } catch (error) {
    ports.release();
    try {
      await fsPromises.rm(baseDir, { recursive: true, force: true });
    } catch {}
    throw error;
  }
}

// ensureDirExists imported from shared

// sendJson imported from shared

// Legacy helpers removed in favor of shared callback utils

// Forward proxy resolution moved to @app/media-core

// uploadArtifact imported from shared

async function handleRender(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  const sig = String(req.headers["x-signature"] || "");
  if (!verifyHmacSHA256(CALLBACK_SECRET, body, sig)) {
    console.warn("[media-downloader] unauthorized request: invalid signature");
    return sendJson(res, 401, { error: "unauthorized" });
  }

  const payload = JSON.parse(body);
  const {
    jobId = `job_${Math.random().toString(36).slice(2, 10)}`,
    mediaId,
    engineOptions = {},
    outputVideoPutUrl,
    outputAudioPutUrl,
    outputAudioSourcePutUrl,
    outputMetadataPutUrl,
    callbackUrl,
  } = payload;

  const safeEngineOptions = sanitizeEngineOptions(engineOptions);
  console.log("[media-downloader] received render request", {
    jobId,
    engineOptions: safeEngineOptions,
  });
  const maskUrl = (u) => (u ? String(u).split("?")[0] : null);
  console.log("[media-downloader] outputs summary", {
    jobId,
    hasVideoPutUrl: Boolean(outputVideoPutUrl),
    hasAudioPutUrl: Boolean(outputAudioPutUrl),
    hasAudioSourcePutUrl: Boolean(outputAudioSourcePutUrl),
    hasMetadataPutUrl: Boolean(outputMetadataPutUrl),
    videoPutUrl: maskUrl(outputVideoPutUrl),
    audioPutUrl: maskUrl(outputAudioPutUrl),
    audioSourcePutUrl: maskUrl(outputAudioSourcePutUrl),
    metadataPutUrl: maskUrl(outputMetadataPutUrl),
  });

  sendJson(res, 202, { jobId });

  const { postUpdate, progress } = createStatusHelpers({ callbackUrl, secret: CALLBACK_SECRET, jobId });

  const url = engineOptions.url;
  const quality = engineOptions.quality || "1080p";
  const task = (engineOptions.task || "").toString().toLowerCase();
  const isCommentsOnly = task === "comments";
  const isChannelList = task === "channel-list";
  const isMetadataOnly = task === "metadata-only";
  const isProxyProbe = task === "proxy-probe";

  if (!url) {
    await postUpdate("failed", { error: "missing url" });
    return;
  }

  // For full downloads, require video output; for comments/channel-list/metadata-only, require metadata output.
  if (!isChannelList && !isCommentsOnly && !isMetadataOnly && !isProxyProbe && !outputVideoPutUrl) {
    await postUpdate("failed", { error: "missing outputVideoPutUrl" });
    return;
  }
  if ((isCommentsOnly || isChannelList || isMetadataOnly || isProxyProbe) && !outputMetadataPutUrl) {
    const taskLabel = isChannelList ? "channel-list" : isCommentsOnly ? "comments" : isMetadataOnly ? "metadata-only" : "proxy-probe";
    await postUpdate("failed", { error: `missing outputMetadataPutUrl for ${taskLabel}` });
    return;
  }

  let clashController = null;
  try {
    clashController = await startMihomoForJob(engineOptions, jobId);
  } catch (error) {
    console.error("[media-downloader] Failed to start Clash/Mihomo", error);
  }

  const proxy = clashController
    ? clashController.proxyUrl
    : await resolveForwardProxyCore({
        proxy: engineOptions?.proxy,
        defaultProxyUrl: engineOptions?.defaultProxyUrl,
        logger: console,
      });
  console.log("[media-downloader] resolved proxy", {
    jobId,
    viaMihomo: Boolean(clashController),
    proxy,
  });

  async function probeDownloadCapability() {
    const start = Date.now();
    const probeBytes = Number.parseInt(String(engineOptions?.probeBytes ?? 65536), 10) || 65536;
    const timeoutMs = Number.parseInt(String(engineOptions?.timeoutMs ?? 20000), 10) || 20000;
    const runId = String(engineOptions?.runId || "");
    const proxyId = String(engineOptions?.proxyId || engineOptions?.proxy?.id || "");

    const deadline = Date.now() + timeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const remainingForMetadata = Math.max(1_000, deadline - Date.now());
      const metaStart = Date.now();
      const directUrl =
        remainingForMetadata > 0
          ? await runYtDlpGetUrl(url, { proxy, timeoutMs: remainingForMetadata })
          : "";
      const metaMs = Date.now() - metaStart;

      if (!directUrl) {
        throw new Error("no direct download url in metadata");
      }

      const agent = proxy ? new ProxyAgent(proxy) : undefined;
      const remainingForRange = Math.max(1_000, deadline - Date.now());
      if (remainingForRange <= 0) {
        throw new Error("timeout before range fetch");
      }
      const res = await undiciFetch(directUrl, {
        method: "GET",
        headers: { Range: `bytes=0-${probeBytes - 1}` },
        dispatcher: agent,
        signal: controller.signal,
      });

      if (!(res.ok || res.status === 206)) {
        throw new Error(`range fetch failed: ${res.status}`);
      }
      if (!res.body || typeof res.body.getReader !== "function") {
        throw new Error("missing response body");
      }

      const reader = res.body.getReader();
      let bytesRead = 0;
      while (bytesRead < probeBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) bytesRead += value.byteLength || value.length || 0;
        if (bytesRead >= probeBytes) break;
      }
      try {
        await reader.cancel();
      } catch {}

      const responseTimeMs = Date.now() - start;
      const result = {
        kind: "proxy-check",
        ok: bytesRead > 0,
        runId: runId || undefined,
        proxyId: proxyId || undefined,
        testUrl: url,
        responseTimeMs,
        metaMs,
        bytesRead,
        probeBytes,
        viaMihomo: Boolean(clashController),
        proxyUrl: proxy || null,
      };

      const buf = Buffer.from(JSON.stringify(result, null, 2), "utf8");
      await uploadArtifact(outputMetadataPutUrl, buf, "application/json");
      await postUpdate("completed", {
        phase: "completed",
        progress: 1,
        metadata: result,
      });
      console.log("[media-downloader] proxy-probe completed", {
        jobId,
        proxyId,
        viaMihomo: Boolean(clashController),
        proxy,
        responseTimeMs,
        bytesRead,
      });
    } catch (error) {
      const msg = error?.message || String(error);
      const responseTimeMs = Date.now() - start;
      const result = {
        kind: "proxy-check",
        ok: false,
        runId: runId || undefined,
        proxyId: proxyId || undefined,
        testUrl: url,
        responseTimeMs,
        probeBytes,
        viaMihomo: Boolean(clashController),
        proxyUrl: proxy || null,
        error: msg,
      };
      try {
        const buf = Buffer.from(JSON.stringify(result, null, 2), "utf8");
        await uploadArtifact(outputMetadataPutUrl, buf, "application/json");
      } catch {}
      await postUpdate("failed", {
        error: msg,
        metadata: result,
      });
      console.warn("[media-downloader] proxy-probe failed", {
        jobId,
        proxyId,
        viaMihomo: Boolean(clashController),
        proxy,
        responseTimeMs,
        error: msg,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
  const tmpDir = tmpdir();
  const basePath = join(tmpDir, `${jobId}`);
  const videoPath = `${basePath}.mp4`;
  const audioSourcePath = `${basePath}.source.mka`;
  const audioProcessedPath = `${basePath}.processed.wav`;
  const commentsDir = join(tmpDir, `${jobId}-comments`);
  let uploadedVideoBytes = null;
  let uploadedAudioProcessedBytes = null;
  let uploadedAudioSourceBytes = null;

  // progress helper imported from shared (created above)

  try {
    await progress("preparing", 0.05);
    await delay(100);
    await progress("fetching_metadata", 0.1);

    if (isProxyProbe) {
      await probeDownloadCapability();
      return;
    }

    if (isChannelList) {
      const limit = Number.parseInt(String(engineOptions?.limit ?? 20), 10) || 20;
      const channelUrlOrId = String(engineOptions?.channelUrlOrId || engineOptions?.url || "").trim();
      if (!channelUrlOrId) throw new Error("channelUrlOrId is required for channel-list task");

      const { channelId, videos } = await providerListChannelVideos({
        channelUrlOrId,
        limit,
        proxyUrl: proxy,
        logger: { warn: (...args) => console.warn(...args), log: (...args) => dlog(...args) },
      });

      const payload = { channel: { input: channelUrlOrId, id: channelId }, count: videos.length, videos };
      dlog("final results count=", videos.length, "firstIds=", videos.slice(0, 3).map((x) => x.id));
      const buf = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
      await uploadArtifact(outputMetadataPutUrl, buf, "application/json");
      await postUpdate("completed", {
        phase: "completed",
        progress: 1,
        metadata: { source: "youtube", channelId, count: videos.length },
      });
      console.log("[media-downloader] job completed", jobId, "channel-list=", videos.length);
      return;
    }

    if (isCommentsOnly) {
      const maxPages = parseNumber(engineOptions?.commentsPages, 3);
      const src = (engineOptions?.source || "youtube").toLowerCase();
      console.log(
        "[media-downloader] comments-only: start fetch via core pipeline",
        {
          source: src,
          pages: maxPages,
          viaMihomo: Boolean(clashController),
          proxy,
        },
      );
      const { runCommentsPipeline } = await import("@app/media-core");
      const commentsDownloader = async ({
        url: commentUrl,
        source,
        pages,
        proxy: proxyUrl,
      }) => {
        if (String(source).toLowerCase() === "tiktok") {
          return providerDownloadTikTokComments({
            url: commentUrl,
            pages,
            proxy: proxyUrl,
          });
        }
        return providerDownloadYoutubeComments({
          url: commentUrl,
          pages,
          proxy: proxyUrl,
        });
      };
      const resPipeline = await runCommentsPipeline(
        {
          url,
          source: src === "tiktok" ? "tiktok" : "youtube",
          pages: maxPages,
          proxy,
        },
        {
          commentsDownloader,
          artifactStore: {
            uploadMetadata: async (comments) => {
              if (!outputMetadataPutUrl) return;
              const buf = Buffer.from(
                JSON.stringify({ comments }, null, 2),
                "utf8",
              );
              await uploadArtifact(outputMetadataPutUrl, buf, "application/json");
            },
          },
        },
        (e) => {
          const stage = e.stage === "completed" ? "running" : e.stage;
          const p = Math.max(0, Math.min(1, e.progress ?? 0));
          progress(stage, p);
        },
      );

      await postUpdate("completed", {
        phase: "completed",
        progress: 1,
        metadata: {
          source: src,
          commentCount: resPipeline?.count || 0,
        },
      });
      console.log(
        "[media-downloader] job completed",
        jobId,
        "comments=",
        resPipeline?.count || 0,
      );
    } else if (isMetadataOnly) {
      const { fetchVideoMetadata } = await import("@app/media-node");
      console.log("[media-downloader] metadata-only: fetching", {
        jobId,
        viaMihomo: Boolean(clashController),
        proxy,
      });
      const rawMetadata = await fetchVideoMetadata(url, { proxy });
      const finalMetadata = summariseMetadata(
        rawMetadata && typeof rawMetadata === "object" ? rawMetadata : null,
      );

      if (outputMetadataPutUrl && rawMetadata) {
        const buf = Buffer.from(JSON.stringify(rawMetadata, null, 2), "utf8");
        await uploadArtifact(outputMetadataPutUrl, buf, "application/json");
      }

      await postUpdate("completed", {
        phase: "completed",
        progress: 1,
        metadata: {
          ...finalMetadata,
          source: engineOptions.source || "youtube",
        },
      });
      console.log("[media-downloader] job completed", jobId, "metadata-only");
    } else {
      const { runDownloadPipeline } = await import("@app/media-core");
      const pipelineRes = await runDownloadPipeline(
        { url, quality },
        {
          ensureDir: ensureDirExists,
          resolvePaths: async () => ({
            videoPath,
            audioPath: outputAudioPutUrl ? audioProcessedPath : undefined,
          }),
          downloader: async (u, q, out) =>
            coreDownloadVideo(u, q, out, {
              proxy,
              captureJson: Boolean(outputMetadataPutUrl),
            }),
          audioExtractor: outputAudioPutUrl
            ? async (v, out) => {
                if (outputAudioSourcePutUrl) {
                  await coreExtractAudioSource(v, audioSourcePath);
                  await coreTranscodeAudioToWav(audioSourcePath, out);
                  return;
                }
                await coreExtractAudio(v, out);
              }
            : async () => {},
          persistRawMetadata: async () => {},
          artifactStore: {
            uploadMetadata: async (data) => {
              if (!outputMetadataPutUrl) return;
              const buf = Buffer.from(JSON.stringify(data, null, 2), "utf8");
              await uploadArtifact(outputMetadataPutUrl, buf, "application/json");
            },
            uploadVideo: async (path) => {
              const stat = await fsPromises.stat(path);
              console.log("[media-downloader] upload video start", {
                jobId,
                path,
                bytes: stat.size,
                videoPutUrl: maskUrl(outputVideoPutUrl),
              });
              try {
                await uploadArtifact(
                  outputVideoPutUrl,
                  () => createReadStream(path),
                  "video/mp4",
                  { "content-length": String(stat.size) },
                );
                uploadedVideoBytes = stat.size;
                console.log("[media-downloader] upload video success", {
                  jobId,
                  bytes: stat.size,
                });
              } catch (err) {
                console.error("[media-downloader] upload video failed", {
                  jobId,
                  error: err?.message || String(err),
                });
                throw err;
              }
            },
            uploadAudio: async (path) => {
              if (!outputAudioPutUrl) return;
              const stat = await fsPromises.stat(path);
            console.log("[media-downloader] upload audio start", {
              jobId,
              path,
              bytes: stat.size,
              audioPutUrl: maskUrl(outputAudioPutUrl),
            });
              try {
                await uploadArtifact(
                  outputAudioPutUrl,
                  () => createReadStream(path),
                  "audio/wav",
                  { "content-length": String(stat.size) },
                );
                uploadedAudioProcessedBytes = stat.size;
                console.log("[media-downloader] upload audio success", {
                  jobId,
                  bytes: stat.size,
                });
              } catch (err) {
                console.error("[media-downloader] upload audio failed", {
                  jobId,
                  error: err?.message || String(err),
                });
                throw err;
              }
            },
          },
        },
        (e) => {
          const stage = e.stage === "completed" ? "running" : e.stage;
          const p = Math.max(0, Math.min(1, e.progress ?? 0));
          progress(stage, p);
        },
      );

      const finalMetadata = summariseMetadata(pipelineRes?.rawMetadata || null);

      // Upload source audio (lossless stream copy) if orchestrator provided a target.
      if (outputAudioSourcePutUrl) {
        const stat = await fsPromises.stat(audioSourcePath);
        console.log("[media-downloader] upload audio source start", {
          jobId,
          path: audioSourcePath,
          bytes: stat.size,
          audioSourcePutUrl: maskUrl(outputAudioSourcePutUrl),
        });
        await uploadArtifact(
          outputAudioSourcePutUrl,
          () => createReadStream(audioSourcePath),
          "audio/x-matroska",
          { "content-length": String(stat.size) },
        );
        uploadedAudioSourceBytes = stat.size;
        console.log("[media-downloader] upload audio source success", {
          jobId,
          bytes: stat.size,
        });
      }

      let callbackMetadata = {
        ...finalMetadata,
        quality,
        source: engineOptions.source || "youtube",
        ...(uploadedVideoBytes != null ? { videoBytes: uploadedVideoBytes } : {}),
        ...(uploadedAudioProcessedBytes != null
          ? { audioBytes: uploadedAudioProcessedBytes }
          : {}),
        ...(uploadedAudioSourceBytes != null
          ? { audioSourceBytes: uploadedAudioSourceBytes }
          : {}),
      };
      const bytesSnapshot = {
        ...(uploadedVideoBytes != null ? { videoBytes: uploadedVideoBytes } : {}),
        ...(uploadedAudioProcessedBytes != null
          ? { audioBytes: uploadedAudioProcessedBytes }
          : {}),
        ...(uploadedAudioSourceBytes != null
          ? { audioSourceBytes: uploadedAudioSourceBytes }
          : {}),
      };
      // Ensure title is present in the callback metadata (orchestrator forwards only this summary to the app).
      if (!callbackMetadata.title) {
        try {
          const { fetchVideoMetadata } = await import("@app/media-node");
          const raw = await fetchVideoMetadata(url, { proxy });
          const refreshed = summariseMetadata(
            raw && typeof raw === "object" ? raw : null,
          );
          callbackMetadata = {
            ...refreshed,
            quality,
            source: engineOptions.source || "youtube",
            ...bytesSnapshot,
          };
        } catch {}
      }
      await postUpdate("completed", {
        phase: "completed",
        progress: 1,
        metadata: callbackMetadata,
      });
    }
  } catch (error) {
    console.error("[media-downloader] job failed", jobId, error);
    await postUpdate("failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
  } finally {
    try {
      await clashController?.cleanup();
    } catch (error) {
      console.error(
        "[media-downloader] Failed to shutdown Clash cleanly",
        error,
      );
    }
    try {
      unlinkSync(videoPath);
    } catch {}
    try {
      unlinkSync(audioSourcePath);
    } catch {}
    try {
      unlinkSync(audioProcessedPath);
    } catch {}
    try {
      // cleanup comments dir
      await fsPromises.rm(commentsDir, { recursive: true, force: true });
    } catch {}
  }
}

startJsonServer(PORT, handleRender, 'media-downloader');
