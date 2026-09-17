FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run check

FROM node:22-alpine AS runtime

WORKDIR /app

RUN addgroup -S -g 1001 cuepilot \
  && adduser -S -D -H -u 1001 -G cuepilot cuepilot

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8090 \
    CUEPILOT_STATE_DIR=/app/state

COPY --from=build --chown=cuepilot:cuepilot /app/package.json ./package.json
COPY --from=build --chown=cuepilot:cuepilot /app/server ./server
COPY --from=build --chown=cuepilot:cuepilot /app/config/default.json ./config/default.json
COPY --from=build --chown=cuepilot:cuepilot /app/dist ./dist

USER 1001:1001

EXPOSE 8090

CMD ["node", "server/server.js"]
