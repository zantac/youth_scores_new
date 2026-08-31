#!/bin/sh
set -e

# Railway mounts the upload Volume root-owned at runtime, so the non-root `app`
# user can't write to it (uploads silently 500). Fix ownership as root here — the
# only thing we use root for — then drop privileges and run the server as `app`.
# gosu replaces the process (no extra shell/PID) and forwards signals cleanly.
UPLOAD_DIR="${UPLOAD_FOLDER:-/data/uploads}"
mkdir -p "$UPLOAD_DIR"
chown -R app:app "$UPLOAD_DIR" 2>/dev/null || true

exec gosu app "$@"
