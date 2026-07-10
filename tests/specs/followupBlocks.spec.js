"use strict";

// @mock follow-up question + block-tab behavior.
//
// Two 1:1 scenarios. In both, the first answer produces a right-pane "Answer 1"
// tab with blocks; a follow-up question produces a second answer and a second
// "Answer 2" tab. Then we verify the hover "↖" jump-to-message button under the
// tabs: with tab 1 selected it scrolls the chat to answer 1's message; with tab
// 2 selected it scrolls to answer 2's message. /api/chat is intercepted at the
// browser boundary, so no real Ollama call runs and no API key is needed.
//
//   Test 1 — fresh chat: send Q1 -> A1 (tab 1), send follow-up Q2 -> A2 (tab 2).
//   Test 2 — continuation of an INSERTED existing chat: seed Q1+A1 (tab 1 on
//            load), then send follow-up Q2 -> A2 (tab 2).
//
// The ↖ scroll math (clamped target + wait-for-settle) and the two-tab
// assertion live on BlocksPanePage; the viewport shrink lives on BasePage; the
// chat-insertion texts (Q1/Q2, ANSWER1/2, block markup, the 20-tab seed) live
// in tests/utils/testConstants.js.

const { test, expect } = require('@playwright/test');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { BlocksPanePage } = require('../pages/BlocksPanePage');
const { ChatHistoryDrawerPage } = require('../pages/ChatHistoryDrawerPage');
const { mockChatSequence, mockChatAnswer } = require('../support/mockOllama');
const { createFactory } = require('../support/sqliteFactory');
const {
  FOLLOWUP_Q1, FOLLOWUP_Q2, FOLLOWUP_ANSWER1, FOLLOWUP_ANSWER2,
  walkBlocks, buildManyTabsConversation,
} = require('../utils/testConstants');

// Serial: the tests share one app + one SQLite DB (seeded once by globalSetup;
// tests 2/3 insert their own throwaway chats). workers=1 already serializes;
// this keeps the intent explicit and safe if workers rises.
test.describe.configure({ mode: 'serial' });

test.describe('Follow-up question grows a second block tab @mock', () => {
  test('fresh chat: follow-up answer expands a second tab @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    const blocks = new BlocksPanePage(page);

    await chat.open();
    await prefs.ensureDismissed();
    // Shrink the viewport so two answers overflow #messages (otherwise the ↖
    // navigation has nothing to scroll). Set after open() so the loading splash
    // — already cleared by open() — is not affected.
    await chat.shrinkViewport();

    // Two distinct answers queued: Q1 -> ANSWER1, follow-up Q2 -> ANSWER2.
    await mockChatSequence(page, [FOLLOWUP_ANSWER1, FOLLOWUP_ANSWER2]);

    // First question -> first answer + first block tab.
    await chat.fillQuestion(FOLLOWUP_Q1);
    await chat.send();
    await expect(chat.assistantBubbles()).toHaveCount(1);
    await expect(chat.lastAssistantBubble()).toContainText(/walk and say hello/i);
    await expect(blocks.tabs()).toHaveCount(1);

    // Follow-up question -> second answer + second block tab.
    await chat.fillQuestion(FOLLOWUP_Q2);
    await chat.send();
    await expect(chat.assistantBubbles()).toHaveCount(2);
    await expect(chat.lastAssistantBubble()).toContainText(/glide to a corner/i);
    await expect(blocks.tabs()).toHaveCount(2);

    await blocks.assertTwoTabsAndJumpIcons();
  });

  test('existing chat: follow-up answer expands a second tab @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    const blocks = new BlocksPanePage(page);
    const chatHistory = new ChatHistoryDrawerPage(page);

    // Seed an existing chat that already has the first exchange (Q1 + ANSWER1
    // with blocks). Unique title so retries/leftover rows never collide and the
    // global seed rows (FULL/MEOW) are untouched.
    const title = `Follow-up seed ${Date.now()}`;
    const db = createFactory().open();
    try {
      db.insertConversation({
        title,
        lang: 'en',
        turns: [
          { role: 'user', content: FOLLOWUP_Q1 },
          { role: 'assistant', content: FOLLOWUP_ANSWER1, blocks: walkBlocks },
        ],
      });
    } finally {
      db.close();
    }

    await chat.open();
    await prefs.ensureDismissed();
    await chat.shrinkViewport();

    // Load the seeded chat -> its stored assistant answer becomes tab 1.
    await chatHistory.open();
    await expect(chatHistory.rowByTitle(title)).toBeVisible();
    await chatHistory.clickChatByTitle(title);
    // Wait for the loaded conversation to render before continuing (loadChat is
    // async and the drawer backdrop covers the topbar while the drawer is open).
    await expect(chat.lastAssistantBubble()).toContainText(/walk and say hello/i);
    await expect(blocks.tabs()).toHaveCount(1);

    // Follow-up question -> second answer + second block tab. Only one
    // /api/chat call is expected here, so a single-answer mock is enough.
    await mockChatAnswer(page, { content: FOLLOWUP_ANSWER2 });
    await chat.fillQuestion(FOLLOWUP_Q2);
    await chat.send();
    await expect(chat.assistantBubbles()).toHaveCount(2);
    await expect(chat.lastAssistantBubble()).toContainText(/glide to a corner/i);
    await expect(blocks.tabs()).toHaveCount(2);

    await blocks.assertTwoTabsAndJumpIcons();
  });

  test('many answers: tab strip uses arrow scroll controls (20 tabs) @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    const blocks = new BlocksPanePage(page);
    const chatHistory = new ChatHistoryDrawerPage(page);

    // Seed a chat with 20 exchanges; every assistant turn carries blocks, so
    // loading it builds 20 right-pane "Answer N" tabs — far more than fit, which
    // is the ugly-scroll case the improved tab strip (arrows + fades, hidden
    // native scrollbar) is meant to handle.
    const title = `Many tabs ${Date.now()}`;
    const db = createFactory().open();
    try {
      db.insertConversation({ title, ...buildManyTabsConversation(20) });
    } finally {
      db.close();
    }

    await chat.open();
    await prefs.ensureDismissed();

    await chatHistory.open();
    await expect(chatHistory.rowByTitle(title)).toBeVisible();
    await chatHistory.clickChatByTitle(title);
    // 20 assistant answers -> 20 tabs. loadChat selects the last tab on load.
    await expect(chat.assistantBubbles()).toHaveCount(20);
    await expect(blocks.tabs()).toHaveCount(20);

    // Overflow detected: the wrapper gains .overflow and the chevron arrows are
    // shown. The native scrollbar is hidden (offsetWidth === clientWidth), so
    // the arrows ARE the scroll UI — not an ugly scrollbar.
    await expect(blocks.tabsWrap).toHaveClass(/\boverflow\b/);
    await expect(blocks.tabPrev).toBeVisible();
    await expect(blocks.tabNext).toBeVisible();
    expect(await blocks.tabStripHasNoScrollbar()).toBeTruthy();

    // loadChat selects the last (20th) tab and scrolls it into view. Wait for
    // the smooth scroll to settle at the right edge (next arrow disabled), then
    // the 20th tab is in view and the 1st is scrolled off (scroller needed).
    await blocks.expectActiveTabNumber(20);
    await expect(blocks.tabNext).toBeDisabled();
    await expect(blocks.tabPrev).toBeEnabled();
    expect(await blocks.tabVisibleInStrip(19)).toBeTruthy();
    expect(await blocks.tabVisibleInStrip(0)).toBeFalsy();

    // Scroll left one page with the prev arrow -> we leave the right edge, so
    // the next arrow re-enables and a left edge fade appears (.can-left).
    await blocks.tabPrev.click();
    await expect(blocks.tabNext).toBeEnabled();
    await expect(blocks.tabsWrap).toHaveClass(/\bcan-left\b/);

    // Jump to the first tab -> the strip scrolls all the way left, the first
    // tab becomes active and visible, and the prev arrow disables at the edge.
    await blocks.selectTab(0);
    await blocks.expectActiveTabNumber(1);
    await expect(blocks.tabPrev).toBeDisabled();
    await expect(blocks.tabNext).toBeEnabled();
    expect(await blocks.tabVisibleInStrip(0)).toBeTruthy();
  });
});