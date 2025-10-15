FROM public.ecr.aws/docker/library/node:18-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY containers/audio-transcoder/package.json ./package.json
RUN npm install --omit=dev

COPY containers/audio-transcoder/index.mjs ./index.mjs

EXPOSE 8080
CMD ["node", "index.mjs"]
