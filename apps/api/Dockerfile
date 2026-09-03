# syntax=docker/dockerfile:1

# ── Production image for the API ─────────────────────────────────────────────
#
# Multi-stage: the build stage carries the full toolchain and every dev
# dependency, the final stage carries only what is needed to run. That keeps the
# shipped image small and, more usefully, keeps compilers and source maps out of
# production.
#
# Build from the REPO ROOT, not this directory:
#   docker build -f apps/api/Dockerfile -t impactbridge-api .
# The build needs the workspace manifests and packages/shared, which live above
# this file.

FROM node:24-alpine AS base
# Two ENV lines, not one: a variable is not visible to later assignments
# within the same ENV instruction.
ENV PNPM_HOME="/pnpm"
ENV PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# ── Dependencies ─────────────────────────────────────────────────────────────
# Manifests are copied alone, before any source, so this layer is cached and
# only re-runs when a dependency actually changes — not on every code edit.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ── Build ────────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
# tsconfig.base.json carries esModuleInterop, the ES2022 target and strict
# settings that every workspace tsconfig extends. Without it tsc silently
# falls back to its defaults and the build fails on unrelated-looking
# errors in node_modules type definitions.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# The generated Prisma client is imported throughout the codebase, so it must
# exist before typechecking — `pnpm build` runs `tsc --noEmit` first.
RUN cd apps/api && pnpm exec prisma generate && pnpm build

# Assemble the deployable tree: app + production deps only, no workspace
# symlinks. `--legacy` keeps pnpm from requiring inject-workspace-packages.
RUN pnpm --filter @impactbridge/api --prod --legacy deploy /deploy \
    && cp -r apps/api/dist /deploy/dist \
    && cp -r apps/api/prisma /deploy/prisma

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production

# `pnpm deploy` (run in the build stage) produced a self-contained, hoisted
# node_modules for just this workspace package — the tool pnpm provides
# specifically for containers. Copying that is far smaller than re-installing
# here: a plain `--prod` install materialises pnpm's symlinked store twice in
# the layer, and `--node-linker=hoisted` re-duplicates what the symlinks were
# deduplicating. Measured: 1.03GB and 1.72GB respectively, versus this.
COPY --from=build /deploy /app

# The Prisma client must be generated HERE. `pnpm deploy` copies resolved
# packages but not the generated output written into them, so a client made in
# the build stage does not survive — the container starts and immediately dies
# with "@prisma/client did not initialize yet". Generating against the
# production install also guarantees it matches the client actually present.
# The schema path is explicit because the deploy tree is flattened: the schema
# sits at /app/prisma, not the apps/api/prisma of the source layout.
# Invoked via the binary directly rather than `pnpm exec`, which tries to run
# an install first and fails in this dependency-complete tree.
RUN ./node_modules/.bin/prisma generate --schema=./prisma/schema.prisma

# The start sequence lives in a script, not in a CMD string and not in
# render.yaml's `dockerCommand`.
#
# Render runs `dockerCommand` through a shell of its own. A value of
# `sh -c "a && b"` therefore gets wrapped twice: the inner command arrives as a
# single quoted token, the shell tries to exec it as one program name, and the
# container dies with exit 127 and
#
#   sh: ./node_modules/.bin/prisma migrate deploy … && node dist/index.js: not found
#
# — which looks like a missing build output and is really a quoting bug. A
# one-token CMD has no quoting left to get wrong.
#
# `--chmod=755` rather than a separate `RUN chmod`: it sets the bit in the same
# layer and does not depend on the executable bit surviving a Windows checkout.
COPY --chmod=755 apps/api/docker-start.sh ./docker-start.sh

# Run unprivileged. The node image ships a `node` user for exactly this.
USER node

EXPOSE 4000

# Container-native health check, so an orchestrator can tell "process alive"
# from "actually serving" — this endpoint also verifies the database.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations then server, via the script above. Overriding this in Render is
# unnecessary and is what broke the deploy — leave `dockerCommand` unset.
CMD ["./docker-start.sh"]
