#!/usr/bin/env bash
# Launch the Scratch Helper on Linux / macOS.
# Requires Node.js (https://nodejs.org) and an Ollama backend: either the
# local Ollama app running + signed in, or OLLAMA_BASE + OLLAMA_API_KEY env
# vars pointing at the Ollama Cloud API (https://ollama.com).
set -e
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install it from https://nodejs.org and try again."
  exit 1
fi
DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Starting Scratch Helper..."
exec node --no-warnings "$DIR/server.js"