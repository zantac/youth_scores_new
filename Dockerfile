# Multi-stage build for Railway (or any Docker host): build both Next.js static
# exports, then serve them + the Flask API from one gunicorn process. Host-based
# routing inside Flask picks the right export per domain:
#   youthscores.org        → web/out
#   tla3bny.youthscores.org → web-tla3bny/out
# Attach BOTH custom domains to this one Railway service.

# ── 1) build the youthscores web export ──────────────────────────────────────
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY web/ ./
# No NEXT_PUBLIC_CONFIG_URL: the app defaults to a same-origin (relative) API,
# so it works on whatever host serves it (Railway temp domain, youthscores.org).
RUN npm run build

# ── 2) build the tla3bny subdomain export ────────────────────────────────────
FROM node:20-alpine AS web-tla3bny
WORKDIR /app
COPY web-tla3bny/package.json web-tla3bny/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY web-tla3bny/ ./
# Same-origin (relative) API by default — served on tla3bny.youthscores.org.
RUN npm run build

# ── 3) Python runtime ────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

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

# Drop root: run as an unprivileged user so a code-exec/path-traversal bug in the
# app can't act as root inside the container. Own /app so the app can still write
# its instance/ dir and any local upload staging.
RUN adduser --system --no-create-home --group app \
    && chown -R app:app /app
USER app

WORKDIR /app/backend
# Run pending migrations, then serve. Railway provides $PORT.
# --preload loads the app once before forking so the 2 workers share code memory
# (copy-on-write), and --threads handles concurrency without extra processes —
# both trim always-on RAM (the main Railway cost) for this I/O-bound workload.
CMD ["sh", "-c", "flask db upgrade && gunicorn --bind 0.0.0.0:${PORT:-8000} --workers 2 --threads 4 --preload --timeout 60 wsgi:app"]
