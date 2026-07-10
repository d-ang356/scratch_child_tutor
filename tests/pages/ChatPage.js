"use strict";

// Page object for the left chat pane + top bar status.
//
// Selectors mirror public/index.html and public/app.js:
//   #messages              chat transcript container
//   #welcome               initial welcome card (with #examples chips)
//   #examples li[data-q]   predefined suggestion chips
//   #input / #sendBtn      composer
//   #statusDot / #statusText  Ollama health indicator
//   .msg.user / .msg.assistant  message rows; .bubble is the content node

const { expect } = require('@playwright/test');
const { BasePage } = require('./BasePage');

class ChatPage extends BasePage {
  get welcome() { return this.loc('#welcome'); }
  get input() { return this.loc('#input'); }
  get sendBtn() { return this.loc('#sendBtn'); }
  get statusDot() { return this.loc('#statusDot'); }
  get statusText() { return this.loc('#statusText'); }
  get newChatBtn() { return this.loc('#newChatBtn'); }

  exampleItems() { return this.loc('#examples li[data-q]'); }
  userBubbles() { return this.loc('#messages .msg.user .bubble'); }
  assistantBubbles() { return this.loc('#messages .msg.assistant .bubble'); }
  lastUserBubble() { return this.userBubbles().last(); }
  lastAssistantBubble() { return this.assistantBubbles().last(); }

  // The "Thinking…" indicator (app.js thinkingHTML): a `.thinking` div rendered
  // into the assistant bubble immediately on send, BEFORE the fetch, and
  // replaced once content/reasoning arrives. Asserting it proves the model is
  // in the thinking state before it produces an answer.
  thinkingIndicator() { return this.lastAssistantBubble().locator('.thinking'); }

  async expectWelcomeVisible() {
    await this.welcome.waitFor({ state: 'visible' });
  }

  // Assert the model is currently "thinking" (the indicator in the last
  // assistant bubble is visible). Use a gated mock (mockChatAnswer hold:true)
  // so the response is held until you assert this, otherwise the indicator is
  // replaced too fast to observe.
  async expectThinking(timeout = 5000) {
    await expect(this.thinkingIndicator()).toBeVisible({ timeout });
  }

  // The status dot turns green (class "ok") once /api/health reports connected.
  async expectOllamaConnected(timeout = 15000) {
    await expect(this.statusDot).toHaveClass(/(^|\s)ok(\s|$)/, { timeout });
  }

  async expectOllamaDisconnected(timeout = 15000) {
    await expect(this.statusDot).toHaveClass(/(^|\s)bad(\s|$)/, { timeout });
  }

  async clickExample(index) {
    await this.exampleItems().nth(index).click();
  }

  async fillQuestion(text) {
    await this.input.fill(text);
  }

  async send() {
    await this.sendBtn.click();
  }

  async startNewChat() {
    await this.newChatBtn.click();
  }
}

module.exports = { ChatPage };