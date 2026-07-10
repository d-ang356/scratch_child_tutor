"use strict";

// Playwright globalSetup: runs ONCE per run before any test. Clears the shared
// SQLite DB and seeds the conversations specs rely on.
//
// This replaces per-spec `beforeAll { db.clear(); seed }`, which was a hazard:
// under any ordering/retry/parallelism, a spec clearing the shared DB would
// wipe rows out from under another spec. Centralizing the seed here means every
// spec can assume the seed rows are present and never mutates them.
//
// In the Docker/CI setup each shard is its own Playwright run with its own
// COMPOSE_PROJECT_NAME (own app, own DB volume), so each shard runs this setup
// against its own DB — no cross-shard interaction. The factory opens the same
// DB file the app uses (SCRATCH_DB_PATH) with WAL + busy_timeout, so it is safe
// to seed while the app (already up via webServer reuse) holds the file open.

const { createFactory } = require('./sqliteFactory');
const { FULL_CONVERSATION_DATA, MEOW_CONVERSATION_DATA } = require('../utils/testConstants');

module.exports = async function globalSetup() {
  const db = createFactory().open();
  try {
    db.clear();
    db.insertConversation(FULL_CONVERSATION_DATA);
    db.insertConversation(MEOW_CONVERSATION_DATA);
  } finally {
    db.close();
  }
};