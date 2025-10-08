FROM public.ecr.aws/docker/library/node:18-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ffmpeg fontconfig fonts-noto-cjk fonts-dejavu-core \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm i --omit=dev
COPY index.mjs ./
EXPOSE 8080
CMD ["node", "index.mjs"]
