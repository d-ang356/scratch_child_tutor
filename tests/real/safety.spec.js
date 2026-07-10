"use strict";

// @real safety-gate tests — scaffolding for the user to implement.
//
// These are NOT mocked: /api/chat is not intercepted, so the full server path
// runs — the topic classifier calls the real Ollama model, then the tutor
// stream does too. They need a real OLLAMA_API_KEY (and a real SCRATCH_MODEL)
// and only run in CI when the secret is present (see .github/workflows).
//
// Two scenarios (described by the user):
//   A) A Scratch question -> the model answers AND produces blocks.
//   B) An off-topic question -> the model provides NO answer and NO blocks
//      (the server's topic gate returns a warm in-language refusal with no
//      scratchblocks fence, so no right-pane tab is created).
//
// They are test.skip() for now so the @real workflow job reports "skipped"
// rather than failing on zero tests. Implement them by removing the skip and
// filling in the assertions. Use the page objects under tests/pages and the
// SQLite factory under tests/support as needed.

const { test } = require('@playwright/test');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { BlocksPanePage } = require('../pages/BlocksPanePage');

test.describe('Safety gate (real Ollama API) @real', () => {
  test.skip('Scratch question -> model answers with blocks @real', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    const blocks = new BlocksPanePage(page);

    await chat.open();
    await prefs.selectLang('en');
    await prefs.setAge(8);
    await prefs.save();

    await chat.expectOllamaConnected();
    // e.g. await chat.fillQuestion('How do I make the cat glide to a corner?');
    //      await chat.send();
    //      await expect(chat.lastAssistantBubble()).toBeVisible();
    //      await expect(blocks.tabs().first()).toHaveText(/Answer 1/);
    //      await blocks.expectBlocksRendered();
  });

  test.skip('Off-topic question -> no answer and no blocks @real', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    const blocks = new BlocksPanePage(page);

    await chat.open();
    await prefs.selectLang('en');
    await prefs.setAge(8);
    await prefs.save();

    await chat.expectOllamaConnected();
    // e.g. await chat.fillQuestion('Tell me a bedtime story about a dragon.');
    //      await chat.send();
    //      // The server's classifier returns OTHER -> emitRefusal sends a canned
    //      // message with NO scratchblocks fence.
    //      await expect(chat.lastAssistantBubble()).toBeVisible();
    //      await expect(blocks.tabs()).toHaveCount(0);
    //      await blocks.expectEmpty();
  });
});