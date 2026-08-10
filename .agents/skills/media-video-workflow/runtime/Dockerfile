FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /opt/media-video-workflow

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg python3-pip \
	&& pip3 install --no-cache-dir --break-system-packages yt-dlp \
	&& rm -rf /var/lib/apt/lists/*

COPY runtime/package.json runtime/package-lock.json ./runtime/
WORKDIR /opt/media-video-workflow/runtime
COPY runtime/src/ensure-browser.mjs ./src/ensure-browser.mjs
RUN npm ci --omit=dev \
	&& node src/ensure-browser.mjs

COPY runtime/src ./src
COPY runtime/remotion ./remotion
WORKDIR /work
ENTRYPOINT ["node", "/opt/media-video-workflow/runtime/src/workflow.mjs"]
