"use strict";

// @mock gender-preference round-trip. Verifies the gender field in the
// preferences modal persists through /api/preferences (POST on save, GET after
// reload). /api/chat is never triggered, so no model and no API key are needed
// — this is a deterministic UI/persistence test, not a model-behavior test.
//
// The gender radios are input[name="pGender"] with values boy / girl /
// unspecified. "unspecified" (the "Prefer not to say" option) is pre-checked in
// index.html, so the field always has a value even on first run.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { prefsPath } = require('../support/env');

// preferences.json as the app sees it: prefsPath() (tests/support/env.js). The
// app and this spec resolve the SAME path — locally a throwaway file under
// test-data/, in Docker /data/preferences.json on the shared dbdata volume —
// so unlinking it here resets the app's actual prefs. Without that shared path
// this unlink is a no-op against the app and the "default persists" test fails
// (the app still holds a prior spec's gender).
const PREFS_PATH = prefsPath();

test.describe('Gender preference round-trip @mock', () => {
  test('a selected gender persists across reload @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);

    await chat.open();
    // Creates preferences.json if absent (default gender 'unspecified'); a
    // no-op when prefs already exist.
    await prefs.ensureDismissed();

    // Open the modal via the ⚙️ button and choose "Girl".
    await prefs.openBtn.click();
    await prefs.expectVisible();
    await prefs.selectGender('girl');
    await prefs.save();
    await prefs.expectHidden();

    // Persisted server-side.
    expect(await prefs.persistedGender()).toBe('girl');

    // Reload: the app reads the saved prefs, so the modal stays closed and the
    // API still reports 'girl'. The reload re-shows the loading splash, so wait
    // for it to clear before asserting.
    await page.reload();
    await chat.expectSplashGone();
    await expect(prefs.modal).toBeHidden();
    expect(await prefs.persistedGender()).toBe('girl');
  });

  test('the default "Prefer not to say" persists @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);

    // Guarantee a first-run state so the pre-checked "Prefer not to say" radio
    // is what gets saved — a prior spec (e.g. the "girl" test above) may have
    // left another gender in preferences.json, and ensureDismissed is a no-op
    // when prefs already exist. Deleting the file forces the first-run modal,
    // which opens with 'unspecified' pre-checked.
    try { fs.unlinkSync(PREFS_PATH); } catch (e) { /* absent — fine */ }

    await chat.open();
    // First-run modal is open with the pre-checked 'unspecified' radio; saving
    // without changing gender persists that default.
    await prefs.ensureDismissed();
    expect(await prefs.persistedGender()).toBe('unspecified');

    // Reopen, keep "Prefer not to say" selected, save, and confirm it persists.
    await prefs.openBtn.click();
    await prefs.expectVisible();
    await prefs.selectGender('unspecified');
    await prefs.save();
    await prefs.expectHidden();
    expect(await prefs.persistedGender()).toBe('unspecified');
  });
});