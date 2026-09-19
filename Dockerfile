# Image for the docs-answer-bot HTTP API (used by docker-compose.yml).
FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY data ./data

# The embedding model is downloaded on first start into /app/.cache (a named volume in compose).
RUN mkdir -p /app/.cache && chown -R node:node /app/.cache
USER node

ENV PORT=8787
EXPOSE 8787
CMD ["node_modules/.bin/tsx", "src/server.ts"]
