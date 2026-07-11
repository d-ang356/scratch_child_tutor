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
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { BlocksPanePage } = require('../pages/BlocksPanePage');
const { mockChatAnswer } = require('../support/mockOllama');
const { prefsPath } = require('../support/env');

// preferences.json as the app sees it: prefsPath() (tests/support/env.js). The
// app and this spec resolve the SAME path: locally a throwaway file under
// test-data/ (so `npm test` never clobbers the user's real preferences.json),
// in Docker /data/preferences.json on the shared dbdata volume. server.js
// readPrefs() reads the file fresh on each /api/preferences GET (no caching), so
// unlinking it here forces the next chat.open() page load to show the first-run
// prefs modal. This is the one spec that genuinely tests first-run; all other
// specs use ensureDismissed().
const PREFS_PATH = prefsPath();

test.beforeEach(async () => {
  // Guarantee a clean first-run state (no preferences.json) regardless of run
  // order or a stale file from a prior local run.
  try { fs.unlinkSync(PREFS_PATH); } catch (e) { /* already absent — fine */ }
});

test('initial screen, Ollama connected, suggestion chip starts a chat @mock', async ({ page }) => {
  const chat = new ChatPage(page);
  const prefs = new PreferencesModalPage(page);
  const blocks = new BlocksPanePage(page);

  await chat.open();

  // First run: preferences modal is forced (no preferences.json yet).
  await expect(prefs.modal).toBeVisible();
  // The "ask a parent before using cloud" note is rendered in the modal — a
  // load-bearing regulatory disclaimer (CLAUDE.md); guard it so a PR that
  // removes the element fails this test.
  await expect(page.locator('.modal-note')).toBeVisible();
  await expect(page.locator('.modal-note')).toContainText(/parent|cloud|local/i);
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
  // The welcome-screen AI disclaimer (welcomeDisclaimer) is rendered — the
  // other load-bearing regulatory string. Guard it the same way.
  await expect(page.locator('.welcome-subtitle')).toBeVisible();
  await expect(page.locator('.welcome-subtitle')).toContainText(/makes mistakes|Scratch 3\.0/i);

  // 2. Ollama is connected (status dot turns green).
  await chat.expectOllamaConnected();

  // Intercept /api/chat, holding the response until we assert the thinking
  // state. Without hold, the mock fulfills instantly and the "Thinking…"
  // indicator is replaced before it can be observed.
  const { release } = await mockChatAnswer(page, { hold: true });

  // 3. Click a predefined answer (suggestion chip) to start a chat.
  await chat.clickExample(0);

  // A user message appears. Assert it carries the FULL example question
  // (li.dataset.q, incl. "when the game starts"), not just the short chip label
  // — a regression that sent li.textContent (the label) instead would pass a
  // looser "cat walk" check but fails this one.
  await expect(chat.lastUserBubble()).toBeVisible();
  await expect(chat.lastUserBubble()).toContainText('when the game starts');

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

test('first-run prefs modal cannot be dismissed until saved @mock', async ({ page }) => {
  const chat = new ChatPage(page);
  const prefs = new PreferencesModalPage(page);

  await chat.open();

  // First run: modal is forced open with data-first="1", and closePrefs()
  // refuses to hide it while that flag is set — the child can't bypass the age
  // gate by canceling. Verify every dismiss path fails to close it.
  await expect(prefs.modal).toBeVisible();
  expect(await prefs.isFirstRun()).toBe(true);

  // Cancel button -> closePrefs -> no-op while first-run.
  await prefs.cancel();
  await expect(prefs.modal).toBeVisible();
  // Close (✕) button -> closePrefs -> no-op.
  await prefs.closeBtn.click();
  await expect(prefs.modal).toBeVisible();
  // Backdrop click -> closePrefs -> no-op. (Click the overlay corner, not the
  // modal card, so e.target === #prefsModal.)
  await prefs.modal.click({ position: { x: 5, y: 5 } });
  await expect(prefs.modal).toBeVisible();
  // Escape -> closePrefs -> no-op.
  await page.keyboard.press('Escape');
  await expect(prefs.modal).toBeVisible();

  // Saving valid prefs clears data-first and dismisses the modal.
  await prefs.selectLang('en');
  await prefs.selectGender('unspecified');
  await prefs.setAge(8);
  await prefs.save();
  await expect(prefs.modal).toBeHidden();
});

test('age input caps at 17, filters non-digits, and rejects empty @mock', async ({ page }) => {
  const chat = new ChatPage(page);
  const prefs = new PreferencesModalPage(page);

  await chat.open();
  await expect(prefs.modal).toBeVisible();

  // The pAge 'input' handler caps at 17: fill 99 -> 17.
  await prefs.setAge(99);
  await expect(prefs.ageInput).toHaveValue('17');

  // #pAge is type="number" + inputmode="numeric", so non-digit characters are
  // rejected at the input level. Typing "1a2b" char-by-char (the way a child
  // would) yields only the digits "12" — 'a' and 'b' never enter the field. We
  // use pressSequentially (real keypresses) rather than fill('1a2b'), because
  // fill does a single value-set that the number input rejects wholesale to "".
  await prefs.ageInput.fill('');
  await prefs.ageInput.pressSequentially('1a2b');
  await expect(prefs.ageInput).toHaveValue('12');

  // Empty fails the JS submit validator (ageRaw === ""): the inline error shows
  // and the modal stays open. (An empty number input is VALID at the browser
  // level — no rangeUnderflow — so the form submits and the JS handler runs,
  // unlike age 0 which the browser's native min="1" constraint validation
  // blocks before the JS validator ever sees it. So empty is the reachable
  // JS-validator rejection; 0 is not testable via #pAgeErr.)
  await prefs.setAge('');
  await prefs.saveBtn.click();
  await expect(prefs.ageError).toBeVisible();
  await expect(prefs.modal).toBeVisible();

  // Boundary: age 1 is valid and dismisses the modal.
  await prefs.setAge(1);
  await prefs.save();
  await expect(prefs.modal).toBeHidden();
});