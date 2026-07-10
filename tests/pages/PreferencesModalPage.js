"use strict";

// Page object for the preferences modal (#prefsModal).
//
// On first run (no preferences.json) the modal is forced open and cannot be
// dismissed until a valid age is saved (app.js openPrefs(forceFirst) sets
// data-first="1" and closePrefs refuses while it is set).
//
// Selectors:
//   #prefsModal            the overlay (hidden attribute toggles visibility)
//   input[name="pLang"]    language radios (en / bg)
//   input[name="pGender"]  gender radios (boy / girl / unspecified; unspecified
//                          is pre-checked, so the field is always set)
//   #pAge / #pName         age + name inputs
//   #pAgeErr               inline age validation error
//   #prefsForm button.primary  the Save button (submits the form)

const { expect } = require('@playwright/test');
const { BasePage } = require('./BasePage');

class PreferencesModalPage extends BasePage {
  get modal() { return this.loc('#prefsModal'); }
  get openBtn() { return this.loc('#prefsBtn'); }
  get ageInput() { return this.loc('#pAge'); }
  get nameInput() { return this.loc('#pName'); }
  get ageError() { return this.loc('#pAgeErr'); }
  get saveBtn() { return this.loc('#prefsForm button.primary'); }
  get cancelBtn() { return this.loc('#prefsCancel'); }
  get closeBtn() { return this.loc('#prefsClose'); }

  async expectVisible() { await expect(this.modal).toBeVisible(); }
  async expectHidden() { await expect(this.modal).toBeHidden(); }

  async isFirstRun() {
    return (await this.modal.getAttribute('data-first')) === '1';
  }

  async selectLang(value) {
    await this.loc(`input[name="pLang"][value="${value}"]`).check();
  }

  async selectGender(value) {
    await this.loc(`input[name="pGender"][value="${value}"]`).check();
  }

  async setAge(n) {
    await this.ageInput.fill(String(n));
  }

  async setName(name) {
    await this.nameInput.fill(name);
  }

  // Save and wait for the modal to close.
  async save() {
    await this.saveBtn.click();
    await expect(this.modal).toBeHidden();
  }

  // Read the persisted gender straight from the server (not the UI), so a test
  // proves the value round-tripped through preferences.json, not just that the
  // radio stayed selected. Returns body.prefs.gender (or null if absent).
  async persistedGender() {
    const res = await this.page.request.get('/api/preferences');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    return body && body.prefs ? body.prefs.gender : null;
  }

  async cancel() {
    await this.cancelBtn.click();
  }

  // For every spec EXCEPT the initial one: dismiss the first-run prefs modal if
  // it happens to be open (no preferences.json yet — e.g. a fresh CI/Docker
  // env, or someone deleted preferences.json). If the modal isn't open, this
  // is a no-op so the spec continues. Defaults mirror initial.spec.js
  // (lang 'en', age 8, gender 'unspecified' — matching the pre-checked radio so
  // the field is always set without forcing a choice). Waits briefly for the
  // modal to mount on load before deciding, since the app opens it
  // synchronously after loadPreferences().
  async ensureDismissed({ lang = 'en', age = 8, name, gender = 'unspecified' } = {}) {
    const opened = await this.modal
      .waitFor({ state: 'visible', timeout: 1000 })
      .then(() => true)
      .catch(() => false);
    if (!opened) return this;
    await this.selectLang(lang);
    await this.selectGender(gender);
    await this.setAge(age);
    if (name) await this.setName(name);
    await this.save();
    return this;
  }
}

module.exports = { PreferencesModalPage };