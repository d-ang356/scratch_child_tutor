"use strict";

// @mock empty / no-blocks assistant answers.
//
// finalize() (app.js) has three "nothing useful came back" paths, each tested
// here with a deterministic /api/chat mock (no real Ollama call, no key):
//
//   1. No content AND no reasoning  -> t("noAnswer2"): "**No answer came back.**"
//      (the stream produced only the [DONE] sentinel). mockChatEmpty().
//   2. No content but reasoning     -> t("noAnswer"): "didn't give an answer"
//      (the model thought, then produced nothing). mockChatEmpty({ reasoning }).
//   3. Content but NO scratchblocks  -> no tab; the right pane keeps its friendly
//      empty state (blocksEmpty visible, 0 tabs). mockChatAnswer({ content }).
//
// In all three, NO right-pane tab is created and the composer is re-enabled
// (finishStream via finally). Health is NOT mocked, so the dot is green for real
// and stays green — these are chat-path outcomes, not health states.

const { test, expect } = require('@playwright/test');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { BlocksPanePage } = require('../pages/BlocksPanePage');
const { mockChatEmpty, mockChatAnswer } = require('../support/mockOllama');

test.describe('Empty / no-blocks answers @mock', () => {
  test('no content and no reasoning -> noAnswer2, no tab @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    const blocks = new BlocksPanePage(page);

    await chat.open();
    await prefs.ensureDismissed();
    await chat.expectOllamaConnected();

    // Only the [DONE] sentinel — no content delta, no reasoning delta.
    await mockChatEmpty(page);

    await chat.fillQuestion('How do I make the cat walk?');
    await chat.send();

    // finalize's empty+no-reasoning branch -> noAnswer2. Bilingual match so the
    // test doesn't depend on which language a prior run left in preferences.json.
    await expect(chat.lastAssistantBubble()).toContainText(/No answer came back|Не получих отговор/);
    // No tab is created.
    await expect(blocks.tabs()).toHaveCount(0);
    // send() hides #blocksEmpty at the start of a turn, and the empty-answer
    // branch of finalize() returns early WITHOUT re-showing it, so the empty
    // card stays hidden here (unlike the no-fence case below, which re-shows
    // it). Pin the actual behavior — a future change to surface the empty state
    // on a no-answer turn is a deliberate UX change that should update this.
    await expect(blocks.blocksEmpty).toBeHidden();
    // Composer re-enabled; health still green.
    await expect(chat.sendBtn).toBeEnabled();
    await expect(chat.input).toBeEnabled();
  });

  test('reasoning but no content -> noAnswer, no tab @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    const blocks = new BlocksPanePage(page);

    await chat.open();
    await prefs.ensureDismissed();
    await chat.expectOllamaConnected();

    // A reasoning delta arrives (glm-5.2 thinks first) but no content delta —
    // the model reasoned then produced nothing.
    await mockChatEmpty(page, { reasoning: 'Hmm, how to explain walking...' });

    await chat.fillQuestion('How do I make the cat walk?');
    await chat.send();

    // finalize's empty+reasoning branch -> noAnswer.
    await expect(chat.lastAssistantBubble()).toContainText(/didn't give an answer|не даде отговор/);
    await expect(blocks.tabs()).toHaveCount(0);
    // Same as the no-reasoning case: send() hid #blocksEmpty and the empty
    // branch doesn't re-show it.
    await expect(blocks.blocksEmpty).toBeHidden();
    await expect(chat.sendBtn).toBeEnabled();
    await expect(chat.input).toBeEnabled();
  });

  test('content with no scratchblocks fence -> no tab, empty state @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    const blocks = new BlocksPanePage(page);

    await chat.open();
    await prefs.ensureDismissed();
    await chat.expectOllamaConnected();

    // Plain prose, no fenced scratchblocks block — e.g. a polite clarification
    // that asks the child to rephrase. finalize renders the prose, then
    // extractBlocks returns "" -> the `else if (tabs.length === 0)` branch keeps
    // the friendly empty state instead of creating a tab.
    await mockChatAnswer(page, { content: 'Sure! Could you tell me a bit more about what you want the cat to do?' });

    await chat.fillQuestion('Help me with the cat.');
    await chat.send();

    await expect(chat.lastAssistantBubble()).toContainText(/tell me a bit more/);
    await expect(blocks.tabs()).toHaveCount(0);
    await expect(blocks.blocksEmpty).toBeVisible();
    await expect(chat.sendBtn).toBeEnabled();
    await expect(chat.input).toBeEnabled();
  });
});