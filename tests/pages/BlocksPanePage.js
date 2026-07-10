"use strict";

// Page object for the right "Scratch blocks" pane.
//
// Selectors:
//   #blockTabs .tab        one tab per assistant answer that contained blocks
//   #blockTabs .tab.active the currently selected tab
//   #blocksHost            rendered scratchblocks SVGs live here (pre.sb -> svg)
//   #blocksEmpty           the empty-state card (hidden once blocks render)
//   #scrollToMsgBtn        the hover "↖" jump-to-message button

const { expect } = require('@playwright/test');
const { BasePage } = require('./BasePage');

class BlocksPanePage extends BasePage {
  get blocksHost() { return this.loc('#blocksHost'); }
  get blocksEmpty() { return this.loc('#blocksEmpty'); }
  get scrollToMsgBtn() { return this.loc('#scrollToMsgBtn'); }
  get tabsWrap() { return this.loc('#blockTabs'); }
  get tabStrip() { return this.loc('#tabStrip'); }
  get tabPrev() { return this.loc('#tabPrev'); }
  get tabNext() { return this.loc('#tabNext'); }

  tabs() { return this.loc('#blockTabs .tab'); }
  activeTab() { return this.loc('#blockTabs .tab.active'); }
  renderedSvgs() { return this.loc('#blocksHost svg'); }

  async selectTab(index) {
    await this.tabs().nth(index).click();
  }

  // Assert the active tab is the Nth answer. The tab label is i18n-localized
  // ("Answer N" in English, "Отговор N" in Bulgarian — see app.js tabLabel), so
  // match either word: the tab-strip scroll tests are about mechanics, not the
  // label language, and must not depend on which language a prior run left in
  // preferences.json.
  async expectActiveTabNumber(n) {
    await expect(this.activeTab()).toHaveText(new RegExp(`^(Answer|Отговор)\\s+${n}\\s*$`));
  }

  // The native scrollbar is hidden on the strip, so a functional proof that the
  // arrow controls (not a scrollbar) are the scroll mechanism is that the strip
  // has no scrollbar width: offsetWidth === clientWidth even when it overflows.
  async tabStripHasNoScrollbar() {
    const { offset, client } = await this.page.evaluate(() => {
      const s = document.getElementById('tabStrip');
      return { offset: s.offsetWidth, client: s.clientWidth };
    });
    return Math.abs(offset - client) < 2;
  }

  // True if tab `index` currently overlaps the strip's visible area (i.e. it has
  // been scrolled into view), so a test can prove the scroller actually reveals
  // a far-away tab rather than just that the element exists in the DOM.
  async tabVisibleInStrip(index) {
    return await this.page.evaluate((i) => {
      const strip = document.getElementById('tabStrip');
      const tab = strip.children[i];
      if (!tab) return false;
      const s = strip.getBoundingClientRect();
      const r = tab.getBoundingClientRect();
      return r.left < s.right - 1 && r.right > s.left + 1;
    }, index);
  }

  // Select tab `index`, click the ↖ jump-to-message button, and wait for the
  // chat pane to smooth-scroll to that answer's message row. Returns the clamped
  // target scrollTop it scrolled to. The ↖ button calls
  // scrollIntoView({block:'start', behavior:'smooth'}) on the active tab's
  // message row; we compute the clamped target (align the row top with the
  // #messages viewport top, clamped to the scrollable range), click ↖, and wait
  // for scrollTop to reach it — robust to both the smooth-animation delay and
  // last-element scroll clamping.
  async jumpToAnswerAndAssert(index) {
    await this.selectTab(index);
    // Measured after tab selection (the right pane re-renders; #messages does
    // not), so the row positions reflect the current layout.
    const target = await this.page.evaluate((i) => {
      const cont = document.getElementById('messages');
      const bubbles = cont.querySelectorAll('.msg.assistant .bubble');
      const row = bubbles[i].parentElement; // .msg wrapper
      const top = row.getBoundingClientRect().top - cont.getBoundingClientRect().top + cont.scrollTop;
      const max = cont.scrollHeight - cont.clientHeight;
      return Math.max(0, Math.min(top, max));
    }, index);
    await this.scrollToMsgBtn.click();
    // scrollIntoView uses behavior:'smooth' — wait for it to settle at target.
    await this.page.waitForFunction(
      (tgt) => Math.abs(document.getElementById('messages').scrollTop - tgt) < 2,
      target,
      { timeout: 5000 }
    );
    return target;
  }

  // Shared assertion: two tabs exist, both render their own blocks when
  // selected, and the ↖ icon navigates to answer 1 / answer 2 respectively.
  // The two scroll targets must differ, proving the icon is tab-aware (option 1
  // vs option 2 navigate to different answers, not always the same message).
  async assertTwoTabsAndJumpIcons() {
    await expect(this.tabs()).toHaveCount(2);
    await this.selectTab(0);
    await this.expectBlocksRendered();
    await this.selectTab(1);
    await this.expectBlocksRendered();
    const target1 = await this.jumpToAnswerAndAssert(0);
    const target2 = await this.jumpToAnswerAndAssert(1);
    expect(target2).toBeGreaterThan(target1);
  }

  async expectBlocksRendered() {
    await expect(this.renderedSvgs().first()).toBeVisible();
    await expect(this.blocksEmpty).toBeHidden();
  }

  async expectEmpty() {
    await expect(this.renderedSvgs()).toHaveCount(0);
    await expect(this.blocksEmpty).toBeVisible();
  }
}

module.exports = { BlocksPanePage };