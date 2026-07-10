"use strict";

// Shared test environment helpers.

function baseUrl() {
  return process.env.BASE_URL || 'http://127.0.0.1:8787';
}

// DB path the app is configured with (set SCRATCH_DB_PATH to share a Docker
// volume between the app container and the test runner). Defaults to a local
// throwaway DB under test-data/ so it never touches the user's real DB.
function dbPath() {
  return process.env.SCRATCH_DB_PATH || 'test-data/scratch_helper.test.db';
}

// preferences.json path the app is configured with. Mirrors dbPath(): in Docker,
// SCRATCH_PREFS_PATH points both the app container and the test runner at the
// SAME file on the shared dbdata volume (/data/preferences.json), so an
// fs.unlinkSync here resets the file the app actually reads. Locally it
// defaults to a throwaway file under test-data/ so `npm test` never clobbers
// the user's real preferences.json — the app (launched by Playwright's webServer)
// is given the same path via the webServer env in playwright.config.js.
function prefsPath() {
  return process.env.SCRATCH_PREFS_PATH || 'test-data/preferences.json';
}

module.exports = { baseUrl, dbPath, prefsPath };