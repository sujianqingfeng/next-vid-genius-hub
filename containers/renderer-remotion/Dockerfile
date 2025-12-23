# Use DaoCloud mirror by default; override with BASE_NODE_IMAGE if needed
ARG BASE_NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim
FROM ${BASE_NODE_IMAGE} AS base

ARG MIHOMO_VERSION=1.18.10
ARG MIHOMO_PLATFORM=linux-amd64-compatible
ARG DEBIAN_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/debian
ARG DEBIAN_SECURITY_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/debian-security
ARG NPM_REGISTRY=https://registry.npmmirror.com

# Install system dependencies: ffmpeg, fontconfig, CJK fonts, Chromium deps
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates; \
    release="$(awk -F= '/^VERSION_CODENAME=/{print $2}' /etc/os-release)"; \
    if [ "$release" = "bookworm" ] || [ "$release" = "trixie" ]; then \
      components="main contrib non-free non-free-firmware"; \
    else \
      components="main contrib non-free"; \
    fi; \
    printf 'deb %s %s %s\n' "${DEBIAN_MIRROR}" "${release}" "${components}" > /etc/apt/sources.list; \
    printf 'deb %s %s-updates %s\n' "${DEBIAN_MIRROR}" "${release}" "${components}" >> /etc/apt/sources.list; \
    printf 'deb %s %s-backports %s\n' "${DEBIAN_MIRROR}" "${release}" "${components}" >> /etc/apt/sources.list; \
    printf 'deb %s %s-security %s\n' "${DEBIAN_SECURITY_MIRROR}" "${release}" "${components}" >> /etc/apt/sources.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ffmpeg fontconfig fonts-noto-cjk fonts-dejavu-core \
      curl gzip unzip \
      libnss3 libxss1 libasound2 libx11-6 libx11-xcb1 libxcomposite1 \
      libxdamage1 libxrandr2 libxtst6 libgtk-3-0 libgbm1; \
    fc-cache -f; \
    rm -rf /var/lib/apt/lists/*

RUN curl -fL -o /tmp/mihomo.gz "https://github.com/MetaCubeX/mihomo/releases/download/v${MIHOMO_VERSION}/mihomo-${MIHOMO_PLATFORM}-v${MIHOMO_VERSION}.gz" \
  && gunzip /tmp/mihomo.gz \
  && mv /tmp/mihomo /usr/local/bin/mihomo \
  && chmod +x /usr/local/bin/mihomo

WORKDIR /app

# ---- builder: build local @app/* packages (dist/ not committed) ----
FROM base AS builder

# Install minimal deps first for better layer caching
# When building with context at repo root, copy the container's manifest
COPY tsconfig.json ./tsconfig.json
COPY tsconfig.base.json ./tsconfig.base.json
COPY tsconfig.packages.json ./tsconfig.packages.json
COPY containers/renderer-remotion/package.json ./package.json
# Bring in local workspace package for installation via file: dependency
COPY packages/media-comments ./packages/media-comments
COPY packages/media-core ./packages/media-core
COPY packages/job-callbacks ./packages/job-callbacks
RUN npm config set registry ${NPM_REGISTRY}
RUN npm i
RUN npm install --no-save tsdown typescript
RUN npm --prefix packages/media-comments run build
RUN npm --prefix packages/media-core run build

RUN mkdir -p /app/clash /app/clash/providers

# ---- runtime ----
FROM base AS runtime

COPY containers/renderer-remotion/package.json ./package.json
COPY --from=builder /app/packages/media-comments ./packages/media-comments
COPY --from=builder /app/packages/media-core ./packages/media-core
COPY packages/job-callbacks ./packages/job-callbacks
RUN npm config set registry ${NPM_REGISTRY}
RUN npm i --omit=dev

RUN mkdir -p /app/clash /app/clash/providers

# Copy runtime files
COPY containers/renderer-remotion/index.mjs ./index.mjs
COPY containers/shared.mjs ./shared.mjs
# Copy Remotion project (from repo root)
COPY packages/remotion-project/remotion ./remotion
COPY apps/web/public ./public

# Pre-download headless browser at build time to avoid runtime download
ENV XDG_CACHE_HOME=/opt/.cache \
    PUPPETEER_CACHE_DIR=/opt/.cache/puppeteer \
    REMOTION_BROWSER_DOWNLOADS_DIR=/opt/remotion-browser
RUN set -eux; \
  mkdir -p "$XDG_CACHE_HOME" "$PUPPETEER_CACHE_DIR" "$REMOTION_BROWSER_DOWNLOADS_DIR"; \
  arch="$(node -p 'process.arch')"; \
  platform="linux64"; \
  if [ "$arch" = "arm64" ]; then platform="linux-arm64"; fi; \
  if [ "$platform" = "linux-arm64" ]; then \
    version="$(node -e 'const fs=require("node:fs");const path=require("node:path");const pkg=require.resolve("@remotion/renderer/package.json");const p=path.join(path.dirname(pkg),"dist/esm/index.mjs");const txt=fs.readFileSync(p,"utf8");const m=txt.match(/var PLAYWRIGHT_VERSION = "([0-9]+)"/);if(!m) throw new Error("PLAYWRIGHT_VERSION not found");process.stdout.write(m[1]);')"; \
    url="https://cdn.npmmirror.com/binaries/playwright/builds/chromium/${version}/chromium-headless-shell-linux-arm64.zip"; \
    dest="/app/node_modules/.remotion/chrome-headless-shell/${platform}"; \
    if [ -x "$dest/chrome-headless-shell-${platform}/headless_shell" ]; then \
      echo "Remotion browser already present at $dest"; \
      exit 0; \
    fi; \
    tmp="$(mktemp -d)"; \
    curl -L --fail --retry 10 --retry-delay 2 --connect-timeout 10 --max-time 1800 -o "$tmp/chrome.zip" "$url"; \
    mkdir -p "$dest"; \
    unzip -q "$tmp/chrome.zip" -d "$dest"; \
    rm -rf "$tmp"; \
    if [ -d "$dest/chrome-linux" ]; then mv "$dest/chrome-linux" "$dest/chrome-headless-shell-${platform}"; fi; \
    chmod +x "$dest/chrome-headless-shell-${platform}/headless_shell"; \
    echo "Has browser at $dest/chrome-headless-shell-${platform}/headless_shell"; \
  else \
    npm exec -- remotion browser ensure --log=verbose; \
  fi

EXPOSE 8190
CMD ["node", "index.mjs"]
