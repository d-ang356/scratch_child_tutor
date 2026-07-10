@echo off
REM No-Docker local run of the Playwright functional tests.
REM Playwright's webServer (see playwright.config.js) starts the app itself on
REM http://127.0.0.1:8787, so you do NOT need to run `npm start` separately.
REM
REM Playwright is a dev-only dependency and is NOT installed by default — run
REM `npm install` once first. Pass extra args through, e.g.:
REM   scripts\test.bat --grep @mock
REM   scripts\test.bat --grep @real      REM needs a real OLLAMA_API_KEY in your env/.env
cd /d %~dp0\..
if not exist node_modules\@playwright\test (
  echo Playwright is not installed. Run this once:  npm install
  exit /b 1
)
call npx playwright test %*