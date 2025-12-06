import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, unlinkSync } from "node:fs";
import { promises as fsPromises } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { sendJson, sanitizeEngineOptions, createStatusHelpers, uploadArtifact, ensureDirExists, startJsonServer } from "./shared.mjs";
// Compose pipelines via shared @app/media-* packages
// Compose pipelines with shared adapters from the monorepo packages
import {
  downloadVideo as coreDownloadVideo,
  extractAudio as coreExtractAudio,
} from "@app/media-node";
import {
  summariseMetadata,
  resolveForwardProxy as resolveForwardProxyCore,
  startMihomo as startMihomoProxy,
} from "@app/media-core";
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
const CALLBACK_SECRET = process.env.JOB_CALLBACK_HMAC_SECRET || "dev-secret";
function parseNumber(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

// ensureDirExists imported from shared

// sendJson imported from shared

// Legacy helpers removed in favor of shared callback utils

// Forward proxy resolution moved to @app/media-core

// uploadArtifact imported from shared

async function handleRender(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  const payload = JSON.parse(body);
  const {
    jobId = `job_${Math.random().toString(36).slice(2, 10)}`,
    mediaId,
    engineOptions = {},
    outputVideoPutUrl,
    outputAudioPutUrl,
    outputMetadataPutUrl,
    outputVideoKey,
    outputAudioKey,
    outputMetadataKey,
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
    outputVideoKey,
    outputAudioKey,
    outputMetadataKey,
    hasVideoPutUrl: Boolean(outputVideoPutUrl),
    hasAudioPutUrl: Boolean(outputAudioPutUrl),
    hasMetadataPutUrl: Boolean(outputMetadataPutUrl),
    videoPutUrl: maskUrl(outputVideoPutUrl),
    audioPutUrl: maskUrl(outputAudioPutUrl),
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

  if (!url) {
    await postUpdate("failed", { error: "missing url" });
    return;
  }

  // For full downloads, require video output; for comments/channel-list/metadata-only, require metadata output.
  if (!isChannelList && !isCommentsOnly && !isMetadataOnly && !outputVideoPutUrl) {
    await postUpdate("failed", { error: "missing outputVideoPutUrl" });
    return;
  }
  if ((isCommentsOnly || isChannelList || isMetadataOnly) && !outputMetadataPutUrl) {
    const taskLabel = isChannelList ? "channel-list" : isCommentsOnly ? "comments" : "metadata-only";
    await postUpdate("failed", { error: `missing outputMetadataPutUrl for ${taskLabel}` });
    return;
  }

  let clashController = null;
  try {
    clashController = await startMihomoProxy(engineOptions, { logger: console });
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
  const tmpDir = tmpdir();
  const basePath = join(tmpDir, `${jobId}`);
  const videoPath = `${basePath}.mp4`;
  const audioPath = `${basePath}.mp3`;
  const commentsDir = join(tmpDir, `${jobId}-comments`);

  // progress helper imported from shared (created above)

  try {
    await progress("preparing", 0.05);
    await delay(100);
    await progress("fetching_metadata", 0.1);

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
      const outputs = {};
      if (outputMetadataKey) outputs.metadata = { key: outputMetadataKey };
      await postUpdate("completed", {
        phase: "completed",
        progress: 1,
        outputs,
        outputMetadataKey,
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
              await uploadArtifact(
                outputMetadataPutUrl,
                buf,
                "application/json",
              );
            },
          },
        },
        (e) => {
          const stage = e.stage === "completed" ? "running" : e.stage;
          const p = Math.max(0, Math.min(1, e.progress ?? 0));
          progress(stage, p);
        },
      );

      const outputs = {};
      if (outputMetadataKey) outputs.metadata = { key: outputMetadataKey };
      await postUpdate("completed", {
        phase: "completed",
        progress: 1,
        outputMetadataKey,
        outputs,
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

      const outputs = {};
      if (outputMetadataKey) outputs.metadata = { key: outputMetadataKey };

      await postUpdate("completed", {
        phase: "completed",
        progress: 1,
        outputMetadataKey,
        outputs,
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
          resolvePaths: async () => ({ videoPath, audioPath }),
          downloader: async (u, q, out) =>
            coreDownloadVideo(u, q, out, {
              proxy,
              captureJson: Boolean(outputMetadataPutUrl),
            }),
          audioExtractor: outputAudioPutUrl
            ? (v, a) => coreExtractAudio(v, a)
            : async () => {},
          persistRawMetadata: async () => {},
          artifactStore: {
            uploadMetadata: async (data) => {
              if (!outputMetadataPutUrl) return;
              const buf = Buffer.from(JSON.stringify(data, null, 2), "utf8");
              await uploadArtifact(
                outputMetadataPutUrl,
                buf,
                "application/json",
              );
            },
            uploadVideo: async (path) => {
              const stat = await fsPromises.stat(path);
              console.log("[media-downloader] upload video start", {
                jobId,
                path,
                bytes: stat.size,
                outputVideoKey,
                videoPutUrl: maskUrl(outputVideoPutUrl),
              });
              const buf = readFileSync(path);
              try {
                await uploadArtifact(outputVideoPutUrl, buf, "video/mp4");
                console.log("[media-downloader] upload video success", {
                  jobId,
                  bytes: buf.length,
                  outputVideoKey,
                });
              } catch (err) {
                console.error("[media-downloader] upload video failed", {
                  jobId,
                  outputVideoKey,
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
                outputAudioKey,
                audioPutUrl: maskUrl(outputAudioPutUrl),
              });
              const buf = readFileSync(path);
              try {
                await uploadArtifact(outputAudioPutUrl, buf, "audio/mpeg");
                console.log("[media-downloader] upload audio success", {
                  jobId,
                  bytes: buf.length,
                  outputAudioKey,
                });
              } catch (err) {
                console.error("[media-downloader] upload audio failed", {
                  jobId,
                  outputAudioKey,
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
      const outputs = {
        video: { key: outputVideoKey },
      };
      if (outputAudioKey) outputs.audio = { key: outputAudioKey };
      if (outputMetadataKey && pipelineRes?.rawMetadata != null)
        outputs.metadata = { key: outputMetadataKey };
      await postUpdate("completed", {
        phase: "completed",
        progress: 1,
        outputKey: outputVideoKey,
        outputAudioKey,
        outputMetadataKey,
        outputs,
        metadata: {
          ...finalMetadata,
          quality,
          source: engineOptions.source || "youtube",
        },
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
      unlinkSync(audioPath);
    } catch {}
    try {
      // cleanup comments dir
      await fsPromises.rm(commentsDir, { recursive: true, force: true });
    } catch {}
  }
}

startJsonServer(PORT, handleRender, 'media-downloader');
