import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { logger } from "~/lib/logger";

export const SUPPORTED_PROXY_PROTOCOLS = [
  "http",
  "https",
  "socks4",
  "socks5",
  "trojan",
  "vless",
  "hysteria2",
] as const;
export type ProxyProtocol = (typeof SUPPORTED_PROXY_PROTOCOLS)[number];
export const ProxyProtocolEnum = z.enum(SUPPORTED_PROXY_PROTOCOLS);

const NODE_SCHEME_PREFIXES = {
  ssr: ["ssr://"],
  trojan: ["trojan://"],
  vless: ["vless://"],
  hysteria2: ["hysteria2://", "hy2://"],
} as const;

type ProxyNodeScheme = keyof typeof NODE_SCHEME_PREFIXES;

export interface ParsedProxy {
  id: string;
  name?: string;
  server: string;
  port: number;
  protocol: ProxyProtocol;
  username?: string;
  password?: string;
  // Preserve the original subscription node string so downstream logic can bootstrap protocol-specific clients.
  nodeUrl?: string;
}

// SSR URL scheme: ssr://server:port:protocol:method:obfs:base64(password)/?remarks=base64(remarks)&protoparam=...
const SSR_PAYLOAD_REGEX =
  /^([^:]+):(\d+):([^:]+):([^:]*):([^:]*):([^/]+)(?:\/\?(.*))?$/;

export async function parseSSRUrl(ssrUrl: string): Promise<ParsedProxy[]> {
  try {
    if (!ssrUrl.startsWith("ssr://")) {
      throw new Error("Invalid SSR URL format");
    }

    const encodedPayload = ssrUrl.slice("ssr://".length);
    const normalizedPayload = normalizeBase64(encodedPayload);
    const decodedPayload = Buffer.from(normalizedPayload, "base64")
      .toString("utf-8")
      .trim();

    const match = decodedPayload.match(SSR_PAYLOAD_REGEX);
    if (!match) {
      throw new Error("Failed to parse SSR URL payload");
    }

    const [, server, port, protocol, , , passwordBase64, params] = match;

    // Decode password
    const password = Buffer.from(passwordBase64, "base64").toString("utf-8");

    // Parse parameters
    const urlParams = new URLSearchParams(params ?? "");
    const remarksBase64 = urlParams.get("remarks");
    const remarks = remarksBase64
      ? Buffer.from(remarksBase64, "base64").toString("utf-8")
      : undefined;

    // Map SSR protocol to standard proxy protocol
    const proxyProtocol = mapSSRProtocolToProxy(protocol);

    return [
      {
        id: createId(),
        name: remarks || `${server}:${port}`,
        server,
        port: parseInt(port, 10),
        protocol: proxyProtocol,
        password,
        nodeUrl: ssrUrl, // preserve for identification/testing logic
      },
    ];
  } catch (error) {
    logger.error("proxy", `Error parsing SSR URL: ${error}`);
    throw new Error(
      `Failed to parse SSR URL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

// ---------- Shared helpers for node URL parsing ----------
function extractRemarkFromUrl(url: URL, fallbackPort: number): string {
  const port = parsePortNumber(url.port, fallbackPort);
  return (
    decodeLabel(url.hash) ||
    safeDecode(url.searchParams.get("remarks")) ||
    safeDecode(url.searchParams.get("remark")) ||
    `${url.hostname}:${port}`
  );
}

type AuthMode = "trojan" | "default";
function parseAuthFromUrl(url: URL, mode: AuthMode): {
  username?: string;
  password?: string;
} {
  const user = safeDecode(url.username);
  const pass = safeDecode(url.password);
  if (mode === "trojan") {
    // For trojan links: when only username is present, it's actually the password
    if (pass) {
      return { username: user, password: pass };
    }
    if (user) {
      return { password: user };
    }
    return {};
  }
  return { username: user, password: pass };
}

function buildParsedProxy(
  url: URL,
  protocol: ProxyProtocol,
  nodeUrl: string,
  defaultPort: number,
  authMode: AuthMode = "default",
): ParsedProxy {
  const port = parsePortNumber(url.port, defaultPort);
  const name = extractRemarkFromUrl(url, defaultPort);
  const { username, password } = parseAuthFromUrl(url, authMode);
  return {
    id: createId(),
    name,
    server: url.hostname,
    port,
    protocol,
    username,
    password,
    nodeUrl,
  };
}

function parseTrojanUrl(trojanUrl: string): ParsedProxy {
  try {
    const url = new URL(trojanUrl);
    if (!url.hostname) throw new Error("Missing hostname");
    return buildParsedProxy(url, "trojan", trojanUrl, 443, "trojan");
  } catch (error) {
    throw new Error(
      `Failed to parse trojan URL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

function parseVlessUrl(vlessUrl: string): ParsedProxy {
  try {
    const url = new URL(vlessUrl);
    if (!url.hostname) throw new Error("Missing hostname");
    return buildParsedProxy(url, "vless", vlessUrl, 443, "default");
  } catch (error) {
    throw new Error(
      `Failed to parse vless URL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

function parseHysteria2Url(hysteriaUrl: string): ParsedProxy {
  try {
    const normalizedUrl = hysteriaUrl.startsWith("hy2://")
      ? `hysteria2://${hysteriaUrl.slice("hy2://".length)}`
      : hysteriaUrl;
    const url = new URL(normalizedUrl);
    if (!url.hostname) throw new Error("Missing hostname");
    return buildParsedProxy(url, "hysteria2", hysteriaUrl, 443, "default");
  } catch (error) {
    throw new Error(
      `Failed to parse hysteria2 URL: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

function normalizeBase64(input: string): string {
  const normalized = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/\s+/g, "");
  const padding = normalized.length % 4;
  if (padding === 0) {
    return normalized;
  }

  return normalized.padEnd(normalized.length + (4 - padding), "=");
}

function mapSSRProtocolToProxy(ssrProtocol: string): ProxyProtocol {
  switch (ssrProtocol) {
    case "origin":
    case "auth_sha1_v4":
    case "auth_aes128_md5":
    case "auth_aes128_sha1":
      return "socks5";
    default:
      return "socks5";
  }
}

function parsePortNumber(port: string, fallback: number): number {
  if (!port) {
    return fallback;
  }

  const parsed = Number.parseInt(port, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function safeDecode(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeLabel(hash: string): string | undefined {
  if (!hash) return undefined;
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  return safeDecode(value);
}

function getNodeScheme(value: string): ProxyNodeScheme | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  for (const [scheme, prefixes] of Object.entries(NODE_SCHEME_PREFIXES) as [
    ProxyNodeScheme,
    readonly string[],
  ][]) {
    if (prefixes.some((prefix) => lower.startsWith(prefix))) {
      return scheme;
    }
  }
  return null;
}

function containsSupportedScheme(content: string): boolean {
  const lower = content.toLowerCase();
  const values = Object.values(
    NODE_SCHEME_PREFIXES,
  ) as unknown as ReadonlyArray<ReadonlyArray<string>>;
  return values.some((prefixes) =>
    prefixes.some((prefix) => lower.includes(prefix)),
  );
}

function startsWithSupportedScheme(line: string): boolean {
  return getNodeScheme(line) !== null;
}

function decodeLineCandidate(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return "";
  }

  if (startsWithSupportedScheme(trimmed)) {
    return trimmed;
  }

  const nestedCandidate = trimmed.replace(/\s+/g, "");
  if (!nestedCandidate) {
    return "";
  }

  try {
    const nestedDecoded = Buffer.from(
      normalizeBase64(nestedCandidate),
      "base64",
    )
      .toString("utf-8")
      .trim();
    return startsWithSupportedScheme(nestedDecoded) ? nestedDecoded : "";
  } catch {
    return "";
  }
}

// For parsing subscription URLs that return multiple proxy configs
function parseClashSubscription(rawContent: string): ParsedProxy[] {
  const proxiesBlock = extractClashProxiesBlock(rawContent);
  if (!proxiesBlock) {
    return [];
  }

  const entries = splitClashProxyEntries(proxiesBlock);
  const proxies: ParsedProxy[] = [];

  for (const entry of entries) {
    const raw = parseClashProxyEntry(entry);
    if (!raw) continue;

    const parsed = convertClashProxy(raw);
    if (parsed) {
      proxies.push(parsed);
    }
  }

  return proxies;
}

function extractClashProxiesBlock(content: string): string | null {
  const lines = content.split(/\r?\n/);
  let inside = false;
  let baseIndent: number | null = null;
  const collected: string[] = [];

  for (const line of lines) {
    if (!inside) {
      if (/^\s*proxies:\s*$/i.test(line)) {
        inside = true;
      }
      continue;
    }

    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    if (trimmed === "" || trimmed.startsWith("#")) {
      collected.push(line);
      continue;
    }

    if (baseIndent === null) {
      baseIndent = indent;
    }

    if (indent < baseIndent) {
      break;
    }

    collected.push(line);
  }

  const hasEntries = collected.some((line) => line.trim().startsWith("- "));
  return hasEntries ? collected.join("\n") : null;
}

function splitClashProxyEntries(block: string): string[] {
  const lines = block.split(/\r?\n/);
  const entries: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current.length) {
        current.push("");
      }
      continue;
    }

    if (trimmed.startsWith("- ")) {
      if (current.length) {
        entries.push(current.join("\n"));
      }
      current = [trimmed];
    } else if (current.length) {
      current.push(trimmed);
    }
  }

  if (current.length) {
    entries.push(current.join("\n"));
  }

  return entries;
}

type ClashProxyRaw = Record<string, unknown>;

function parseClashProxyEntry(entry: string): ClashProxyRaw | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("- {") && trimmed.endsWith("}")) {
    const inner = trimmed.slice(3, -1);
    return parseInlineClashMapping(inner);
  }

  const lines = entry.split(/\r?\n/);
  const result: ClashProxyRaw = {};

  for (const line of lines) {
    let normalized = line.trim();
    if (!normalized) continue;

    if (normalized.startsWith("- ")) {
      normalized = normalized.slice(2).trim();
    }

    const colonIndex = normalized.indexOf(":");
    if (colonIndex === -1) continue;

    const key = normalized.slice(0, colonIndex).trim();
    const rawValue = normalized.slice(colonIndex + 1).trim();

    if (!key) continue;
    if (!rawValue) continue;

    result[key] = parseClashScalar(rawValue);
  }

  return Object.keys(result).length ? result : null;
}

function parseInlineClashMapping(content: string): ClashProxyRaw {
  const result: ClashProxyRaw = {};
  let buffer = "";
  let quote: '"' | "'" | null = null;
  let escape = false;

  const flush = () => {
    const segment = buffer.trim();
    if (!segment) {
      buffer = "";
      return;
    }

    const colonIndex = segment.indexOf(":");
    if (colonIndex === -1) {
      buffer = "";
      return;
    }

    const key = segment.slice(0, colonIndex).trim();
    const rawValue = segment.slice(colonIndex + 1).trim();
    if (key) {
      result[key] = parseClashScalar(rawValue);
    }
    buffer = "";
  };

  for (const char of content) {
    if (escape) {
      buffer += char;
      escape = false;
      continue;
    }

    if (char === "\\") {
      buffer += char;
      escape = true;
      continue;
    }

    if (char === '"' || char === "'") {
      if (quote === char) {
        quote = null;
      } else if (!quote) {
        quote = char;
      }
      buffer += char;
      continue;
    }

    if (char === "," && !quote) {
      flush();
      continue;
    }

    buffer += char;
  }

  flush();

  return result;
}

function parseClashScalar(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const firstChar = trimmed[0];
  const lastChar = trimmed[trimmed.length - 1];

  if (
    (firstChar === '"' && lastChar === '"') ||
    (firstChar === "'" && lastChar === "'")
  ) {
    const inner = trimmed.slice(1, -1);
    return firstChar === '"'
      ? inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
      : inner.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  }

  const lower = trimmed.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (lower === "null" || lower === "~") return undefined;

  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric)) {
    return numeric;
  }

  return trimmed;
}

function toClashString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function toClashNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function toClashBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    if (["true", "yes", "on", "1"].includes(normalized)) return true;
    if (["false", "no", "off", "0"].includes(normalized)) return false;
  }
  return undefined;
}

function toClashStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const mapped = value
      .map((item) => toClashString(item))
      .filter((item): item is string => Boolean(item));
    return mapped.length ? mapped : undefined;
  }
  const single = toClashString(value);
  if (!single) return undefined;
  const segments = single
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.length ? segments : undefined;
}

function ensureLeadingSlashPath(path: string): string {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function mapClashTypeToProxyProtocol(
  typeValue: string | undefined,
): ProxyProtocol | null {
  if (!typeValue) return null;
  const normalized = typeValue.toLowerCase();
  switch (normalized) {
    case "trojan":
      return "trojan";
    case "vless":
      return "vless";
    case "hysteria2":
    case "hy2":
      return "hysteria2";
    case "http":
      return "http";
    case "https":
      return "https";
    case "socks":
    case "socks5":
      return "socks5";
    case "socks4":
      return "socks4";
    default:
      return null;
  }
}

function convertClashProxy(raw: ClashProxyRaw): ParsedProxy | null {
  const typeValue = toClashString(raw.type ?? raw.protocol);
  const protocol = mapClashTypeToProxyProtocol(typeValue);
  if (!protocol) return null;

  const server = toClashString(raw.server ?? raw.address ?? raw.host);
  if (!server) return null;

  const port = toClashNumber(raw.port ?? raw.server_port ?? raw.remote_port);
  if (!port) return null;

  const name =
    toClashString(raw.name ?? raw.remark ?? raw.remarks ?? raw.title) ??
    `${server}:${port}`;

  let username: string | undefined;
  let password: string | undefined;

  const skipCertVerify = toClashBoolean(
    raw["skip-cert-verify"] ?? raw.skip_cert_verify ?? raw.insecure,
  );
  const sni =
    toClashString(
      raw.sni ??
        raw.peer ??
        raw["server-name"] ??
        raw.servername ??
        raw.server_name,
    ) ?? (undefined as string | undefined);
  const network = toClashString(raw.network ?? raw.type ?? raw["network-type"]);
  const alpn = toClashStringArray(raw.alpn ?? raw.ALPNS);
  const mux = toClashBoolean(raw.mux);
  const wsPath = toClashString(raw.path ?? raw["ws-path"] ?? raw["ws_path"]);
  const hostHeader = toClashString(
    raw.host_header ?? raw.host ?? raw.authority,
  );
  const grpcServiceName = toClashString(
    raw["grpc-service-name"] ?? raw["service-name"] ?? raw["grpc_service_name"],
  );
  const grpcMode = toClashString(raw["grpc-mode"] ?? raw["mode"]);

  switch (protocol) {
    case "trojan":
      username = toClashString(raw.username ?? raw.user);
      password = toClashString(
        raw.password ?? raw.pass ?? raw.psk ?? raw.token ?? raw.uuid ?? raw.id,
      );
      break;
    case "vless":
      username = toClashString(raw.uuid ?? raw.id ?? raw.user ?? raw.username);
      password = toClashString(
        raw.password ?? raw.pass ?? raw.psk ?? raw.token ?? raw.auth,
      );
      break;
    case "hysteria2":
      username = toClashString(
        raw.username ?? raw.user ?? raw.auth ?? raw.token,
      );
      password = toClashString(
        raw.password ?? raw.pass ?? raw.psk ?? raw.auth ?? raw.token,
      );
      break;
    case "http":
    case "https":
    case "socks5":
    case "socks4":
      username = toClashString(raw.username ?? raw.user);
      password = toClashString(
        raw.password ?? raw.pass ?? raw.psk ?? raw.token ?? raw.auth,
      );
      break;
    default:
      username = toClashString(raw.username ?? raw.user);
      password = toClashString(
        raw.password ?? raw.pass ?? raw.psk ?? raw.token ?? raw.auth,
      );
  }

  let nodeUrl: string | undefined;

  if (protocol === "trojan" && password) {
    const params = new URLSearchParams();
    if (skipCertVerify !== undefined) {
      params.set("allowInsecure", skipCertVerify ? "1" : "0");
    }
    if (sni) {
      params.set("sni", sni);
      params.set("peer", sni);
    }
    if (alpn?.length) {
      params.set("alpn", alpn.join(","));
    }
    if (network && network.toLowerCase() !== "tcp") {
      params.set("type", network.toLowerCase());
    }
    if (network && network.toLowerCase() === "ws") {
      if (wsPath) params.set("path", ensureLeadingSlashPath(wsPath));
      if (hostHeader) params.set("host", hostHeader);
    }
    if (network && network.toLowerCase() === "grpc") {
      if (grpcServiceName) params.set("serviceName", grpcServiceName);
      if (grpcMode) params.set("mode", grpcMode);
    }
    if (mux !== undefined) {
      params.set("mux", mux ? "1" : "0");
    }

    const credential = username
      ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}`
      : encodeURIComponent(password);
    const query = params.toString();

    nodeUrl = `trojan://${credential}@${server}:${port}${query ? `?${query}` : ""}#${encodeURIComponent(name)}`;
  }

  return {
    id: createId(),
    name,
    server,
    port,
    protocol,
    username,
    password,
    nodeUrl,
  };
}

export async function parseSSRSubscription(
  subscriptionUrl: string,
): Promise<ParsedProxy[]> {
  try {
    const response = await fetch(subscriptionUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();
    const clashProxies = parseClashSubscription(content);
    if (clashProxies.length) {
      return clashProxies;
    }

    const normalizedContent = normalizeSubscriptionPayload(content);
    if (normalizedContent !== content) {
      const normalizedClashProxies = parseClashSubscription(normalizedContent);
      if (normalizedClashProxies.length) {
        return normalizedClashProxies;
      }
    }

    const proxies: ParsedProxy[] = [];

    const lines = normalizedContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const scheme = getNodeScheme(line);
      if (!scheme) continue;

      try {
        switch (scheme) {
          case "ssr": {
            const parsed = await parseSSRUrl(line);
            proxies.push(...parsed);
            break;
          }
          case "trojan": {
            proxies.push(parseTrojanUrl(line));
            break;
          }
          case "vless": {
            proxies.push(parseVlessUrl(line));
            break;
          }
          case "hysteria2": {
            proxies.push(parseHysteria2Url(line));
            break;
          }
          default:
            break;
        }
      } catch (error) {
        logger.warn(
          "proxy",
          `Failed to parse ${scheme.toUpperCase()} node "${line.slice(0, 32)}…": ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    return proxies;
  } catch (error) {
    logger.error("proxy", `Error fetching SSR subscription: ${error}`);
    throw new Error(
      `Failed to fetch SSR subscription: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

function normalizeSubscriptionPayload(rawContent: string): string {
  const trimmedContent = rawContent.trim();
  if (!trimmedContent) {
    return "";
  }

  if (containsSupportedScheme(trimmedContent)) {
    return trimmedContent;
  }

  const decodedLinesFromOriginal = trimmedContent
    .split(/\r?\n/)
    .map((line) => decodeLineCandidate(line))
    .filter(Boolean);
  if (decodedLinesFromOriginal.length) {
    return decodedLinesFromOriginal.join("\n");
  }

  const base64Candidate = trimmedContent.replace(/\s+/g, "");
  if (!base64Candidate) {
    return trimmedContent;
  }

  try {
    const decoded = Buffer.from(normalizeBase64(base64Candidate), "base64")
      .toString("utf-8")
      .trim();
    if (containsSupportedScheme(decoded)) {
      return decoded;
    }

    const decodedLines = decoded
      .split(/\r?\n/)
      .map((line) => decodeLineCandidate(line))
      .filter(Boolean);

    if (decodedLines.length) {
      return decodedLines.join("\n");
    }
  } catch (error) {
    logger.warn(
      "proxy",
      `Failed to base64-decode subscription payload: ${error instanceof Error ? error.message : error}`,
    );
  }

  return trimmedContent;
}

// Validation schemas
export const ProxyNodeUrlSchema = z
  .string()
  .trim()
  .refine((value) => startsWithSupportedScheme(value), {
    message: "Unsupported proxy URL scheme",
  });
