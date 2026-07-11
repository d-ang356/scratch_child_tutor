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

// Intercept /api/chat and HOLD the fetch (so the UI shows the "Thinking…"
// indicator), then on release() DROP the connection via route.abort('failed').
// The client's fetch rejects with a non-AbortError network failure (a TypeError
// "Failed to fetch", NOT the AbortController's AbortError — that path is for the
// Stop button), so sendChat's catch lands in its `else` branch and renders
// t("connLost", ...) ("Connection lost." / "Връзката прекъсна.") in the assistant
// bubble.
//
// Use this to test the mid-conversation drop: /api/health is NOT mocked, so the
// dot stays GREEN (the drop is on the chat path, not the health path) while the
// chat answer becomes an error and the composer is re-enabled for a retry.
// Mirrors mockChatAnswer({ hold: true }): returns { release }; the response is
// held until you call release(), so you can assert the thinking state first.
async function mockChatDrop(page) {
  let release;
  const gate = new Promise((r) => { release = r; });
  await page.route('**/api/chat', async (route) => {
    await gate;
    try { await route.abort('failed'); } catch (_) { /* route already settled */ }
  });
  return { release };
}

// Intercept /api/chat by OVERRIDING window.fetch (via page.addInitScript) so we
// can stream a few content deltas and then HOLD the stream open. page.route's
// route.fulfill is one-shot: it can either hold (nothing sent) or fulfill the
// whole body at once — it can't stream some chunks then hold. To exercise
// send()'s AbortError branch with NON-empty `content` (partial prose + a
// partial scratchblocks fence extracted via FENCE_LOOSE -> addTab), we need real
// bytes to arrive before the abort, so we return a synthetic Response whose body
// is a ReadableStream we control: enqueue the reasoning delta (optional) and the
// given content chunks (as SSE `data:` lines), then NEVER close — the reader
// stays pending so the caller can click Stop mid-stream.
//
// The override honors the request's AbortController signal: on abort it errors
// the stream controller with a DOMException named AbortError, so reader.read()
// rejects with AbortError exactly like a real aborted fetch (without this, the
// held stream would ignore the abort and the test would hang). /api/health and
// every other fetch pass through to the real fetch, so the health dot is real
// (green) and persistence endpoints hit the server.
//
// MUST be registered BEFORE chat.open(): addInitScript runs on the NEXT
// navigation, so it only takes effect on the open() that follows.
async function mockChatPartialThenHold(page, opts = {}) {
  const reasoning = opts.reasoning || '';
  const contentChunks = Array.isArray(opts.contentChunks) ? opts.contentChunks : [];
  await page.addInitScript(({ reasoning, contentChunks }) => {
    const origFetch = window.fetch;
    // Match /api/chat only at the END of the path (optionally followed by a
    // query string). A naive url.includes('/api/chat') would ALSO swallow
    // '/api/chats' (the history list/create endpoint refreshChatList fetches at
    // boot) — '/api/chat' is a substring of '/api/chats' — routing it into this
    // never-closing synthetic stream and hanging bootReady so the splash never
    // clears. page.route('**/api/chat') doesn't have this problem (the glob
    // requires the path to end with /api/chat); this hand-rolled check must be
    // just as precise.
    const CHAT_RE = /\/api\/chat(\?|$)/;
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url);
      if (!url || !CHAT_RE.test(url)) return origFetch.apply(this, arguments);
      const signal = init && init.signal;
      const stream = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          const sse = (obj) => controller.enqueue(enc.encode('data: ' + JSON.stringify(obj) + '\n\n'));
          if (reasoning) sse({ choices: [{ delta: { reasoning } }] });
          for (const c of contentChunks) sse({ choices: [{ delta: { content: c } }] });
          // Hold: do NOT close the controller. The reader stays pending so the
          // caller can click Stop while it waits for more.
          if (signal) {
            const abort = () => {
              try { controller.error(new DOMException('The user aborted a request.', 'AbortError')); }
              catch (_) { /* controller already closed */ }
            };
            if (signal.aborted) { abort(); return; }
            signal.addEventListener('abort', abort);
          }
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' },
      });
    };
  }, { reasoning, contentChunks });
}


// Intercept GET /api/health with a canned JSON payload so a @mock test can drive
// the UI's health-state branches deterministically. /api/health is a plain JSON
// endpoint (the client does `await res.json()`), NOT an SSE stream — the body
// must be JSON. Wrapping it in the SSE `data:` line makes res.json() throw,
// which routes EVERY call into checkHealth's catch ("server problem") branch and
// defeats the test (every error test would silently test the same path).
//
// The client (checkHealth in app.js) branches on ollamaUp + modelAvailable only
// (the `ok` field is sent for shape parity with the real server response but is
// NOT read by the client):
//   ollamaUp && modelAvailable  -> green   (dot ok),  "Ollama ready",     input ENABLED
//   ollamaUp && !modelAvailable -> neutral (dot),     "model not listed",  input ENABLED
//   !ollamaUp                   -> red     (dot bad), "not reachable",    input DISABLED, retry
// To exercise the fourth branch — fetch failure ("Helper server problem") — do
// NOT use this helper; abort the route instead:
//   await page.route('**/api/health', (r) => r.abort('failed'));
//
// Design rule: the OK/connected state is NOT mocked here — it stays real in the
// initial smoke test (expectOllamaConnected hits the actual /api/health). Mock
// /api/health ONLY for the error branches the real suite can't reach
// deterministically (you can't reliably make Ollama "down" or "model missing" in
// CI). See tests/specs/ollamaConnectionErrors.spec.js.
async function mockOllamaHealthCheck(page, ollamaUp, modelAvailable) {
  const body = JSON.stringify({
    ok: ollamaUp,
    ollamaUp,
    model: 'glm-5.2',
    modelAvailable,
  });
  await page.route('**/api/health', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store' },
    body,
  }));
}

module.exports = { mockChatAnswer, mockChatSequence, mockChatEmpty, mockChatDrop, mockChatPartialThenHold, SCRATCH_ANSWER, mockOllamaHealthCheck };