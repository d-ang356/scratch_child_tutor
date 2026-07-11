"use strict";

// @mock chat persistence across a reload.
//
// /api/chat is mocked (so no real Ollama call), but the chat + message
// persistence endpoints (/api/chats, /api/chats/:id/messages) are NOT mocked —
// the client really POSTs the user + assistant turns to the server, which
// writes them to the shared SQLite DB. This test proves that round-trip:
// after a mocked answer completes, reloading the app and opening the saved
// chat from the history drawer rebuilds the assistant message AND its
// right-pane block tab from the DB.
//
// The chat title is derived server-side from the first user message
// (question.slice(0,60) -> handleChatMessagePost sets it while untitled), so
// the drawer row is looked up by the question text. A Date.now() suffix keeps
// the title unique so leftover rows from a prior failed run never collide.

const { test, expect } = require('@playwright/test');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { BlocksPanePage } = require('../pages/BlocksPanePage');
const { ChatHistoryDrawerPage } = require('../pages/ChatHistoryDrawerPage');
const { mockChatAnswer } = require('../support/mockOllama');

test('mocked answer persists across reload and rebuilds from the DB @mock', async ({ page }) => {
  const chat = new ChatPage(page);
  const prefs = new PreferencesModalPage(page);
  const blocks = new BlocksPanePage(page);
  const chatHistory = new ChatHistoryDrawerPage(page);

  // Short + unique so the derived title (<60 chars) matches the drawer row.
  const question = `Walk the cat ${Date.now()}`;

  await chat.open();
  await prefs.ensureDismissed();
  await chat.expectOllamaConnected();

  // Canned answer with a complete scratchblocks fence -> one tab, and the
  // blocks markup is persisted (finalize stores extractBlocks(content)).
  await mockChatAnswer(page);

  await chat.fillQuestion(question);
  await chat.send();

  // The answer streamed in and produced one right-pane tab.
  await expect(chat.lastAssistantBubble()).toContainText(/cat/);
  await expect(blocks.tabs()).toHaveCount(1);
  await blocks.expectBlocksRendered();

  // Reload. The splash re-shows on reload, so go through chat.open() (which
  // waits for it) rather than page.reload() directly.
  await chat.open();
  await prefs.ensureDismissed();

  // The saved chat appears in the history drawer; open it and load the chat.
  await chatHistory.open();
  await expect(chatHistory.rowByTitle(question)).toBeVisible();
  await chatHistory.clickChatByTitle(question);

  // The assistant message AND its block tab are rebuilt from the DB (loadChat
  // re-renders m.content and addTabs from m.blocks). The persisted blocks
  // render as SVGs again.
  await expect(chat.lastAssistantBubble()).toContainText(/cat/);
  await expect(blocks.tabs()).toHaveCount(1);
  await blocks.expectBlocksRendered();
});