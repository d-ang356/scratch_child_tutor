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
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { prefsPath, baseUrl } = require('../support/env');

// preferences.json as the app sees it: prefsPath() (tests/support/env.js). The
// app and this spec resolve the SAME path — locally a throwaway file under
// test-data/, in Docker /data/preferences.json on the shared dbdata volume — so
// deleting it here resets the app's actual prefs.
const PREFS_PATH = prefsPath();

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

  test('boot does not flash the English logo when saved language is Bulgarian @mock', async ({ page }) => {
    // Regression guard for the splash-logo flash. The server injects logo_bg.png
    // into index.html (first paint = BG). The old boot flow then called
    // applyI18n("en") BEFORE loadPreferences() resolved, which set splashLogo.src
    // to logo_en.png -> a brief English flash -> back to BG once prefs loaded.
    //
    // We hold /api/preferences GET so loadPreferences() has NOT re-synced the
    // logo yet, navigate (load event only — not chat.open(), which awaits the
    // splash clearing and thus the held prefs), then read the runtime src. The
    // boot script has run synchronously before 'load', so at this instant the src
    // is whatever the boot left it as. It must be the server-injected BG logo,
    // NOT the English default a boot-time applyI18n("en") would have set.
    fs.writeFileSync(PREFS_PATH, JSON.stringify({ lang: 'bg', age: 8, name: '', gender: 'unspecified' }));
    await page.route('**/api/preferences', async (route) => {
      if (route.request().method() !== 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
      // Hold the GET long enough that we read the src before it resolves.
      await new Promise((r) => setTimeout(r, 2000));
      try {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ present: true, prefs: { lang: 'bg', age: 8, name: '', gender: 'unspecified' } }),
        });
      } catch (e) { /* page closed mid-delay — fine */ }
    });

    await page.goto(baseUrl()); // waits for 'load' only; prefs fetch still pending

    const src = await page.evaluate(() => document.getElementById('splashLogo').getAttribute('src'));
    expect(src).toContain('/img/logo_bg.png');
    expect(src).not.toContain('logo_en');
  });
});