"use strict";

// @mock splash logo matches the saved language from the very first paint.
//
// server.js injects the saved language's splash logo into index.html BEFORE
// serving it, so a refresh with the saved language set to Bulgarian shows
// logo_bg.png on the first paint — no brief English-logo flash before app.js's
// applyI18n() swaps it. (The markup hardcodes logo_en.png; without the injection
// the browser paints that, then loadPreferences() resolves and applyI18n()
// swaps it — visible as a flash when the saved language is BG.)
//
// These tests verify the injection directly against the served HTML (no browser
// timing), for both languages and for the no-prefs first-run default (English).
// /api/chat is intercepted (so no model call), but /api/preferences and / (the
// served index.html) hit the real server — that is what we are testing.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');

// preferences.json as the app sees it (server.js: path.join(__dirname,
// 'preferences.json'); the app runs from the repo root, same as the test cwd).
const PREFS_PATH = path.join(__dirname, '..', '..', 'preferences.json');

// POST preferences with a given language (age is required by the server), then
// fetch the served index.html and return the splash logo src it was injected
// with. Goes through the real /api/preferences and / endpoints.
async function servedSplashLogoSrc(page, lang) {
  await page.request.post('/api/preferences', {
    data: { lang, age: 8, name: '', gender: 'unspecified' },
  });
  const res = await page.request.get('/');
  expect(res.ok()).toBeTruthy();
  const html = await res.text();
  const m = html.match(/id="splashLogo"[^>]*src="([^"]*)"/);
  return m ? m[1] : null;
}

test.describe('Splash logo matches saved language @mock', () => {
  test.afterEach(async () => {
    // These tests write preferences.json through the real endpoint; delete it
    // afterward so the suite leaves no prefs state behind for the next run.
    try { fs.unlinkSync(PREFS_PATH); } catch (e) { /* absent — fine */ }
  });

  test('Bulgarian prefs -> logo_bg.png in the served splash @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    await chat.open();
    await prefs.ensureDismissed();
    expect(await servedSplashLogoSrc(page, 'bg')).toBe('/img/logo_bg.png');
  });

  test('English prefs -> logo_en.png in the served splash @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    await chat.open();
    await prefs.ensureDismissed();
    expect(await servedSplashLogoSrc(page, 'en')).toBe('/img/logo_en.png');
  });

  test('no preferences -> logo_en.png (first-run default) @mock', async ({ page }) => {
    // Guarantee a first-run state: no preferences.json means readPrefs() returns
    // null and the server injects the English (default) logo.
    try { fs.unlinkSync(PREFS_PATH); } catch (e) { /* absent — fine */ }
    const chat = new ChatPage(page);
    await chat.open(); // opens with the first-run modal; we do not dismiss it
    const res = await page.request.get('/');
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    const m = html.match(/id="splashLogo"[^>]*src="([^"]*)"/);
    expect(m ? m[1] : null).toBe('/img/logo_en.png');
  });
});