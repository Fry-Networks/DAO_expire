# syntax=docker/dockerfile:1.7
FROM 1password/op:2@sha256:57d7d6a2bb2b74b2cf8111f6afb2973c74772198f82ea30359a53faae9fff5b1 AS op

FROM node:22-slim AS deps

WORKDIR /app
ENV NODE_ENV=production \
    OP_CONFIG_DIR=/tmp/op

RUN corepack enable && corepack prepare npm@11.8.0 --activate

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production \
    OP_CONFIG_DIR=/tmp/op

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates dumb-init gosu \
  && rm -rf /var/lib/apt/lists/*

COPY --from=op /usr/local/bin/op /usr/local/bin/op

RUN groupadd --system --gid 1001 appuser \
  && useradd --system --uid 1001 --gid 1001 --create-home --home-dir /home/appuser appuser

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY build ./build
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /tmp/op /home/appuser/.config /home/appuser/.npm \
  && chown -R appuser:appuser /app /tmp/op /home/appuser


ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
