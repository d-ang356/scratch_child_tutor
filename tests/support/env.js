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

module.exports = { baseUrl, dbPath };