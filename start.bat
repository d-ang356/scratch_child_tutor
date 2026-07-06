@echo off
REM Launch the Scratch Helper on Windows.
REM Requires Node.js (https://nodejs.org) and the Ollama app running + signed in.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
echo Starting Scratch Helper...
node "%~dp0server.js"
pause