FROM public.ecr.aws/docker/library/node:18-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ffmpeg fontconfig fonts-noto-cjk fonts-dejavu-core \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install container deps and local monorepo packages needed at runtime
COPY containers/burner-ffmpeg/package.json ./package.json
COPY packages/media-subtitles ./packages/media-subtitles
COPY packages/callback-utils ./packages/callback-utils
RUN npm install --omit=dev

# Add container entrypoint
COPY containers/burner-ffmpeg/index.mjs ./index.mjs

EXPOSE 8080
CMD ["node", "index.mjs"]
