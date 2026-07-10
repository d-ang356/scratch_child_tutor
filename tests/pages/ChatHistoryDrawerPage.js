"use strict";

// Page object for the "Your chats" / "Твоите чатове" history drawer.
//
// Selectors:
//   #chatsBtn              top-bar button that toggles the drawer
//   #chatDrawer            the drawer aside (hidden attribute toggles visibility)
//   #chatBackdrop          the scrim behind the drawer
//   #drawerClose           the drawer's × button
//   #chatList .chat-row    one row per saved chat
//   .chat-title / .chat-time / .chat-del  row title / time / delete button
//   .drawer-empty          the empty-state message

const { expect } = require('@playwright/test');
const { BasePage } = require('./BasePage');

class ChatHistoryDrawerPage extends BasePage {
  get openBtn() { return this.loc('#chatsBtn'); }
  get drawer() { return this.loc('#chatDrawer'); }
  get backdrop() { return this.loc('#chatBackdrop'); }
  get closeBtn() { return this.loc('#drawerClose'); }

  chatRows() { return this.loc('#chatList .chat-row'); }
  emptyState() { return this.loc('#chatList .drawer-empty'); }

  async open() {
    await this.openBtn.click();
    await expect(this.drawer).toBeVisible();
  }

  async close() {
    await this.closeBtn.click();
    await expect(this.drawer).toBeHidden();
  }

  async expectVisible() { await expect(this.drawer).toBeVisible(); }
  async expectHidden() { await expect(this.drawer).toBeHidden(); }

  rowByTitle(title) {
    return this.loc('#chatList .chat-row', { hasText: title });
  }

  async clickChatByTitle(title) {
    await this.rowByTitle(title).click();
  }

  async deleteChatByTitle(title) {
    // Accept the confirm() dialog, then click the row's ✕.
    this.page.once('dialog', (d) => d.accept());
    await this.rowByTitle(title).locator('.chat-del').click();
  }

  async expectEmpty() {
    await expect(this.emptyState()).toBeVisible();
  }
}

module.exports = { ChatHistoryDrawerPage };