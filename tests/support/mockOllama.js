"use strict";

// Playwright route-interception helpers for /api/chat.
//
// page.route fulfills the browser's POST /api/chat AT THE BROWSER BOUNDARY — the
// request never reaches the server, so the server-side topic classifier and the
// upstream Ollama call do NOT run. That makes @mock tests deterministic and free
// (no API key, no tokens, no network). The health check (/api/health) is NOT
// intercepted, so "Ollama is connected" is still verified against the real
// server (green in cloud mode whenever a key — even a dummy — is set).

// A canned tutor answer that contains a fenced scratchblocks block, so the
// frontend creates a right-pane tab and renders SVGs — exactly what the initial
// smoke test needs to assert "a chat started with blocks".
const SCRATCH_ANSWER = [
  "Here's how to make the cat walk and say hello!",
  "",
  "1. Drag a **when green flag clicked** block from the **Events** palette (top).",
  "2. Add a **move [10] steps** block from the **Motion** palette.",
  "3. Add a **say [Hello!] for [2] seconds** block from the **Looks** palette.",
  "",
  "```scratchblocks",
  "when green flag clicked",
  "move [10] steps",
  "say [Hello!] for [2] seconds",
  "```",
  "",
].join("\n");

function sse(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function fulfillSSE(route, body) {
  return route.fulfill({
    status: 200,
    contentType: 'text/event-stream; charset=utf-8',
    headers: { 'Cache-Control': 'no-store' },
    body,
  });
}

// Intercept /api/chat with a canned answer (optionally preceded by a reasoning
// delta, to exercise the "Thinking…" path the way glm-5.2 does).
//
// opts.hold: when true, the response is NOT fulfilled until you call the
// returned `release()`. Use this to assert the "Thinking…" indicator (set
// before the fetch) before the answer streams in — without it the mock
// fulfills instantly and the indicator is replaced before you can observe it.
// Always returns `{ release }`; release is a no-op when hold is false, so
// existing callers that ignore the return value are unaffected.
async function mockChatAnswer(page, opts = {}) {
  const content = opts.content != null ? opts.content : SCRATCH_ANSWER;
  const reasoning = opts.reasoning || '';
  const body =
    (reasoning ? sse({ choices: [{ delta: { reasoning } }] }) : '') +
    sse({ choices: [{ delta: { content } }] }) +
    'data: [DONE]\n\n';
  if (opts.hold) {
    let release;
    const gate = new Promise((r) => { release = r; });
    await page.route('**/api/chat', async (route) => {
      await gate;
      fulfillSSE(route, body);
    });
    return { release };
  }
  await page.route('**/api/chat', (route) => fulfillSSE(route, body));
  return { release: () => {} };
}

// Intercept /api/chat and return a DIFFERENT canned answer on each successive
// call: answers[0] on the first /api/chat, answers[1] on the second, and so on.
// The last entry is reused for any extra calls. Use this for follow-up
// scenarios where a second question must produce a second, distinct answer with
// its own scratchblocks fence (so the right pane grows a second tab). No
// reasoning delta and no hold — simple sequential content.
async function mockChatSequence(page, answers) {
  if (!Array.isArray(answers) || answers.length === 0) {
    throw new Error('mockChatSequence: answers must be a non-empty array');
  }
  let i = 0;
  await page.route('**/api/chat', (route) => {
    const content = answers[Math.min(i, answers.length - 1)];
    i += 1;
    const body = sse({ choices: [{ delta: { content } }] }) + 'data: [DONE]\n\n';
    fulfillSSE(route, body);
  });
}

// Intercept /api/chat with NO content delta (only optional reasoning, then
// [DONE]). The frontend's finalize() then shows the "no answer" message and
// produces NO block tab — handy for mocked UI tests of the empty/no-answer path.
async function mockChatEmpty(page, opts = {}) {
  const reasoning = opts.reasoning || '';
  const body = (reasoning ? sse({ choices: [{ delta: { reasoning } }] }) : '') + 'data: [DONE]\n\n';
  await page.route('**/api/chat', (route) => fulfillSSE(route, body));
}

module.exports = { mockChatAnswer, mockChatSequence, mockChatEmpty, SCRATCH_ANSWER };