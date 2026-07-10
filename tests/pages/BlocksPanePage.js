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

  tabs() { return this.loc('#blockTabs .tab'); }
  activeTab() { return this.loc('#blockTabs .tab.active'); }
  renderedSvgs() { return this.loc('#blocksHost svg'); }

  async selectTab(index) {
    await this.tabs().nth(index).click();
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