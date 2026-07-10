"use strict";


const { test, expect } = require('@playwright/test');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { BlocksPanePage } = require('../pages/BlocksPanePage');
const { ChatHistoryDrawerPage} = require('../pages/ChatHistoryDrawerPage');
const { mockChatAnswer } = require('../support/mockOllama');

const { createFactory } = require('../support/sqliteFactory');
const { FULL_CONVERSATION_DATA, MEOW_CONVERSATION_DATA } = require('../utils/testConstants');

test.beforeAll(async () => { 
  const db = createFactory().open();
  db.clear();
  db.insertConversation(FULL_CONVERSATION_DATA);
  db.insertConversation(MEOW_CONVERSATION_DATA);
  db.close();
});

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
   // Verify Chat elements on opening the tutor even with existing chats
  await chat.expectWelcomeVisible();
  await expect(chat.exampleItems()).toHaveCount(3);
  let items = await chat.exampleItems().all();
  for (const item of items ) {
    await expect(item).toBeEnabled();
  };
  await expect(chat.input).toHaveValue("");
  await expect(blocks.blocksEmpty).toBeVisible();
  // Open the chat history and verify there are existing chats
  await chatHistory.open();
  // Wait for the seeded row to actually render before clicking. open() only
  // waits for the drawer aside to be visible, not for refreshChatList()'s
  // async fetch to populate #chatList.
  await expect(chatHistory.rowByTitle(FULL_CONVERSATION_DATA.title)).toBeVisible();
  await chatHistory.clickChatByTitle(FULL_CONVERSATION_DATA.title);
  await chat.newChatBtn.click();
  // Verify Chat elements on new chat starts
  await chat.expectWelcomeVisible();
  await expect(chat.exampleItems()).toHaveCount(3);
  items = await chat.exampleItems().all();
  for (const item of items ) {
    await expect(item).toBeEnabled();
  };
  await expect(chat.input).toHaveValue("");
  await expect(blocks.blocksEmpty).toBeVisible();

});

test('user can delete a chat @mock', async ({ page }) => {
  const chat = new ChatPage(page);
  const prefs = new PreferencesModalPage(page);
  const blocks = new BlocksPanePage(page);
  const chatHistory = new ChatHistoryDrawerPage(page);

  await chat.open();
  // Dismiss the first-run prefs modal if the test env has no preferences.json
  // (fresh CI/Docker). No-op when the modal isn't open. Defaults match the
  // initial smoke test (en, age 8) so prefs are consistent across specs.
  await prefs.ensureDismissed();
   // Verify Chat elements on opening the tutor even with existing chats
   await chatHistory.open();
  // Wait for the seeded row to actually render before clicking. open() only
  // waits for the drawer aside to be visible, not for refreshChatList()'s
  // async fetch to populate #chatList.
  const targetChatTitle = MEOW_CONVERSATION_DATA.title;
  await expect(chatHistory.rowByTitle(FULL_CONVERSATION_DATA.title)).toBeVisible()
  await expect(chatHistory.rowByTitle(targetChatTitle)).toBeVisible()
  await chatHistory.deleteChatByTitle(targetChatTitle);
  await expect(chatHistory.rowByTitle(targetChatTitle)).not.toBeVisible();
});