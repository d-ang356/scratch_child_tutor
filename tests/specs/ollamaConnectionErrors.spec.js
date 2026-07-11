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
// /api/health is a JSON endpoint, so mockOllamaHealthCheck fulfills JSON (not
// SSE — see the helper comment). The fetch-failure test aborts the route, which
// makes the client's `await fetch('/api/health')` reject and lands in the catch.

const { test, expect } = require('@playwright/test');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { mockOllamaHealthCheck } = require('../support/mockOllama');

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
});