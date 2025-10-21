import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
// crypto not needed after moving to shared callback utils
import { spawn } from "node:child_process";
import net from "node:net";
import { readFileSync, unlinkSync } from "node:fs";
import { promises as fsPromises } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import YAML from "yaml";
import { makeStatusCallback } from "@app/callback-utils";
// Compose pipelines via shared @app/media-* packages
// Compose pipelines with shared adapters from the monorepo packages
import {
  downloadVideo as coreDownloadVideo,
  extractAudio as coreExtractAudio,
} from "@app/media-node";
import {
  summariseMetadata,
  resolveForwardProxy as resolveForwardProxyCore,
} from "@app/media-core";
import {
  downloadYoutubeComments as providerDownloadYoutubeComments,
  downloadTikTokCommentsByUrl as providerDownloadTikTokComments,
} from "@app/media-providers";

const PORT = process.env.PORT || 8080;
const CALLBACK_SECRET = process.env.JOB_CALLBACK_HMAC_SECRET || "dev-secret";
const MIHOMO_BIN = process.env.MIHOMO_BIN || "/usr/local/bin/mihomo";
const MIHOMO_CONFIG_DIR = process.env.MIHOMO_CONFIG_DIR || "/app/clash";
const MIHOMO_PROVIDER_DIR = join(MIHOMO_CONFIG_DIR, "providers");
const MIHOMO_PORT = Number.parseInt(process.env.MIHOMO_PORT || "7890", 10);
const MIHOMO_SOCKS_PORT = Number.parseInt(
  process.env.MIHOMO_SOCKS_PORT || "7891",
  10,
);
const CLASH_MODE = process.env.CLASH_MODE || "Rule";
const CLASH_SUBSCRIPTION_URL = process.env.CLASH_SUBSCRIPTION_URL?.trim();
const CLASH_RAW_CONFIG = process.env.CLASH_RAW_CONFIG;

function parseBooleanFlag(value) {
  if (value === null || value === undefined) return undefined;
  const normalized = value.toString().trim().toLowerCase();
  if (!normalized) return undefined;
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function ensureLeadingSlash(path) {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function parseNumber(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

async function ensureDirExists(dir) {
  try {
    await fsPromises.mkdir(dir, { recursive: true });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

function decodeBase64Url(input = "") {
  let normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  if (pad === 2) normalized += "==";
  else if (pad === 3) normalized += "=";
  else if (pad !== 0) normalized += "==";
  return Buffer.from(normalized, "base64").toString("utf8");
}

function parseSsrUrl(ssrUrl) {
  if (!ssrUrl || !ssrUrl.startsWith("ssr://")) return null;
  try {
    const decoded = decodeBase64Url(ssrUrl.slice(6));
    const [main, paramSegment] = decoded.split("/?");
    const [server, port, protocol, method, obfs, passwordEncoded] =
      main.split(":");
    const password = decodeBase64Url(passwordEncoded);
    const params = {};
    if (paramSegment) {
      for (const segment of paramSegment.split("&")) {
        if (!segment) continue;
        const [key, value = ""] = segment.split("=");
        params[key] = value ? decodeBase64Url(value) : "";
      }
    }

    return {
      server,
      port: Number.parseInt(port, 10),
      protocol,
      method,
      obfs,
      password,
      obfsParam: params.obfsparam,
      protocolParam: params.protoparam,
      remarks: params.remarks,
      group: params.group,
    };
  } catch (error) {
    console.error("[media-downloader] Failed to parse SSR URL", error);
    return null;
  }
}

function createClashProxyFromDb(proxy) {
  if (!proxy) return null;
  const baseName = proxy.name || proxy.server || "remote-node";

  const nodeUrl = proxy.nodeUrl;
  if (nodeUrl && nodeUrl.startsWith("ssr://")) {
    const parsed = parseSsrUrl(nodeUrl);
    if (!parsed) return null;
    return {
      name: baseName,
      type: "ssr",
      server: parsed.server,
      port: parsed.port,
      cipher: parsed.method,
      password: parsed.password,
      protocol: parsed.protocol,
      "protocol-param": parsed.protocolParam,
      obfs: parsed.obfs,
      "obfs-param": parsed.obfsParam,
      "udp-relay": true,
      "skip-cert-verify": true,
    };
  }

  if (nodeUrl && /^trojan:\/\//i.test(nodeUrl)) {
    try {
      const url = new URL(nodeUrl);
      const params = url.searchParams;
      const password = decodeURIComponent(url.password || url.username || "");
      const finalPassword = password || proxy.password || proxy.username;
      if (!finalPassword) {
        console.warn(
          "[media-downloader] Trojan node missing password, skipping",
          baseName,
        );
        return null;
      }

      const sni =
        params.get("sni") ||
        params.get("peer") ||
        params.get("host") ||
        url.hostname;
      const allowInsecure =
        parseBooleanFlag(
          params.get("allowinsecure") ||
            params.get("allowInsecure") ||
            params.get("insecure"),
        ) ?? true;
      const alpnParam = params.get("alpn");
      const alpn = alpnParam
        ? alpnParam
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        : undefined;
      const network = (
        params.get("type") ||
        params.get("network") ||
        ""
      ).toLowerCase();
      const mux = parseBooleanFlag(params.get("mux"));

      const proxyConfig = {
        name: baseName,
        type: "trojan",
        server: url.hostname,
        port: parseNumber(url.port, 443),
        password: finalPassword,
        udp: true,
        "skip-cert-verify": allowInsecure,
      };

      if (sni) proxyConfig.sni = sni;
      if (alpn?.length) proxyConfig.alpn = alpn;
      if (mux !== undefined) proxyConfig.mux = mux;

      if (network === "ws" || network === "websocket") {
        proxyConfig.network = "ws";
        const wsOpts = {};
        const path = params.get("path");
        const host = params.get("host") || params.get("authority") || sni;
        if (path) wsOpts.path = ensureLeadingSlash(path);
        if (host) wsOpts.headers = { Host: host };
        if (Object.keys(wsOpts).length) proxyConfig["ws-opts"] = wsOpts;
      } else if (network === "grpc") {
        proxyConfig.network = "grpc";
        const grpcOpts = {};
        const serviceName =
          params.get("servicename") || params.get("serviceName");
        const mode = params.get("mode");
        if (serviceName) grpcOpts["grpc-service-name"] = serviceName;
        if (mode) grpcOpts["grpc-mode"] = mode;
        if (Object.keys(grpcOpts).length) proxyConfig["grpc-opts"] = grpcOpts;
      }

      return proxyConfig;
    } catch (error) {
      console.error("[media-downloader] Failed to parse Trojan node", error);
      return null;
    }
  }

  if (nodeUrl && /^vless:\/\//i.test(nodeUrl)) {
    try {
      const url = new URL(nodeUrl);
      const params = url.searchParams;
      const uuid = decodeURIComponent(url.username || "");
      if (!uuid) {
        console.warn(
          "[media-downloader] VLESS node missing UUID, skipping",
          baseName,
        );
        return null;
      }

      const security = (params.get("security") || "").toLowerCase();
      const network = (
        params.get("type") ||
        params.get("network") ||
        "tcp"
      ).toLowerCase();
      const sni = params.get("sni") || params.get("host") || url.hostname;
      const fingerprint = params.get("fp") || params.get("fingerprint");
      const flow = params.get("flow");
      const alpnParam = params.get("alpn");
      const alpn = alpnParam
        ? alpnParam
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        : undefined;
      const allowInsecure = parseBooleanFlag(
        params.get("allowinsecure") ||
          params.get("allowInsecure") ||
          params.get("insecure"),
      );
      const encryption = params.get("encryption");

      const proxyConfig = {
        name: baseName,
        type: "vless",
        server: url.hostname,
        port: parseNumber(
          url.port,
          security === "tls" || security === "reality" ? 443 : 80,
        ),
        uuid,
        udp: true,
        "skip-cert-verify": allowInsecure ?? true,
      };

      if (fingerprint) proxyConfig["client-fingerprint"] = fingerprint;
      if (flow) proxyConfig.flow = flow;
      if (alpn?.length) proxyConfig.alpn = alpn;
      if (encryption && encryption !== "none")
        proxyConfig["packet-encoding"] = encryption;

      if (security === "tls" || security === "reality") {
        proxyConfig.tls = true;
        proxyConfig.servername = sni;
        if (security === "reality") {
          const realityOpts = {};
          const publicKey =
            params.get("pbk") ||
            params.get("publickey") ||
            params.get("public-key");
          const shortId =
            params.get("sid") ||
            params.get("shortid") ||
            params.get("short-id");
          const spiderX =
            params.get("spx") ||
            params.get("spiderx") ||
            params.get("spider-x");
          if (publicKey) realityOpts["public-key"] = publicKey;
          if (shortId) realityOpts["short-id"] = shortId;
          if (spiderX) realityOpts["spider-x"] = spiderX;
          if (Object.keys(realityOpts).length)
            proxyConfig["reality-opts"] = realityOpts;
        }
      } else if (sni) {
        proxyConfig.servername = sni;
      }

      if (network !== "tcp") {
        proxyConfig.network = network;
      }

      if (network === "ws") {
        const wsOpts = {};
        const wsPath = params.get("path");
        const hostHeader = params.get("host") || params.get("authority");
        const earlyData =
          params.get("ed") ||
          params.get("maxearlydata") ||
          params.get("earlydata");
        const earlyHeader =
          params.get("edh") ||
          params.get("earlydataheader") ||
          params.get("earlydataheadername");

        wsOpts.path = ensureLeadingSlash(wsPath || "/");
        const headers = {};
        if (hostHeader) headers.Host = hostHeader;
        if (Object.keys(headers).length) wsOpts.headers = headers;
        if (earlyData) {
          const earlyValue = Number.parseInt(earlyData, 10);
          if (!Number.isNaN(earlyValue)) wsOpts["max-early-data"] = earlyValue;
        }
        if (earlyHeader) wsOpts["early-data-header-name"] = earlyHeader;
        proxyConfig["ws-opts"] = wsOpts;
      } else if (network === "grpc") {
        const grpcOpts = {};
        const serviceName =
          params.get("servicename") || params.get("serviceName");
        const mode = params.get("mode");
        if (serviceName) grpcOpts["grpc-service-name"] = serviceName;
        if (mode) grpcOpts["grpc-mode"] = mode;
        if (Object.keys(grpcOpts).length) proxyConfig["grpc-opts"] = grpcOpts;
      } else if (network === "h2" || network === "http") {
        proxyConfig.network = "http";
        const httpOpts = {};
        const path = params.get("path");
        const host = params.get("host");
        if (path) {
          const normalizedPaths = path
            .split(",")
            .map((p) => ensureLeadingSlash(p.trim()))
            .filter(Boolean);
          if (normalizedPaths.length) httpOpts.path = normalizedPaths;
        }
        if (host) {
          httpOpts.headers = { Host: host };
        }
        if (Object.keys(httpOpts).length) proxyConfig["http-opts"] = httpOpts;
      }

      return proxyConfig;
    } catch (error) {
      console.error("[media-downloader] Failed to parse VLESS node", error);
      return null;
    }
  }

  if (proxy.server && proxy.port && proxy.protocol) {
    const port = Number.parseInt(proxy.port, 10);
    const sharedBase = {
      name: baseName,
      server: proxy.server,
      port,
      "udp-relay": true,
      "skip-cert-verify": true,
    };
    if (proxy.protocol === "http" || proxy.protocol === "https") {
      const httpProxy = {
        ...sharedBase,
        type: "http",
        tls: proxy.protocol === "https",
      };
      if (proxy.username && proxy.password) {
        httpProxy.username = proxy.username;
        httpProxy.password = proxy.password;
      }
      return httpProxy;
    }
    if (proxy.protocol === "socks4" || proxy.protocol === "socks5") {
      const socksProxy = {
        ...sharedBase,
        type: "socks5",
      };
      if (proxy.username && proxy.password) {
        socksProxy.username = proxy.username;
        socksProxy.password = proxy.password;
      }
      return socksProxy;
    }
    if (proxy.protocol === "trojan") {
      const finalPassword = proxy.password || proxy.username;
      if (!finalPassword) {
        console.warn(
          "[media-downloader] Trojan proxy missing password; cannot configure Clash",
          baseName,
        );
        return null;
      }
      const trojanBase = {
        name: baseName,
        type: "trojan",
        server: proxy.server,
        port,
        password: finalPassword,
        udp: true,
        "skip-cert-verify": true,
      };
      return trojanBase;
    }
  }
  return null;
}

function buildClashConfig(engineOptions = {}) {
  if (CLASH_RAW_CONFIG) {
    return CLASH_RAW_CONFIG;
  }

  const proxies = [];
  const providerGroups = [];
  const dbProxy = createClashProxyFromDb(engineOptions.proxy);
  if (dbProxy) proxies.push(dbProxy);

  const hasSubscription = Boolean(CLASH_SUBSCRIPTION_URL);

  if (!proxies.length && !hasSubscription) {
    const proxyDebug = engineOptions?.proxy
      ? {
          hasNodeUrl: Boolean(engineOptions.proxy.nodeUrl),
          protocol: engineOptions.proxy.protocol,
          server: engineOptions.proxy.server,
          port: engineOptions.proxy.port,
        }
      : null;
    console.log(
      "[media-downloader] skipping mihomo (no proxy config available)",
      {
        hasSubscription,
        proxyDebug,
      },
    );
    return null;
  }

  const config = {
    port: MIHOMO_PORT,
    "socks-port": MIHOMO_SOCKS_PORT,
    "allow-lan": true,
    mode: CLASH_MODE,
    "log-level": "info",
    ipv6: true,
    rules: ["MATCH,Proxy"],
  };

  if (proxies.length) {
    config.proxies = proxies;
  }

  const mainGroup = {
    name: "Proxy",
    type: "select",
    proxies: proxies.map((p) => p.name),
  };

  if (hasSubscription) {
    config["proxy-providers"] = {
      subscription: {
        type: "http",
        url: CLASH_SUBSCRIPTION_URL,
        path: "./providers/subscription.yaml",
        interval: 3600,
        healthcheck: {
          enable: true,
          url: "http://www.gstatic.com/generate_204",
          interval: 300,
        },
      },
    };
    providerGroups.push("subscription");
  }

  mainGroup.proxies.push("DIRECT");
  if (providerGroups.length) {
    mainGroup.use = providerGroups;
  }

  config["proxy-groups"] = [mainGroup];

  return YAML.stringify(config);
}

function waitForPort(
  port,
  host = "127.0.0.1",
  maxAttempts = 20,
  intervalMs = 500,
) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const attempt = () => {
      const socket = net.createConnection({ port, host }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", (error) => {
        socket.destroy();
        attempts += 1;
        if (attempts >= maxAttempts) {
          reject(
            new Error(
              `Clash proxy not ready on ${host}:${port}: ${error.message}`,
            ),
          );
        } else {
          setTimeout(attempt, intervalMs);
        }
      });
    };
    attempt();
  });
}

async function startMihomo(engineOptions) {
  const configText = buildClashConfig(engineOptions);
  if (!configText) return null;

  await ensureDirExists(MIHOMO_CONFIG_DIR);
  await ensureDirExists(MIHOMO_PROVIDER_DIR);

  const configPath = join(MIHOMO_CONFIG_DIR, "config.yaml");
  await fsPromises.writeFile(configPath, configText, "utf8");

  console.log("[media-downloader] starting mihomo", {
    configPath,
    port: MIHOMO_PORT,
    socksPort: MIHOMO_SOCKS_PORT,
    mode: CLASH_MODE,
  });

  let child;
  try {
    child = spawn(MIHOMO_BIN, ["-d", MIHOMO_CONFIG_DIR], {
      stdio: ["ignore", "inherit", "inherit"],
    });
  } catch (error) {
    console.error("[media-downloader] Failed to spawn mihomo", error);
    return null;
  }

  try {
    await waitForPort(MIHOMO_PORT);
    console.log("[media-downloader] mihomo ready", { httpPort: MIHOMO_PORT });
    return {
      proxyUrl: `http://127.0.0.1:${MIHOMO_PORT}`,
      async cleanup() {
        if (!child.killed) {
          child.kill("SIGTERM");
          await delay(200);
        }
      },
    };
  } catch (error) {
    child.kill("SIGTERM");
    console.error("[media-downloader] Clash proxy failed to start", error);
    return null;
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

// Legacy helpers removed in favor of shared callback utils

// Forward proxy resolution moved to @app/media-core

async function uploadArtifact(
  url,
  buffer,
  contentType = "application/octet-stream",
) {
  if (!url) return;
  const requestOptions = {
    method: "PUT",
    headers: {
      "content-type": contentType,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    },
    body: buffer,
  };
  const res = await fetch(url, requestOptions);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`upload failed: ${res.status} ${errorText}`);
  }
}

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

  const safeEngineOptions = {
    url: engineOptions?.url,
    quality: engineOptions?.quality,
    source: engineOptions?.source,
    hasDefaultProxy: Boolean(engineOptions?.defaultProxyUrl),
    proxy: engineOptions?.proxy
      ? {
          id: engineOptions.proxy.id,
          protocol: engineOptions.proxy.protocol,
          server: engineOptions.proxy.server,
          port: engineOptions.proxy.port,
          hasNodeUrl: Boolean(engineOptions.proxy.nodeUrl),
          hasCredentials: Boolean(
            engineOptions.proxy.username && engineOptions.proxy.password,
          ),
        }
      : null,
  };
  console.log("[media-downloader] received render request", {
    jobId,
    engineOptions: safeEngineOptions,
  });

  sendJson(res, 202, { jobId });

  const postUpdate = makeStatusCallback({
    callbackUrl,
    secret: CALLBACK_SECRET,
    baseFields: { jobId },
  });

  const url = engineOptions.url;
  const quality = engineOptions.quality || "1080p";
  const task = (engineOptions.task || "").toString().toLowerCase();
  const isCommentsOnly = task === "comments";

  if (
    !url ||
    (!isCommentsOnly && !outputVideoPutUrl) ||
    (isCommentsOnly && !outputMetadataPutUrl)
  ) {
    await postUpdate("failed", {
      error: isCommentsOnly
        ? "missing url or outputMetadataPutUrl"
        : "missing url or outputVideoPutUrl",
    });
    return;
  }

  let clashController = null;
  try {
    clashController = await startMihomo(engineOptions);
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

  const progress = async (phase, pct) => {
    const status = phase === "uploading" ? "uploading" : "running";
    await postUpdate(status, { phase, progress: pct });
  };

  try {
    await progress("preparing", 0.05);
    await delay(100);
    await progress("fetching_metadata", 0.1);

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
              const buf = readFileSync(path);
              await uploadArtifact(outputVideoPutUrl, buf, "video/mp4");
            },
            uploadAudio: async (path) => {
              if (!outputAudioPutUrl) return;
              const buf = readFileSync(path);
              await uploadArtifact(outputAudioPutUrl, buf, "audio/mpeg");
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === "POST" && url.pathname === "/render")
    return handleRender(req, res);
  sendJson(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`[media-downloader] listening on ${PORT}`);
});
