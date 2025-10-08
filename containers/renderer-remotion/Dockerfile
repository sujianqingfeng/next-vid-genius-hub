FROM public.ecr.aws/docker/library/node:22-bookworm-slim

# Install system dependencies: ffmpeg, fontconfig, CJK fonts, Chromium deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ffmpeg fontconfig fonts-noto-cjk fonts-dejavu-core \
     ca-certificates libnss3 libxss1 libasound2 libx11-6 libx11-xcb1 libxcomposite1 \
     libxdamage1 libxrandr2 libxtst6 libgtk-3-0 libgbm1 \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install minimal deps first for better layer caching
# When building with context at repo root, copy the container's manifest
COPY containers/renderer-remotion/package.json ./package.json
RUN npm i --omit=dev

# Copy runtime files
COPY containers/renderer-remotion/index.mjs ./index.mjs
# Copy Remotion project (from repo root)
COPY remotion ./remotion
COPY public ./public

# Pre-download headless browser at build time to avoid runtime download
ENV XDG_CACHE_HOME=/opt/.cache \
    PUPPETEER_CACHE_DIR=/opt/.cache/puppeteer \
    REMOTION_BROWSER_DOWNLOADS_DIR=/opt/remotion-browser
RUN mkdir -p "$XDG_CACHE_HOME" "$PUPPETEER_CACHE_DIR" "$REMOTION_BROWSER_DOWNLOADS_DIR" \
  && npm exec -- remotion browser ensure --log=verbose

EXPOSE 8090
CMD ["node", "index.mjs"]
