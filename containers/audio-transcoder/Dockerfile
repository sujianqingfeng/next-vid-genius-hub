ARG BASE_NODE_IMAGE=docker.m.daocloud.io/library/node:18-slim
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
      ffmpeg; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY containers/audio-transcoder/package.json ./package.json
COPY packages/job-callbacks ./packages/job-callbacks
COPY packages/media-node ./packages/media-node
RUN npm config set registry ${NPM_REGISTRY}
RUN npm install --omit=dev

COPY containers/audio-transcoder/index.mjs ./index.mjs
COPY containers/shared.mjs ./shared.mjs

EXPOSE 8080
CMD ["node", "index.mjs"]
