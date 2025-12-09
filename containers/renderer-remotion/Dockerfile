# Use DaoCloud mirror by default; override with BASE_NODE_IMAGE if needed
ARG BASE_NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim
FROM ${BASE_NODE_IMAGE}

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

# Install minimal deps first for better layer caching
# When building with context at repo root, copy the container's manifest
COPY containers/renderer-remotion/package.json ./package.json
# Bring in local workspace package for installation via file: dependency
COPY packages/media-comments ./packages/media-comments
COPY packages/media-core ./packages/media-core
COPY packages/job-callbacks ./packages/job-callbacks
RUN npm config set registry ${NPM_REGISTRY}
RUN npm i --omit=dev

RUN mkdir -p /app/clash /app/clash/providers

# Copy runtime files
COPY containers/renderer-remotion/index.mjs ./index.mjs
COPY containers/shared.mjs ./shared.mjs
# Copy Remotion project (from repo root)
COPY remotion ./remotion
COPY public ./public

# Pre-download headless browser at build time to avoid runtime download
ENV XDG_CACHE_HOME=/opt/.cache \
    PUPPETEER_CACHE_DIR=/opt/.cache/puppeteer \
    REMOTION_BROWSER_DOWNLOADS_DIR=/opt/remotion-browser
RUN mkdir -p "$XDG_CACHE_HOME" "$PUPPETEER_CACHE_DIR" "$REMOTION_BROWSER_DOWNLOADS_DIR" \
  && npm exec -- remotion browser ensure --log=verbose

EXPOSE 8190
CMD ["node", "index.mjs"]
