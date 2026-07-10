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
//   #pAge / #pName         age + name inputs
//   #pAgeErr               inline age validation error
//   #prefsForm button.primary  the Save button (submits the form)

const { expect } = require('@playwright/test');
const { BasePage } = require('./BasePage');

class PreferencesModalPage extends BasePage {
  get modal() { return this.loc('#prefsModal'); }
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

  async cancel() {
    await this.cancelBtn.click();
  }

  // For every spec EXCEPT the initial one: dismiss the first-run prefs modal if
  // it happens to be open (no preferences.json yet — e.g. a fresh CI/Docker
  // env, or someone deleted preferences.json). If the modal isn't open, this
  // is a no-op so the spec continues. Defaults mirror initial.spec.js
  // (lang 'en', age 8). Waits briefly for the modal to mount on load before
  // deciding, since the app opens it synchronously after loadPreferences().
  async ensureDismissed({ lang = 'en', age = 8, name } = {}) {
    const opened = await this.modal
      .waitFor({ state: 'visible', timeout: 1000 })
      .then(() => true)
      .catch(() => false);
    if (!opened) return this;
    await this.selectLang(lang);
    await this.setAge(age);
    if (name) await this.setName(name);
    await this.save();
    return this;
  }
}

module.exports = { PreferencesModalPage };