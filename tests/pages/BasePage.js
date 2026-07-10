"use strict";

// Base page object. Every other page object derives from this one.
// Holds the Playwright `page` and exposes small shared helpers. Page objects do
// NOT open pages themselves unless asked — tests compose them and drive flow.

const { baseUrl } = require('../support/env');

class BasePage {
  constructor(page) {
    this.page = page;
  }

  get baseUrl() {
    return baseUrl();
  }

  // Navigate to a path under the app base URL (default: the app root).
  async open(path = '/') {
    await this.page.goto(path);
    return this;
  }

  // Shortcut for a locator on this page. Forwards the options arg so callers
  // can use { hasText, has, hasNotText, ... } (Playwright's page.locator
  // accepts it as the 2nd parameter). Dropping it silently breaks filters.
  loc(selector, options) {
    return this.page.locator(selector, options);
  }

  // Shrink the viewport so a multi-answer chat overflows the #messages pane —
  // otherwise the ↖ jump-to-message navigation has nothing to scroll. Call after
  // open() (which already cleared the loading splash) so the splash is not
  // affected. Default 1280x440 fits the app layout while forcing two answers to
  // overflow; override for other scenarios.
  async shrinkViewport({ width = 1280, height = 440 } = {}) {
    await this.page.setViewportSize({ width, height });
    return this;
  }
}

module.exports = { BasePage };