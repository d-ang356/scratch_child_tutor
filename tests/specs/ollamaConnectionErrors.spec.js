"use strict";

// @mock Ollama connection-error UI states.
//
// The OK / connected state is deliberately NOT mocked here. It stays real in the
// initial smoke test (initial.spec.js -> chat.expectOllamaConnected hits the
// actual /api/health endpoint), so "Ollama connected" is still verified against
// the real server. Mocking it green there would replace the one live server path
// the @mock suite keeps and give false confidence.
//
// These tests mock /api/health ONLY for the error branches the real suite can't
// reach deterministically — you can't reliably make Ollama "down" or "model
// missing" in CI — to prove the UI reacts accordingly. checkHealth (app.js) has
// four branches; three are error/edge states driven here:
//
//   ollamaUp && !modelAvailable -> neutral dot, "model not listed", input ENABLED
//   !ollamaUp                   -> red dot,    "not reachable",     input DISABLED  (else branch)
//   fetch fails                 -> red dot,    "server problem",    input DISABLED  (catch branch)
//
// The behavioral assertion (composer enabled vs disabled) is the point: when
// Ollama is unreachable the input is locked, but when ONLY the model is missing
// the child can still try to ask (the server then surfaces the upstream error).
// The two red-dot tests cover the two distinct code paths (else vs catch) that
// produce the same "disconnected" reaction.
//
// The fourth test is the inverse: /api/health is NOT mocked (the dot is green
// for real), a chat is sent, the model starts thinking, and then the /api/chat
// connection DROPS. Health stays green (the drop is on the chat path, not the
// health path) but the chat answer becomes an error and the composer is
// re-enabled for a retry.
//
// /api/health is a JSON endpoint, so mockOllamaHealthCheck fulfills JSON (not
// SSE — see the helper comment). The fetch-failure test aborts the route, which
// makes the client's `await fetch('/api/health')` reject and lands in the catch.

const { test, expect } = require('@playwright/test');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { mockOllamaHealthCheck, mockChatDrop } = require('../support/mockOllama');

test.describe('Ollama connection error states @mock', () => {
  test('Ollama unreachable -> red dot and composer disabled @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    // ollamaUp:false -> checkHealth's `else` branch: dot bad, "not reachable",
    // input disabled, 5s retry scheduled.
    await mockOllamaHealthCheck(page, false, false);

    await chat.open();
    await prefs.ensureDismissed();

    await chat.expectOllamaDisconnected();
    await expect(chat.sendBtn).toBeDisabled();
    await expect(chat.input).toBeDisabled();
  });

  test('model not listed -> neutral dot but composer still enabled @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    // ollamaUp:true, modelAvailable:false -> the model-missing branch: neutral
    // dot, status line names the model, input ENABLED (the child can still try).
    await mockOllamaHealthCheck(page, true, false);

    await chat.open();
    await prefs.ensureDismissed();

    await chat.expectOllamaModelIssue();
    await expect(chat.sendBtn).toBeEnabled();
    await expect(chat.input).toBeEnabled();
  });

  test('health fetch fails -> red dot and composer disabled @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    // Aborting the route makes fetch('/api/health') reject -> checkHealth's catch
    // branch: dot bad, "Helper server problem", input disabled. bootReady uses
    // Promise.allSettled, so the rejected health fetch still settles and the
    // loading splash clears normally.
    await page.route('**/api/health', (route) => route.abort('failed'));

    await chat.open();
    await prefs.ensureDismissed();

    await chat.expectOllamaDisconnected();
    await expect(chat.sendBtn).toBeDisabled();
    await expect(chat.input).toBeDisabled();
  });

  test('chat drops mid-thinking -> chat error, health stays green @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    // /api/health is NOT mocked here: the dot is green from the REAL endpoint
    // (the cloud short-circuit is green whenever a key — even the dummy
    // mock-dummy-key — is set). Only /api/chat is intercepted, and it DROPS the
    // connection mid-thinking via mockChatDrop.
    const { release } = await mockChatDrop(page);

    await chat.open();
    await prefs.ensureDismissed();

    // Health is green (real) before the chat.
    await chat.expectOllamaConnected();

    // Send a question; the held /api/chat keeps the fetch pending, so the UI
    // shows the "Thinking…" state the model renders immediately on send.
    await chat.fillQuestion('How do I make the cat walk?');
    await chat.send();
    await chat.expectThinking();

    // Drop the connection -> the fetch rejects -> sendChat's catch renders
    // "Connection lost." in the assistant bubble. Bilingual match so the test
    // doesn't depend on which language a prior run left in preferences.json.
    release();
    await expect(chat.lastAssistantBubble()).toContainText(/Connection lost|Връзката прекъсна/);

    // The drop was on the chat path, NOT the health path -> the dot is STILL
    // green and the composer is re-enabled for a retry (finishStream calls
    // enableInput(ollamaOk), and ollamaOk is still true from the green health).
    await chat.expectOllamaConnected();
    await expect(chat.sendBtn).toBeEnabled();
  });

  test('chat HTTP error -> "Could not reach Ollama", composer re-enabled @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    // /api/health is NOT mocked: the dot is green from the real endpoint. Only
    // /api/chat is intercepted, with a 502 + a body — to exercise send()'s
    // `!res.ok` branch (distinct from the AbortError and connLost branches):
    // it reads up to 200 chars of the response body and renders t("ollamaFail"),
    // i.e. "**Could not reach Ollama.** ... `<body>`". The `return` inside try
    // still runs the `finally` -> finishStream -> composer re-enabled.
    await chat.open();
    await prefs.ensureDismissed();
    await chat.expectOllamaConnected();

    await page.route('**/api/chat', (route) => route.fulfill({
      status: 502,
      contentType: 'text/plain',
      body: 'Bad gateway from upstream',
    }));

    await chat.fillQuestion('How do I make the cat walk?');
    await chat.send();

    // The ollamaFail message renders (bilingual so the test is language-agnostic
    // w.r.t. what a prior run left in preferences.json), and the upstream body
    // text is surfaced inside the fenced code span.
    await expect(chat.lastAssistantBubble()).toContainText(/Could not reach Ollama|Не мога да достигна Ollama/);
    await expect(chat.lastAssistantBubble()).toContainText('Bad gateway from upstream');
    // Not the connLost / stopped branches.
    await expect(chat.lastAssistantBubble()).not.toContainText(/Connection lost|Връзка прекъсна|\(stopped\)|\(спряно\)/);

    // Composer re-enabled (finishStream ran via finally); health still green.
    await expect(chat.sendBtn).toBeEnabled();
    await expect(chat.input).toBeEnabled();
    await chat.expectOllamaConnected();
  });
});