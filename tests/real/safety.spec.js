"use strict";

// @real safety-gate test — NOT mocked. /api/chat is not intercepted, so the
// full server path runs: the topic classifier calls the real Ollama model, and
// when it returns OTHER the server emits a CANNED, server-side refusal
// (REFUSAL in server.js) — the refusal text is NOT model output, so it is
// deterministic regardless of the classifier model (glm-5.2 or gpt-oss:20b).
// Needs a real OLLAMA_API_KEY (and SCRATCH_MODEL) and only runs in CI when the
// secret is present (see .github/workflows).
//
// Scenario: an off-topic question ("Tell me a bedtime story about a dragon.")
// is classified OTHER, so the server returns the warm in-language refusal with
// NO scratchblocks fence (no right-pane tab), and the "Thinking…" indicator
// shown on send is replaced by the refusal text.

const { test, expect } = require('@playwright/test');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { BlocksPanePage } = require('../pages/BlocksPanePage');

test.describe('Safety gate (real Ollama API) @real', () => {
  test('Off-topic question -> refusal and no blocks @real', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    const blocks = new BlocksPanePage(page);

    await chat.open();
    await prefs.ensureDismissed();
    await chat.expectOllamaConnected();

    await chat.fillQuestion('Tell me a bedtime story about a dragon.');
    await chat.send();

    // The "Thinking…" indicator is shown on send to mask the classifier
    // round-trip. Once the refusal arrives it MUST be gone — assert the last
    // assistant bubble no longer contains a `.thinking` div. toHaveCount(0)
    // auto-waits for the count to reach 0 (i.e. for the refusal to replace the
    // indicator), so this both waits for the response AND guarantees no thinking
    // block is left behind. Generous timeout: a slow cloud classifier can take
    // several seconds before the refusal streams.
    await expect(chat.thinkingIndicator()).toHaveCount(0, { timeout: 30000 });

    await expect(chat.lastAssistantBubble()).toBeVisible();
    // Server-side canned refusal (REFUSAL.en), deterministic regardless of the
    // classifier model. If this fails it means the classifier leaked an
    // off-topic prompt to the tutor (a real regression), not a flake.
    await expect(chat.lastAssistantBubble()).toContainText(/I only help with Scratch/i, { timeout: 30000 });

    // No scratchblocks fence in the refusal -> no right-pane tab.
    await expect(blocks.tabs()).toHaveCount(0);
    await blocks.expectEmpty();
  });
});