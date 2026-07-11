# App image for scratch_helper.
# The app is zero-dependency, so there is no `npm install` — just copy the
# runtime files and run Node. Node 22.5+ is required for the built-in node:sqlite.
FROM node:22-slim

WORKDIR /app

# Runtime files only (no tests, no node_modules, no local data).
COPY server.js ./
COPY public/ ./public/
COPY scratchblocks-prompts/ ./scratchblocks-prompts/
COPY img/ ./img/

# The app writes chat history (SQLite) + preferences to /data. In the
# docker-compose test setup /data is a NAMED volume shared with the tests
# container. Create it here owned by the non-root `node` user (uid 1000, shipped
# by the base image) and seed a placeholder so Docker copies this ownership onto
# the named volume on first mount — an EMPTY mount point initializes root-owned,
# and the app (now running as `node`, see USER below) could not write its DB or
# prefs. CI runners are ephemeral (fresh volumes per run) so this just works; a
# local `npm run test:docker` user with a PRE-EXISTING root-owned dbdata volume
# from before this change must reset it once: `docker compose down --volumes`.
RUN mkdir -p /data && touch /data/.keep && chown -R node:node /data

# Bind all interfaces + a fixed port so the Playwright container can reach the
# app at http://scratch-app:8787. SCRATCH_NO_OPEN disables the desktop browser
# launch. Point the DB + prefs at /data (node-writable) so a standalone run of
# the image — not just the compose setup — also works as the non-root user.
# (The compose service overrides these with the same /data paths on the shared
# volume.) The compose service is named scratch-app, not app, to avoid Chromium
# HSTS-upgrading the bare `app` hostname — see docker-compose.yml.
ENV HOST=0.0.0.0 \
    PORT=8787 \
    SCRATCH_NO_OPEN=1 \
    SCRATCH_DB_PATH=/data/scratch_helper.db \
    SCRATCH_PREFS_PATH=/data/preferences.json

# Run as the non-root `node` user to reduce blast radius if the process is ever
# compromised. The app only READS the copied runtime files above (world-readable)
# and writes exclusively to /data (node-owned), so this needs no further setup.
USER node

EXPOSE 8787

# --no-warnings silences node:sqlite's ExperimentalWarning.
CMD ["node", "--no-warnings", "server.js"]