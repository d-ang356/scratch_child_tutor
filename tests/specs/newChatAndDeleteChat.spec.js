"use strict";


const { test, expect } = require('@playwright/test');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { BlocksPanePage } = require('../pages/BlocksPanePage');
const { ChatHistoryDrawerPage} = require('../pages/ChatHistoryDrawerPage');

const { createFactory } = require('../support/sqliteFactory');
const { FULL_CONVERSATION_DATA } = require('../utils/testConstants');

// Serial within this file: the tests share one app + one SQLite DB. The DB is
// seeded once by globalSetup (not cleared per spec), so tests must not run in
// parallel against it. With workers=1 this is already the global behavior;
// mode: serial makes the intent explicit and keeps it safe if workers rises.
test.describe.configure({ mode: 'serial' });

test('user can start a new chat @mock', async ({ page }) => {
  const chat = new ChatPage(page);
  const prefs = new PreferencesModalPage(page);
  const blocks = new BlocksPanePage(page);
  const chatHistory = new ChatHistoryDrawerPage(page);

  await chat.open();
  // Dismiss the first-run prefs modal if the test env has no preferences.json
  // (fresh CI/Docker). No-op when the modal isn't open. Defaults match the
  // initial smoke test (en, age 8) so prefs are consistent across specs.
  await prefs.ensureDismissed();
  // Verify Chat elements on opening the tutor even with existing chats.
  await chat.expectWelcomeVisible();
  await expect(chat.exampleItems()).toHaveCount(3);
  await expect(blocks.blocksEmpty).toBeVisible();
  // Open the chat history and verify there are existing chats (seeded by
  // globalSetup). Wait for the seeded row to actually render before clicking.
  await chatHistory.open();
  await expect(chatHistory.rowByTitle(FULL_CONVERSATION_DATA.title)).toBeVisible();
  await chatHistory.clickChatByTitle(FULL_CONVERSATION_DATA.title);
  // Wait for the loaded conversation to actually render before starting a new
  // chat. clickChatByTitle fires loadChat(id) async and returns immediately;
  // without this wait the #newChatBtn click only happens after loadChat
  // finishes by accident (the drawer backdrop covers the topbar while the
  // drawer is open). If the topbar ever gains a higher z-index, the click
  // would land first and the late loadChat fetch would overwrite #welcome.
  await expect(chat.lastAssistantBubble()).toContainText(/WeDo/i);
  await chat.newChatBtn.click();
  // Verify Chat elements on new chat start.
  await chat.expectWelcomeVisible();
  await expect(chat.exampleItems()).toHaveCount(3);
  await expect(chat.input).toHaveValue("");
  await expect(blocks.blocksEmpty).toBeVisible();

});

test('user can delete a chat @mock', async ({ page }) => {
  const chat = new ChatPage(page);
  const prefs = new PreferencesModalPage(page);
  const chatHistory = new ChatHistoryDrawerPage(page);

  // Self-contained: seed a throwaway chat (unique title) directly into the
  // shared DB via the factory, then delete it through the UI. This avoids
  // mutating the global seed rows (FULL/MEOW) that other specs rely on, and is
  // order-independent. Date.now() makes the title unique so retries/leftover
  // rows from a failed prior run never collide.
  const throwaway = {
    title: `Delete me ${Date.now()}`,
    lang: 'en',
    turns: FULL_CONVERSATION_DATA.turns,
  };
  const db = createFactory().open();
  try {
    db.insertConversation(throwaway);
  } finally {
    db.close();
  }

  await chat.open();
  await prefs.ensureDismissed();
  await chatHistory.open();
  // Wait for the throwaway row to render before deleting.
  await expect(chatHistory.rowByTitle(throwaway.title)).toBeVisible();
  await chatHistory.deleteChatByTitle(throwaway.title);
  await expect(chatHistory.rowByTitle(throwaway.title)).toHaveCount(0);
});