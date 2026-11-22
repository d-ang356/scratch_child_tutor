"use strict";

// @real Build-help pipeline — NOT mocked. Needs a real OLLAMA_API_KEY (direct
// cloud) or an Ollama daemon that can sign upstream itself.
//
// Verifies the build-help contract end-to-end with the parent toggle ON and
// its OFF behavior, through the WRITTEN chat-message flow:
//
// The server withholds the research-note frame until the model's FIRST real
// content delta, so the whole gather + reasoning window is covered by the
// 🤔 "Thinking…" indicator — the UI shows NO response until the model can
// actually answer. Accordingly the tests AWAIT-SYNCHRONIZE on the network,
// not on wall-clock: Playwright API monitoring is used to ensure the
// /api/chat response arrived AND the full answer was delivered BEFORE any UI
// assertion runs:
//
//   1. page.waitForResponse('**/api/chat') — the API actually responded (200);
//   2. a second waitForResponse gates on the client-driven persistence POST of
//      the ASSISTANT message (/api/chats/:id/messages) — fired exactly when
//      the stream completed and finalize() ran — and asserts the full final
//      content from that POST BODY (research-note marker, scratchblocks fence,
//      extracted blocks) — the network-level truth, independent of rendering;
//   3. only THEN the rendered UI is asserted: the note opens the answer, a
//      right-pane block tab exists and renders actual scratchblocks SVGs, and
//      the composer is re-enabled.
//   4. child-addressing regression (test 1 only): the tutor speaks to the
//      child DIRECTLY (by name), never about them in the third person (a real
//      slip observed with search-phase answers).
//
// TEST 2 (the chip flow, five steps in one test): (1) the checkbox stays
// CHECKED; (2) a NEW chat is started and one of the pre-set example chips is
// clicked — the BUILD-ask chip ("What can we build with WeDo 2.0?"), added so
// a chip can legitimately trigger the online flow; (3) the ONLINE SEARCH flow
// is asserted for the chip-initiated question (note first, program, composer);
// (4) the checkbox is REMOVED in the modal and the change persists; (5) a new
// chat is started AGAIN from the same chip and the answer must carry NO
// research note — the gather, marker frame, and wording all stay out.
//
// Every step uses generous auto-wait timeouts — they AWAIT state changes,
// never sleep. When any assertion fails it is a pipeline regression, not a
// flake: no response/timeout = gather or model path stalled; missing note/
// fence/blocks in the saved message = stream contract broke; no SVG = the
// model never delivered the program; note in the toggle-off answer = gating
// broke. (The child-addressing assertions judge MODEL OUTPUT and can in
// principle flake — that is the point: a slip is caught here.)
// The toggle is restored to false in a finally so the shared serial prefs
// stay as they were.

const { test, expect } = require('@playwright/test');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { BlocksPanePage } = require('../pages/BlocksPanePage');

const BUILD_QUESTION = 'How do I build the official samurai robot with WeDo 2.0?';
const CHILD_NAME = 'Brian';

// Auto-wait budgets (cloud streams can take tens of seconds) — waits, not sleeps.
const API_TIMEOUT = 120000;
const UI_TIMEOUT = 30000;

function setPrefs(page, buildHelp) {
  return page.request.post('/api/preferences', {
    data: { lang: 'en', age: 8, name: CHILD_NAME, gender: 'unspecified', buildHelp },
  });
}

// The /api/chat SSE response arrives with its headers, but Playwright cannot
// re-buffer a streamed body — so the authoritative end-of-answer signal is
// the client-driven persistence POST of the ASSISTANT message (fired when the
// stream completed and finalize() ran); its request body carries the FULL
// final content. Both gates must be armed BEFORE the question is sent.
function awaitAssistantSaved(page, timeout = API_TIMEOUT) {
  return page.waitForResponse(
    (r) => r.url().includes('/api/chats/') && r.request().method() === 'POST' &&
      (r.request().postData() || '').includes('"role":"assistant"'),
    { timeout }
  );
}

// Post-answer UI sanity: the Thinking indicator is gone (the answer replaced
// it), the turn finished (Send button back), and nothing errored.
async function ensureComposerDone(chat, bubble) {
  await expect(chat.thinkingIndicator()).toHaveCount(0, { timeout: UI_TIMEOUT });
  const text = await bubble.innerText();
  expect(text.trim().length).toBeGreaterThan(0);
  expect(text).not.toMatch(/Connection lost/);
  await expect(chat.sendBtn).toBeEnabled({ timeout: UI_TIMEOUT });
}

test.describe('Build-help pipeline (real Ollama API) @real', () => {
  test('API response delivers note + program, then the UI shows them @real', async ({ page }) => {
    test.setTimeout(240000);

    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);
    const blocks = new BlocksPanePage(page);

    // Turn the parent toggle on straight through the API (the checkbox UI
    // round-trip is covered by the @mock buildSearch spec). The child's name
    // is set so the teacher prompt has it available for direct addressing.
    const setRes = await setPrefs(page, true);
    expect(setRes.ok()).toBeTruthy();

    try {
      await chat.open();
      await prefs.ensureDismissed(); // no-op: prefs now exist
      await chat.expectOllamaConnected();

      // API monitoring #1: the /api/chat SSE RESPONSE itself — the API
      // actually answered (headers + 200).
      const chatRespPromise = page.waitForResponse(
        (r) => r.url().endsWith('/api/chat') && r.status() === 200,
        { timeout: API_TIMEOUT }
      );
      // API monitoring #2 (the completion gate).
      const savedMsgPromise = awaitAssistantSaved(page);

      await chat.fillQuestion(BUILD_QUESTION);
      await chat.send();

      // --- 1. The API responded. ---
      const resp = await chatRespPromise;
      expect(resp.ok()).toBeTruthy();

      // --- 2. The API delivered the FULL answer (awaits stream end + finalize,
      //        then asserts the persisted assistant content directly). ---
      const savedMsg = await savedMsgPromise;
      const savedBody = JSON.parse(savedMsg.request().postData());
      expect(savedBody.role).toBe('assistant');
      expect(savedBody.content).toContain('I did a quick web check'); // research note frame
      expect(savedBody.content).toContain('scratchblocks'); // the fenced program
      expect(savedBody.blocks).toBeTruthy(); // finalize extracted the program

      // --- 3. NOW assert what the UI rendered. ---
      // Thinking must be gone (the note itself is content, so it was replaced
      // once the model's answer started).
      await expect(chat.thinkingIndicator()).toHaveCount(0, { timeout: UI_TIMEOUT });

      const bubble = chat.lastAssistantBubble();
      await expect(bubble).toContainText(/🔎/, { timeout: UI_TIMEOUT });
      await expect(bubble).toContainText(/LEGO Education/i, { timeout: UI_TIMEOUT });
      // The note is the answer's opening line.
      expect((await bubble.innerText()).indexOf('🔎')).toBe(0);

      // The program really rendered in the right pane.
      await expect(blocks.tabs()).toHaveCount(1, { timeout: UI_TIMEOUT });
      await blocks.expectBlocksRendered();

      // finalize ran; composer back to Send, no error banner.
      await expect(chat.sendBtn).toBeEnabled({ timeout: UI_TIMEOUT });
      const text = await bubble.innerText();
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toMatch(/Connection lost/);

      // --- 4. Child-addressing regression: the tutor talks WITH the child, in
      // the second person and by name, never ABOUT them in the third person
      // ("the child", "Brian is a…"). Model-output assertions by design.
      await expect(bubble).toContainText(new RegExp(CHILD_NAME), { timeout: UI_TIMEOUT });
      expect(text).not.toMatch(/\bthe child\b/i);
    } finally {
      // Restore the toggle off so the shared serial prefs stay as they were.
      const resetRes = await setPrefs(page, false);
      expect(resetRes.ok()).toBeTruthy();
    }
  });

  test('example chip: online search ON with the checkbox, OFF after removing it @real', async ({ page }) => {
    test.setTimeout(300000);

    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);

    // 0. Setup with the checkbox CHECKED — it stays on for the first chip flow.
    const setRes = await setPrefs(page, true);
    expect(setRes.ok()).toBeTruthy();

    try {
      await chat.open();
      await prefs.ensureDismissed(); // no-op: prefs now exist
      await chat.expectOllamaConnected();

      // 1. The checkbox is checked — assert what the app says it is.
      expect(await prefs.persistedBuildHelp()).toBe(true);

      // 2. Start a new chat and click one of the chips — the BUILD-ask chip
      //    (the one chip that legitimately triggers the online flow).
      await chat.startNewChat();
      const savedChipOn = awaitAssistantSaved(page);
      await chat.clickExample(3); // "What can we build with WeDo 2.0?"

      // 3. Assert the ONLINE SEARCH flow for the chip-initiated question.
      const savedOn = await savedChipOn;
      const bodyOn = JSON.parse(savedOn.request().postData());
      expect(bodyOn.role).toBe('assistant');
      expect(bodyOn.content).toContain('I did a quick web check');
      expect(bodyOn.blocks).toBeTruthy();
      await expect(chat.thinkingIndicator()).toHaveCount(0, { timeout: UI_TIMEOUT });
      const bubbleOn = chat.lastAssistantBubble();
      expect((await bubbleOn.innerText()).indexOf('🔎')).toBe(0);
      await ensureComposerDone(chat, bubbleOn);

      // 4. Remove the checkbox in the modal (the parent action) and prove the
      // persisted prefs dropped the toggle.
      await prefs.openBtn.click();
      await prefs.expectVisible();
      await prefs.setBuildHelp(false);
      await prefs.save();
      expect(await prefs.persistedBuildHelp()).toBe(false);

      // 5. Start a new chat AGAIN from the chip and assert the answer carries
      // no online search.
      await chat.startNewChat();
      const savedChipOff = awaitAssistantSaved(page);
      await chat.clickExample(3); // same chip, toggle now off

      const savedOff = await savedChipOff;
      const bodyOff = JSON.parse(savedOff.request().postData());
      expect(bodyOff.role).toBe('assistant');
      expect(bodyOff.content).not.toContain('I did a quick web check');
      expect(bodyOff.content).not.toContain('🔎');
      await expect(chat.thinkingIndicator()).toHaveCount(0, { timeout: UI_TIMEOUT });
      const bubbleOff = chat.lastAssistantBubble();
      expect((await bubbleOff.innerText()).indexOf('🔎')).toBe(-1);
      await ensureComposerDone(chat, bubbleOff);
    } finally {
      // Restore the toggle off so the shared serial prefs stay as they were.
      const resetRes = await setPrefs(page, false);
      expect(resetRes.ok()).toBeTruthy();
    }
  });

  test('same-chat follow-ups follow the checkbox in BOTH directions @real', async ({ page }) => {
    // Regression for a real user report: a chat opened from the chip WITHOUT
    // the checkbox, then the checkbox was applied and a follow-up typed in the
    // SAME chat — and the answer came without the online search. Cause: the
    // topic classifier judged the follow-up in isolation (no kit words in a
    // short follow-up) -> SCRATCH -> no gather. Fixed by giving the classifier
    // the conversation's OPENING message as one context line. This test pins
    // BOTH directions of the same-chat toggle transition, on the chip flow:
    //   1. checkbox OFF -> chip opens the chat -> answer WITHOUT the note;
    //   2. checkbox turned ON -> typed follow-up in the SAME chat -> note
    //      present (the gather fires for follow-ups);
    //   3. checkbox turned OFF again -> another follow-up -> note absent (the
    //      toggle alone gates, no note can sneak back).
    test.setTimeout(360000);

    const chat = new ChatPage(page);
    const prefs = new PreferencesModalPage(page);

    // 0. Checkbox OFF at the start (the reported state).
    const setRes = await setPrefs(page, false);
    expect(setRes.ok()).toBeTruthy();

    try {
      await chat.open();
      await prefs.ensureDismissed(); // no-op: prefs now exist
      await chat.expectOllamaConnected();

      // 1. Checkbox OFF: chip opens the chat -> regular answer, no note.
      await chat.startNewChat();
      let saved = awaitAssistantSaved(page);
      await chat.clickExample(3); // build-ask chip
      let body = JSON.parse((await saved).request().postData());
      expect(body.role).toBe('assistant');
      expect(body.content).not.toContain('I did a quick web check');
      await ensureComposerDone(chat, chat.lastAssistantBubble());

      // 2. Apply the checkbox in the modal; persisted ON.
      await prefs.openBtn.click();
      await prefs.expectVisible();
      await prefs.setBuildHelp(true);
      await prefs.save();
      expect(await prefs.persistedBuildHelp()).toBe(true);

      // Typed follow-up in the SAME chat — no kit words of its own.
      let savedFollow = awaitAssistantSaved(page);
      await chat.fillQuestion('Now add a battle-cry note right after every sword swing.');
      await chat.send();
      body = JSON.parse((await savedFollow).request().postData());
      expect(body.role).toBe('assistant');
      // THE FIX: the follow-up is judged in the chat's opening context -> the
      // gather fires and the answer carries the note.
      expect(body.content).toContain('I did a quick web check');
      await ensureComposerDone(chat, chat.lastAssistantBubble());

      // 3. Reverse direction: remove the checkbox; the next follow-up must
      // answer WITHOUT the note — the toggle alone gates, even though the
      // conversation context still says "build".
      await prefs.openBtn.click();
      await prefs.expectVisible();
      await prefs.setBuildHelp(false);
      await prefs.save();
      expect(await prefs.persistedBuildHelp()).toBe(false);

      savedFollow = awaitAssistantSaved(page);
      await chat.fillQuestion('Finally add a victory spin at the end of the program.');
      await chat.send();
      body = JSON.parse((await savedFollow).request().postData());
      expect(body.role).toBe('assistant');
      expect(body.content).not.toContain('I did a quick web check');
      await ensureComposerDone(chat, chat.lastAssistantBubble());
    } finally {
      // Restore the toggle off so the shared serial prefs stay as they were.
      const resetRes = await setPrefs(page, false);
      expect(resetRes.ok()).toBeTruthy();
    }
  });
});
