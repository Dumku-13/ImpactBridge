#!/bin/sh
#
# Container start: apply migrations, then run the API.
#
# This lives in a FILE rather than in render.yaml's `dockerCommand` because
# Render already runs that value through a shell. Writing `sh -c "a && b"`
# there gets double-wrapped: the inner command arrives as one quoted token and
# the shell tries to execute it as a single program name, which fails with
#
#   sh: ./node_modules/.bin/prisma migrate deploy … && node dist/index.js: not found
#
# (exit 127). A one-token CMD has no quoting to get wrong. It also means
# `docker run` locally does exactly what Render does, instead of skipping the
# migration step.
set -e

# Migrations run at START, not at build: the database only exists at runtime,
# so a deploy can never serve traffic against a schema the code does not
# expect. Already-applied migrations are a no-op.
./node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma

# exec so node replaces this shell as PID 1 and receives SIGTERM directly —
# without it the shell swallows the signal and the platform waits out its
# grace period before killing the container on every deploy.
exec node dist/index.js
