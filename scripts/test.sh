#!/usr/bin/env bash
# No-Docker local run of the Playwright functional tests.
# Playwright's webServer (see playwright.config.js) starts the app itself on
# http://127.0.0.1:8787, so you do NOT need to run `npm start` separately.
#
# Playwright is a dev-only dependency and is NOT installed by default — run
# `npm install` once first. Pass extra args through, e.g.:
#   scripts/test.sh --grep @mock
#   scripts/test.sh --grep @real      # needs a real OLLAMA_API_KEY in your env/.env
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
if [ ! -d node_modules/@playwright/test ]; then
  echo "Playwright is not installed. Run this once:  npm install"
  exit 1
fi
exec npx playwright test "$@"