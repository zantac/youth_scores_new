# Multi-stage build for Railway (or any Docker host): build both Next.js static
# exports, then serve them + the Flask API from one gunicorn process. Host-based
# routing inside Flask picks the right export per domain:
#   youthscores.org        → web/out
#   tla3bny.youthscores.org → web-tla3bny/out
# Attach BOTH custom domains to this one Railway service.
#
# Base images are pinned by digest for reproducible, supply-chain-safe builds.
# Trade-off: a pinned base does NOT auto-receive upstream security patches, so
# refresh these digests periodically (e.g. monthly). To get the current digest
# for a tag (Docker installed):
#   docker buildx imagetools inspect node:20-alpine --format '{{.Manifest.Digest}}'
#   docker buildx imagetools inspect python:3.12-slim --format '{{.Manifest.Digest}}'
# then update the @sha256:… below and keep the human-readable tag alongside it.

# ── 1) build the youthscores web export ──────────────────────────────────────
FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install --no-audit --no-fund
# Cache-buster: bump this value to force the COPY + build below to re-run when a
# newly-generated export file (e.g. robots.txt / sitemap.xml) must appear but the
# builder is reusing a stale web/out layer. Leaves the slow npm install cached.
ARG CACHEBUST=2026-08-31c
COPY web/ ./
# No NEXT_PUBLIC_CONFIG_URL: the app defaults to a same-origin (relative) API,
# so it works on whatever host serves it (Railway temp domain, youthscores.org).
RUN npm run build

# ── 2) build the tla3bny subdomain export ────────────────────────────────────
FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS web-tla3bny
WORKDIR /app
COPY web-tla3bny/package.json web-tla3bny/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY web-tla3bny/ ./
# Same-origin (relative) API by default — served on tla3bny.youthscores.org.
RUN npm run build

# ── 3) Python runtime ────────────────────────────────────────────────────────
FROM python:3.14-slim@sha256:cae66f2ef0ec51a9891263eeee7f987dacf0a9879e8aa9353d5606e0530619a5 AS runtime
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

# gosu lets the root entrypoint drop to the non-root `app` user after fixing the
# mounted-volume ownership (see docker-entrypoint.sh).
RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
# The two static exports, placed where the app factory expects them
# (repo_root/web/out and repo_root/web-tla3bny/out; also set explicitly below).
COPY --from=web       /web/out          web/out
COPY --from=web-tla3bny /app/out        web-tla3bny/out

ENV FLASK_APP=wsgi.py \
    FLASK_ENV=production \
    FRONTEND_DIR=/app/web/out \
    TLA3BNY_FRONTEND_DIR=/app/web-tla3bny/out

# Unprivileged runtime: the entrypoint starts as root ONLY to chown the mounted
# upload volume, then drops to this `app` user via gosu for the actual server — so
# a code-exec/path-traversal bug in the app can't act as root. Own /app for the
# app code + instance dir.
RUN adduser --system --no-create-home --group app \
    && chown -R app:app /app
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

WORKDIR /app/backend
# Run pending migrations, then serve. Railway provides $PORT.
# --preload loads the app once before forking so the 2 workers share code memory
# (copy-on-write), and --threads handles concurrency without extra processes —
# both trim always-on RAM (the main Railway cost) for this I/O-bound workload.
CMD ["sh", "-c", "flask db upgrade && gunicorn --bind 0.0.0.0:${PORT:-8000} --workers 2 --threads 4 --preload --timeout 60 wsgi:app"]
