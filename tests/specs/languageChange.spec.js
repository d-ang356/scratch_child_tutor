"use strict";

// @mock language switching via the preferences modal.
//
// This is the focused replacement for a full Bulgarian end-to-end UI walk: it
// verifies the one behavior that actually matters for i18n correctness — that
// changing the language in the preferences modal re-translates the UI
// (applyI18n runs on save) and that the choice persists across a reload
// (preferences.json). #chatsBtn (data-i18n="chats") is a stable, always-visible
// probe: "Chats" in EN, "Чатове" in BG.
//
// preferences.json is deleted in beforeEach to force a clean first-run state,
// so the start language is deterministically EN (we pick it in the modal) no
// matter what a prior run left behind — mirroring initial.spec.js.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { prefsPath } = require('../support/env');

const PREFS_PATH = prefsPath();

test.beforeEach(async () => {
  // Guarantee a clean first-run state so the start language is EN by choice,
  // not whatever a prior run persisted.
  try { fs.unlinkSync(PREFS_PATH); } catch (e) { /* already absent */ }
});

test('changing the language in preferences re-translates the UI and persists @mock', async ({ page }) => {
  const chat = new ChatPage(page);
  const prefs = new PreferencesModalPage(page);

  await chat.open();
  // First run: pick English explicitly so the start language is deterministic.
  await expect(prefs.modal).toBeVisible();
  await prefs.selectLang('en');
  await prefs.selectGender('unspecified');
  await prefs.setAge(8);
  await prefs.save();

  // EN: the top-bar "Chats" button reads "Chats".
  await expect(chat.chatsBtn).toHaveText('Chats');

  // Switch to Bulgarian via the preferences modal. Saving calls applyI18n(bg),
  // which re-translates every data-i18n element immediately — no reload needed.
  await prefs.openBtn.click();
  await expect(prefs.modal).toBeVisible();
  await prefs.selectLang('bg');
  await prefs.save();

  // BG: the same button now reads "Чатове".
  await expect(chat.chatsBtn).toHaveText('Чатове');

  // The choice persists across a reload (preferences.json): the server injects
  // the BG splash logo and applyI18n(bg) runs on boot, so the button is still
  // "Чатове" after the refresh.
  await chat.open();
  await expect(chat.chatsBtn).toHaveText('Чатове');

  // Switch back to English and confirm it re-translates again.
  await prefs.openBtn.click();
  await expect(prefs.modal).toBeVisible();
  await prefs.selectLang('en');
  await prefs.save();
  await expect(chat.chatsBtn).toHaveText('Chats');
});