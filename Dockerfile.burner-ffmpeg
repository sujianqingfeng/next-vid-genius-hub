ARG BASE_NODE_IMAGE=node:18-slim
FROM ${BASE_NODE_IMAGE}
ARG DEBIAN_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/debian
ARG DEBIAN_SECURITY_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/debian-security
ARG NPM_REGISTRY=https://registry.npmmirror.com

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
      ffmpeg fontconfig fonts-noto-cjk fonts-dejavu-core; \
    fc-cache -f; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install container deps and local monorepo packages needed at runtime
COPY containers/burner-ffmpeg/package.json ./package.json
COPY packages/media-subtitles ./packages/media-subtitles
COPY packages/callback-utils ./packages/callback-utils
RUN npm config set registry ${NPM_REGISTRY}
RUN npm install --omit=dev

# Add container entrypoint
COPY containers/burner-ffmpeg/index.mjs ./index.mjs
COPY containers/shared.mjs ./shared.mjs

EXPOSE 8080
CMD ["node", "index.mjs"]
