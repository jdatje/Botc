FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
ARG GIT_SHA=dev
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data GIT_SHA=$GIT_SHA
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3000
# /health answers under BASE_PATH too (busybox wget is in the alpine image)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}${BASE_PATH}/health" >/dev/null || exit 1
USER node
CMD ["node", "server.js"]
