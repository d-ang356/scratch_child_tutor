#!/usr/bin/env bash
# Launch the Scratch Helper on Linux / macOS.
# Requires Node.js (https://nodejs.org) and the Ollama app running + signed in.
set -e
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install it from https://nodejs.org and try again."
  exit 1
fi
DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Starting Scratch Helper..."
exec node --no-warnings "$DIR/server.js"