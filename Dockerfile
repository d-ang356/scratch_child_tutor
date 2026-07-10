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

# Bind all interfaces + a fixed port so the Playwright container can reach the
# app at http://app:8787. SCRATCH_NO_OPEN disables the desktop browser launch.
ENV HOST=0.0.0.0 \
    PORT=8787 \
    SCRATCH_NO_OPEN=1

EXPOSE 8787

# --no-warnings silences node:sqlite's ExperimentalWarning.
CMD ["node", "--no-warnings", "server.js"]