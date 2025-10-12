FROM public.ecr.aws/docker/library/node:22-slim

ARG MIHOMO_VERSION=1.18.10
# Use the "compatible" build by default to run on CPUs without x86-64-v3/AVX2.
# Can be overridden at build time with --build-arg MIHOMO_PLATFORM=linux-amd64 if desired.
ARG MIHOMO_PLATFORM=linux-amd64-compatible

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ffmpeg \
     python3 \
     python3-pip \
     curl \
     ca-certificates \
     gzip \
     unzip \
  && rm -rf /var/lib/apt/lists/* \
  && update-ca-certificates

# Install latest yt-dlp binary (apt package may lag behind and break YouTube downloads)
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp

RUN curl -fL -o /tmp/mihomo.gz "https://github.com/MetaCubeX/mihomo/releases/download/v${MIHOMO_VERSION}/mihomo-${MIHOMO_PLATFORM}-v${MIHOMO_VERSION}.gz" \
  && gunzip /tmp/mihomo.gz \
  && mv /tmp/mihomo /usr/local/bin/mihomo \
  && chmod +x /usr/local/bin/mihomo

WORKDIR /app
# Install with monorepo local package dependency
# Expect build context at repo root so these COPY paths are valid
COPY containers/media-downloader/package.json ./package.json
COPY packages/media-core ./packages/media-core
RUN npm install --omit=dev
COPY containers/media-downloader/index.mjs ./index.mjs

RUN mkdir -p /app/clash /app/clash/providers

EXPOSE 8080
CMD ["node", "index.mjs"]
