"use strict";

// @mock Build-help PREFERENCE persistence only.
//
// The preferences modal's #pBuildHelp checkbox round-trips through
// /api/preferences (POST on save, GET after reload) — same pattern as
// gender.spec. Default is OFF (unchecked), matching sanitizePrefs.
//
// NOTE: do NOT add chat-path tests for the toggle here. @mock intercepts
// /api/chat at the browser boundary, so the server (classifier + approved-
// source gather) never runs — with the toggle on AND off the answer would be
// the SAME canned mock text, so "WeDo tab / WeDo text" assertions would
// compare the mock against itself and prove nothing (they were removed). The
// real pipeline + the research-note answer contract is covered by
// tests/real/buildHelpReal.spec.js (needs a key + real model).

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { prefsPath } = require('../support/env');
const { mockChatPartialThenHold } = require('../support/mockOllama');

const PREFS_PATH = prefsPath();

test.describe('Build help preference (approved-source gather opt-in) @mock', () => {
  test('the build-help toggle persists across reload, default OFF @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);

    // Force a first-run state so the DEFAULT is what gets saved and we can
    // prove the checkbox is off by default (mirrors gender.spec's approach).
    try { fs.unlinkSync(PREFS_PATH); } catch (e) { /* absent — fine */ }

    await chat.open();
    // First-run modal: default age is empty, so fill it; leave the toggle
    // UNCHECKED and confirm the persisted default is false.
    await prefs.expectVisible();
    await prefs.setAge(8);
    await prefs.save();
    expect(await prefs.persistedBuildHelp()).toBe(false);

    // Reload (re-shows the splash), reopen the modal, turn the toggle ON,
    // and verify it round-trips through preferences.json.
    await page.reload();
    await chat.expectSplashGone();
    await prefs.openBtn.click();
    await prefs.expectVisible();
    await prefs.setBuildHelp(true);
    await prefs.save();
    await prefs.expectHidden();
    expect(await prefs.persistedBuildHelp()).toBe(true);

    // Reload again: the saved pref drives the checkbox, not the default.
    await page.reload();
    await chat.expectSplashGone();
    await prefs.openBtn.click();
    await prefs.expectVisible();
    await expect(prefs.buildHelpInput).toBeChecked();

    // Restore OFF so later specs (shared serial prefs) run with the toggle off.
    await prefs.setBuildHelp(false);
    await prefs.save();
    expect(await prefs.persistedBuildHelp()).toBe(false);
  });

  test('thinking indicator reads "doing online search" while the search runs @mock', async ({ page }) => {
    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);

    // The mock replays the marker frame the real server sends only when the
    // Build-help gather actually starts ({delta:{search:true}}), then holds
    // the stream open — exactly the "search still running" window. Registered
    // BEFORE chat.open() (addInitScript applies to the next navigation).
    await mockChatPartialThenHold(page, { search: true });

    await chat.open();
    await prefs.ensureDismissed();

    await prefs.openBtn.click();
    await prefs.expectVisible();
    await prefs.setBuildHelp(true);
    await prefs.save();

    await chat.fillQuestion('Как да направя самурай робот с WeDo 2.0?');
    await chat.send();

    // While the stream is held: the Thinking indicator (🤔 + dots) is still up
    // — NOTHING is ever rendered instead of it — and its text switched to the
    // online-search wording (t("statusThinkingSearch"); bilingual match so the
    // test doesn't depend on which language prefs left behind).
    const thinking = chat.thinkingIndicator();
    await expect(thinking).toBeVisible({ timeout: 5000 });
    await expect(thinking).toContainText(/online search|онлайн справка/i, { timeout: 5000 });

    // During the held search phase nothing else has been streamed — the
    // bubble (which hosts the indicator) carries no answer content yet, and
    // the button is in its Stop state.
    await expect(chat.lastAssistantBubble()).not.toContainText(/scratchblocks|Connection lost|Връзката прекъсна/, { timeout: 2000 });
    await expect(chat.sendBtn).toContainText(/Stop|Стоп/);

    // End the turn the real way — the child pressing Stop mid-search aborts
    // the stream: the composer re-enables back to Send and shows the stopped
    // marker without answer content.
    await chat.stop();
    await expect(chat.sendBtn).toContainText(/Send|Изпрати/, { timeout: 5000 });
    await expect(chat.lastAssistantBubble()).toContainText(/stopped|спряно/i);

    // Restore OFF so later specs (shared serial prefs) run with the toggle off.
    await prefs.openBtn.click();
    await prefs.expectVisible();
    await prefs.setBuildHelp(false);
    await prefs.save();
  });
});
