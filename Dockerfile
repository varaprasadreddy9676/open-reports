# syntax=docker/dockerfile:1.7
# Targets:  api  (REST API + bundled designer on :4000)   designer  (nginx on :3000, proxies /api to the api service)

# ---------------------------------------------------------------- build
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
# pnpm applies these dependency patches during install (patchedDependencies).
COPY patches ./patches
COPY packages ./packages
COPY apps ./apps
COPY examples ./examples
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm -r --filter "./packages/**" build && pnpm --filter @reporting/server build && pnpm --filter @reporting/designer build
RUN pnpm --filter @reporting/server deploy --legacy --prod /out/server \
 && cp -r apps/designer/dist /out/designer

# ---------------------------------------------------------------- api
FROM node:22-bookworm-slim AS api
# Noto fonts are required for correct Latin, Indic and Arabic text in PDFs (pagination depends on real glyph metrics).
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-core curl && rm -rf /var/lib/apt/lists/* \
 && useradd --system --create-home --uid 10001 reports && mkdir -p /data && chown reports /data
WORKDIR /app
COPY --from=build /out/server ./
COPY --from=build /out/designer ./designer
COPY --from=build /repo/examples ./examples
ENV EXAMPLES_DIR=/app/examples NODE_ENV=production PORT=4000 DB_PATH=/data/reporting.sqlite DESIGNER_DIST=/app/designer
USER reports
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD curl -fsS http://localhost:4000/health || exit 1
CMD ["node", "dist/index.js"]

# ---------------------------------------------------------------- designer (static)
FROM nginx:1.27-alpine AS designer
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out/designer /usr/share/nginx/html
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://localhost:3000/ >/dev/null || exit 1
