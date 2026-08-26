# syntax=docker/dockerfile:1

# ── Production image for the web app ─────────────────────────────────────────
#
# Vite output is fully static, so the runtime stage is just nginx and a folder
# of files — no Node in the final image at all.
#
# Build from the REPO ROOT:
#   docker build -f apps/web/Dockerfile -t impactbridge-web .

FROM node:24-alpine AS base
# Two ENV lines, not one: a variable is not visible to later assignments
# within the same ENV instruction.
ENV PNPM_HOME="/pnpm"
ENV PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
# tsconfig.base.json carries esModuleInterop, the ES2022 target and strict
# settings that every workspace tsconfig extends. Without it tsc silently
# falls back to its defaults and the build fails on unrelated-looking
# errors in node_modules type definitions.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# The API base URL is baked in at BUILD time, not read at runtime — Vite inlines
# env vars into the bundle. A different backend therefore means a different
# image, which is the honest tradeoff for a static build.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN cd apps/web && pnpm build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
