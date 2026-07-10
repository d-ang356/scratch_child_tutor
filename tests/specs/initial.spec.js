"use strict";

// Initial smoke test (@mock). Verifies:
//   1. The initial screen renders (welcome + predefined suggestion chips).
//   2. Ollama is connected (health endpoint green).
//   3. Selecting a predefined answer (a suggestion chip) starts a chat:
//      a user message appears, the model shows the "Thinking…" state, then an
//      assistant message appears, and the assistant's scratchblocks answer
//      creates a right-pane tab with rendered SVGs.
//
// /api/chat is intercepted at the browser boundary (mockChatAnswer), so NO real
// Ollama call is made — the test is deterministic and needs no API key. The
// health check is not intercepted, so "Ollama connected" is real. The mock is
// held (hold:true) until the thinking state is asserted, then released so the
// answer streams in.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { BlocksPanePage } = require('../pages/BlocksPanePage');
const { mockChatAnswer } = require('../support/mockOllama');

// preferences.json as the app sees it: server.js uses path.join(__dirname,
// 'preferences.json'), and the app runs from the repo root. Locally the test
// cwd is the repo root too, so this is the same file. In Docker the app's
// preferences.json lives in the app container (/app), which is NOT mounted into
// the tests container — but .dockerignore excludes it, so it is already absent
// there and this unlink is a harmless no-op.
const PREFS_PATH = path.join(__dirname, '..', '..', 'preferences.json');

test.beforeEach(async () => {
  // Guarantee a clean first-run state (no preferences.json) regardless of run
  // order or a stale file from a prior local run. server.js readPrefs() reads
  // the file fresh on each /api/preferences GET (no caching), so deleting it
  // makes the next chat.open() page load force the prefs modal. This is the one
  // spec that genuinely tests first-run; all other specs use ensureDismissed().
  try { fs.unlinkSync(PREFS_PATH); } catch (e) { /* already absent — fine */ }
});

test('initial screen, Ollama connected, suggestion chip starts a chat @mock', async ({ page }) => {
  const chat = new ChatPage(page);
  const prefs = new PreferencesModalPage(page);
  const blocks = new BlocksPanePage(page);

  await chat.open();

  // First run: preferences modal is forced (no preferences.json yet).
  await expect(prefs.modal).toBeVisible();
  await prefs.selectLang('en');
  await prefs.selectGender('boy');
  await prefs.setAge(8);
  await prefs.save();
  await expect(prefs.modal).toBeHidden();

  // 1. Initial screen: welcome card + predefined suggestion chips.
  await chat.expectWelcomeVisible();
  await expect(chat.exampleItems()).toHaveCount(3);
  const items = await chat.exampleItems().all();
  for (const item of items ) {
    await expect(item).toBeEnabled();
  }

  // 2. Ollama is connected (status dot turns green).
  await chat.expectOllamaConnected();

  // Intercept /api/chat, holding the response until we assert the thinking
  // state. Without hold, the mock fulfills instantly and the "Thinking…"
  // indicator is replaced before it can be observed.
  const { release } = await mockChatAnswer(page, { hold: true });

  // 3. Click a predefined answer (suggestion chip) to start a chat.
  await chat.clickExample(0);

  // A user message appears...
  await expect(chat.lastUserBubble()).toBeVisible();
  await expect(chat.lastUserBubble()).toContainText('cat walk');

  // ...and the model shows it is thinking BEFORE it produces an answer.
  await chat.expectThinking();

  // Release the held mock response -> the assistant answer streams in and
  // replaces the thinking indicator.
  release();

  // The assistant message appears.
  await expect(chat.lastAssistantBubble()).toBeVisible();
  await expect(chat.lastAssistantBubble()).toContainText('cat');

  // The assistant answer contained a scratchblocks block -> one right-pane tab
  // labeled "Answer 1", with the blocks rendered as SVG.
  await expect(blocks.tabs()).toHaveCount(1);
  await expect(blocks.tabs().first()).toHaveText(/Answer 1/);
  await blocks.expectBlocksRendered();
});