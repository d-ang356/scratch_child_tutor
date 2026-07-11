"use strict";

// @mock Stop-button behavior.
//
// While the model is streaming, the Send button becomes a Stop button. Clicking
// it aborts the in-flight /api/chat fetch CLIENT-SIDE via AbortController (the
// fetch rejects with AbortError), so send()'s catch renders the
// "(stopped)" / "(спряно)" marker on whatever partial explanation arrived, and
// finishStream() re-enables the composer so the child can ask again. This is
// distinct from mockChatDrop (which aborts the route SERVER-SIDE -> a TypeError
// "Failed to fetch" -> the connLost "Connection lost." branch): the Stop button
// is the user intentionally cancelling, not a network drop.
//
// To observe the thinking state and then abort deterministically, /api/chat is
// held with mockChatAnswer({ hold: true }) and NEVER released: the client aborts
// before any byte streams, so the held route is simply orphaned and discarded
// when the page closes (releasing it would try to fulfill an already-aborted
// route). /api/health is NOT mocked, so the dot is green for real and stays
// green after the abort (the stop is on the chat path, not the health path).

const { test, expect } = require('@playwright/test');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { BlocksPanePage } = require('../pages/BlocksPanePage');
const { mockChatAnswer, mockChatPartialThenHold } = require('../support/mockOllama');

test.describe('Stop button @mock', () => {
  test('clicking Stop aborts the stream and re-enables the composer @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);

    await chat.open();
    await prefs.ensureDismissed();
    await chat.expectOllamaConnected();

    // Held mock: /api/chat will not fulfill until release(). The Send button
    // becomes "Stop" while streaming and stays enabled so it can be clicked.
    const { release } = await mockChatAnswer(page, { hold: true });

    await chat.fillQuestion('How do I make the cat walk?');
    await chat.send();
    // The "Thinking…" indicator is rendered immediately on send, before any
    // delta, so we can observe it while the held fetch is pending.
    await chat.expectThinking();

    // Click Stop (same #sendBtn, now labeled "Stop") -> AbortController.abort()
    // -> the fetch rejects with AbortError -> the "(stopped)" marker is shown.
    await chat.stop();
    await expect(chat.lastAssistantBubble()).toContainText(/\(stopped\)|\(спряно\)/);
    await expect(chat.thinkingIndicator()).toHaveCount(0);

    // The composer is re-enabled (finishStream -> enableInput(ollamaOk), health
    // still green) and the button label is back to Send / Изпрати.
    await expect(chat.sendBtn).toBeEnabled();
    await expect(chat.input).toBeEnabled();
    await expect(chat.sendBtn).toHaveText(/Send|Изпрати/);

    // Intentionally never released — see the file header. Void the binding so the
    // linter doesn't flag the unused `release`.
    void release;
  });

  test('Stop with partial content keeps the prose, marks stopped, and tabs the partial blocks @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    const blocks = new BlocksPanePage(page);

    // Stream a little content, then HOLD the stream open so we can click Stop
    // mid-stream with NON-empty `content`. page.route's fulfill can't
    // stream-then-hold, so mockChatPartialThenHold overrides window.fetch with a
    // ReadableStream we control: it enqueues a prose chunk and a chunk that
    // OPENS a scratchblocks fence (no closing ```) with two block lines, then
    // never closes — so the reader stays pending until we abort. MUST be
    // registered before chat.open() (addInitScript runs on the next navigation).
    await mockChatPartialThenHold(page, {
      contentChunks: [
        "Here's how to make the cat walk!\n\n1. Drag a **when green flag clicked** block.\n",
        "```scratchblocks\nwhen green flag clicked\nmove [10] ste",
      ],
    });

    await chat.open();
    await prefs.ensureDismissed();
    await chat.expectOllamaConnected();

    await chat.fillQuestion('How do I make the cat walk?');
    await chat.send();

    // Wait for the prose to actually arrive (the stream enqueued it) before we
    // abort — this proves the abort lands on non-empty content, not the empty
    // case the first test already covers. updateLive renders only the prose
    // before an open fence (the fence content renders once complete), so the
    // bubble shows the explanation while the fence is still open.
    await expect(chat.lastAssistantBubble()).toContainText('cat walk');

    // Click Stop -> AbortError. send()'s catch takes the AbortError branch:
    // it renders the prose before the open fence + a "(stopped)" marker, then
    // extractBlocks (FENCE_COMPLETE) misses (no closing fence) and FENCE_LOOSE
    // captures the partial block text -> addTab creates a tab.
    await chat.stop();

    // Prose is preserved and the stopped marker is appended.
    await expect(chat.lastAssistantBubble()).toContainText('cat walk');
    await expect(chat.lastAssistantBubble()).toContainText(/\(stopped\)|\(спряно\)/);
    // The AbortError branch must NOT render the connLost message — that's the
    // network-drop (TypeError) branch. Asserting its absence pins the branch.
    await expect(chat.lastAssistantBubble()).not.toContainText(/Connection lost|Връзка прекъсна/);

    // The partial fence still produced a tab (FENCE_LOOSE captures the open
    // fence up to end-of-content) — one tab, rendered.
    await expect(blocks.tabs()).toHaveCount(1);
    await blocks.expectBlocksRendered();

    // Composer re-enabled, health still green (chat-path abort, not health).
    await expect(chat.sendBtn).toBeEnabled();
    await expect(chat.input).toBeEnabled();
    await chat.expectOllamaConnected();
  });
});