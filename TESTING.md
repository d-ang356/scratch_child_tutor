# Testing Guide — scratch_helper

Functional tests for the Scratch Helper app, built with **Playwright** (JavaScript).
This document covers everything: setup, local runs (with and without Docker),
GitHub Actions CI, and how to write your own tests using the page objects, the
SQLite factory, and the Ollama mock helpers.

---

## Table of contents

1. [How the tests are organized](#1-how-the-tests-are-organized)
2. [Prerequisites](#2-prerequisites)
3. [One-time setup (dev only)](#3-one-time-setup-dev-only)
4. [Running locally — no Docker](#4-running-locally--no-docker)
5. [Running locally — Docker (same as CI)](#5-running-locally--docker-same-as-ci)
6. [GitHub Actions CI](#6-github-actions-ci)
7. [Page objects — reference and guide](#7-page-objects--reference-and-guide)
8. [SQLite factory — guide and examples](#8-sqlite-factory--guide-and-examples)
9. [Mocking Ollama — guide and examples](#9-mocking-ollama--guide-and-examples)
10. [Writing a new test — step-by-step](#10-writing-a-new-test-step-by-step)
11. [Tagging convention (@mock / @real)](#11-tagging-convention-mock--real)
12. [Troubleshooting](#12-troubleshooting)
13. [File layout reference](#13-file-layout-reference)

---

## 1. How the tests are organized

There are **two groups of tests**, selected by a tag in the test title:

| Tag | What it does | Needs a real Ollama key? | When it runs in CI |
|-----|--------------|--------------------------|--------------------|
| `@mock` | Intercepts the browser's `POST /api/chat` with `page.route(...)` and fulfills it with a canned SSE response. The request **never reaches the server**, so the server-side topic classifier and the upstream Ollama call do **not** run. Deterministic, free, fast. | No (a dummy key is fine) | On every PR and push to `main` |
| `@real` | Does **not** intercept. The full server → Ollama path runs (classifier + tutor stream). Used for the safety gate: a Scratch question gets an answer + blocks; an off-topic question gets neither. | Yes (`OLLAMA_API_KEY`) | Only when the `OLLAMA_API_KEY` repo secret is set |

> **Why `@mock` is deterministic.** `page.route('**/api/chat', route => route.fulfill(...))`
> fulfills the request at the **browser boundary**. The fetch never hits the
> Node server, so there is no classifier round-trip and no Ollama inference.
> The `/api/health` endpoint is intentionally **not** mocked, so "Ollama is
> connected" is still verified for real (in cloud mode it is green whenever a
> key — even the dummy `mock-dummy-key` — is set).

The app itself stays **zero-dependency**. Playwright is a **dev-only** dependency
(`@playwright/test` in `package.json`); normal users who just run
`node server.js` never install it.

---

## 2. Prerequisites

- **Node.js 22.5+** (the app uses the built-in `node:sqlite`; same requirement as
  running the app). — https://nodejs.org
- For **Docker** runs: Docker with the Compose v2 plugin (`docker compose`).
- For **real-API** tests: an Ollama Cloud API key (create one at
  https://ollama.com/settings) and a model name with **no `:cloud` suffix**
  (e.g. `glm-5.2` or `gpt-oss:20b`).

---

## 3. One-time setup (dev only)

Playwright is not installed by default. Install dev dependencies once:

```bash
npm install
```

This installs `@playwright/test` **and** downloads the Chromium browser Playwright
needs for local no-Docker runs. (In the Docker/CI path the browser is already
inside the official Playwright image, so nothing is downloaded.)

> If you skip this and run `scripts/test.sh`, it will tell you:
> `Playwright is not installed. Run this once:  npm install`

> **`package-lock.json` is gitignored (local-only).** `npm install` generates a
> lock on your machine, but it is deliberately **not committed**. The app is
> zero-dependency (end users never run `npm install`), the only dev dep
> (`@playwright/test`) is pinned exactly in `package.json`, and CI/Docker install
> with `--no-package-lock` and regenerate the tree anyway. A committed lock would
> also carry macOS-only `fsevents` entries that clash with the Linux CI image.
> Nothing here uses `npm ci` (which would require a lock) — everything uses
> `npm install`. If you ever add a **runtime** dependency the app imports at
> startup, revisit this and start committing the lock.

---

## 4. Running locally — no Docker

Playwright's `webServer` config (see `playwright.config.js`) starts the app
itself on `http://127.0.0.1:8787` before the tests and stops it after. You do
**not** need to run `npm start` separately.

```bash
# Linux / macOS
scripts/test.sh

# Windows
scripts\test.bat

# or, equivalently:
npm test
```

Run only the mocked suite (deterministic, no key needed):

```bash
npm run test:mock
```

Run the real-API suite (needs a real key + model in your environment or `.env`):

```bash
# Linux / macOS
OLLAMA_API_KEY=<your key> SCRATCH_MODEL=gpt-oss:20b npm run test:real

# Windows (Git Bash)
OLLAMA_API_KEY=<your key> SCRATCH_MODEL=gpt-oss:20b npm run test:real
```

You can also put the key in a `.env` file next to `server.js` (it is gitignored):

```env
OLLAMA_BASE=https://ollama.com
OLLAMA_API_KEY=<your key>
SCRATCH_MODEL=gpt-oss:20b
```

…then simply `npm run test:real`. (The server loads `.env` at startup; the
Playwright `webServer` env passes your shell env through, so `.env`-loaded vars
reach the app.)

### Useful Playwright flags

```bash
npm test -- --grep @mock            # only mock tests
npm test -- --grep @real            # only real tests
npm test -- --grep "initial screen" # by title substring
npm test -- --headed                # show the browser window
npm test -- --ui                    # interactive Playwright UI mode
npm test -- --debug                 # step-through with inspector
npm test -- tests/specs/initial.spec.js   # one file
```

After a run, open the HTML report:

```bash
npx playwright show-report
```

---

## 5. Running locally — Docker (same as CI)

This uses the exact same images and compose file CI uses: the app in a container
built from `Dockerfile`, and the tests in the official
`mcr.microsoft.com/playwright:v1.61.1` image.

```bash
# mock suite (default)
npm run test:docker

# real-API suite in Docker
OLLAMA_API_KEY=<your key> SCRATCH_MODEL=gpt-oss:20b \
  PLAYWRIGHT_ARGS="--grep @real" npm run test:docker
```

`npm run test:docker` runs:

```bash
docker compose up --abort-on-container-exit --exit-code-from tests --build
```

- `--build` builds the app image from `Dockerfile`.
- `--abort-on-container-exit` stops the app when the tests finish.
- `--exit-code-from tests` makes the command exit with the tests' exit code
  (non-zero if any test fails).

The `tests` container installs `@playwright/test` with
`npm install --no-audit --no-fund --no-package-lock` — it regenerates the dep
tree rather than using a committed lock (see the note in §3). The `node_modules`
it produces is cached in the `nm` volume across runs.

The two containers share a `dbdata` volume so the SQLite test factory (running in
the tests container) can read/write the same DB the app (in the app container)
uses — both point `SCRATCH_DB_PATH` at `/data/scratch_helper.db` on that volume.
The same volume carries `preferences.json`: `SCRATCH_PREFS_PATH=/data/preferences.json`
in both containers, so an `fs.unlinkSync` in a spec (initial/gender/splashLogo)
resets the file the app actually reads. Without that shared prefs path the app
would read its own unmounted `/app/preferences.json` and the shared-state tests
would fail in Docker (they pass locally only because there the repo-root file is
the app's file). The HTML report and JUnit XML are written into your repo
directory (`playwright-report/`, `test-results/`) via the mount, so you can open
the report locally afterward.

---

## 6. GitHub Actions CI

Workflow: `.github/workflows/playwright.yml`. It triggers on **pull requests**
targeting `main` and on **pushes** to `main` (i.e. on merge). It does **not**
run on a bare push to a feature branch, and there is no `workflow_dispatch`, so
**without opening a PR (or pushing to `main`) the workflow never runs.**
(GitHub still *validates* the workflow YAML on any push that touches it — that
is a syntax check, not a run. An "Invalid workflow file" message on a feature
push means the file is malformed, not that the workflow executed.)

### Jobs

CI runs **two independent jobs** (mock + real), so the real-API tests never
share Docker resources (volumes / containers / network) with the mock tests:

| Job | grep | Compose project | Model default | Runs when |
|--------------|------|-----------------|---------------|----------|
| `mock-tests` | `@mock` | `scratch-mock` | `glm-5.2` | every PR / push to `main` |
| `real-api-tests` | `@real` | `scratch-real` | `gpt-oss:20b` | only if `OLLAMA_API_KEY` is set |

- Each job is its **own runner** with its own `COMPOSE_PROJECT_NAME`
  (`scratch-mock` / `scratch-real`). That isolates the `dbdata` / `nm` volumes
  and `app` / `tests` containers per job, so the two suites can never collide
  even if they were ever co-located. Each job builds and runs its own
  `docker compose up`.
- The two jobs run in parallel (the real one waits only on `check-secret`).
- Each job uploads its own report artifact (`playwright-report-mock` /
  `playwright-report-real`) and posts its own `dorny/test-reporter` check
  ("Mock functional tests" / "Real Ollama API tests").

> **No internal sharding; `workers: 1` is required.** Each of the two jobs runs
> as a single Playwright process (no `--shard` matrix) with `workers: 1`
> (serial). The `@mock` suite is small enough that sharding would multiply the
> per-shard Docker build + `npm install` overhead for ~0s of savings and leave
> an empty green shard; re-enable a `--shard k/N` matrix once `@mock` grows past
> ~10 tests. `workers` must stay 1 regardless: the suite is **not parallel-safe**
> at `workers>1` — `initial.spec.js` forces the first-run prefs modal by deleting
> `preferences.json`, and another spec saving prefs concurrently recreates the
> file before the initial page reads `/api/preferences`, so the modal never
> opens (reproduced ~1/8 at `workers=2`). Serial execution is race-free. To
> raise workers later, first decouple `initial.spec` from the shared
> `preferences.json` (e.g. mock `/api/preferences`).

#### Gating the real job on the secret (why there is a `check-secret` job)

A job-level `if` can read `needs.*.outputs`, `github`, `vars`, etc. — but it
**cannot** read `secrets` **or `matrix`**. So the obvious
`if: ${{ secrets.OLLAMA_API_KEY != '' }}` is a silent no-op (the job would never
run), and a matrix job can't gate a whole leg at the job level either. The fix
is a tiny `check-secret` job that maps the secret into the step via `env:`
(secrets are readable in `env`/`run`, not in `if`) and exports
`has_key: true|false` as a job output. The real job then gates at the job level
with:

```yaml
if: ${{ needs.check-secret.outputs.has_key == 'true' }}
```

`needs.*.outputs` *is* allowed in a job-level `if`, so the whole `real-api-tests`
job is **skipped** (not just its steps) when there is no key. The mock job has
no `if` and always runs. (The secret itself is passed to the real job's
`OLLAMA_API_KEY` env, which is the allowed place to use it — `env` can read
`secrets` even though `if` cannot.)

> If you ever want to gate per-leg inside a single matrix job instead, put the
> condition on **each step's** `if` (`matrix` *is* available in step-level
> `if`), not on the job — and remember the skipped leg's reporter/upload steps
> need the same guard so they don't run on empty results.

> Override the real model with a **repository variable** named `SCRATCH_MODEL`
> (Settings → Secrets and variables → Actions → Variables), e.g.
> `gpt-oss:120b`. The mock job reads `SCRATCH_MODEL` too (default `glm-5.2`),
> but it doesn't matter there — `/api/chat` is intercepted.

> The `@real` suite currently has one test — the safety-gate check in
> `tests/real/safety.spec.js` (an off-topic question gets the canned refusal and
> no blocks). It only runs when `OLLAMA_API_KEY` is set, so the real job is
> "skipped" (via the `check-secret` gate) on repos with no key.

### What each job produces

- **Pass/fail summary on the run page** — `dorny/test-reporter` reads
  `test-results/junit.xml` and posts a per-test table (passed / failed / skipped
  / duration) as a check run on the Actions run page. The step is guarded with
  `if: always() && hashFiles('test-results/junit.xml') != ''` (so a missing
  file — e.g. the tests container failed to start — doesn't add a confusing
  secondary error) and `continue-on-error: true` (so a reporter hiccup, or the
  `checks: write` permission being unavailable on a **fork PR**, never fails the
  job — the `Run tests` step is the source of truth).
- **Downloadable HTML report** — `actions/upload-artifact` uploads
  `playwright-report/` as an artifact (`playwright-report-mock` /
  `playwright-report-real`), retained 14 days. Download it from the run page and
  open `index.html`, or unzip and run `npx playwright show-report`.

### Secrets and variables to set

| Name | Kind | Required for | Example |
|------|------|--------------|---------|
| `OLLAMA_API_KEY` | Secret | `@real` job to run at all | your key from ollama.com/settings |
| `SCRATCH_MODEL` | Variable (optional) | Choosing the CI model | `gpt-oss:20b`, `gpt-oss:120b`, `glm-5.2` |

> **No `:cloud` suffix in API mode.** The CI sets `OLLAMA_BASE=https://ollama.com`
> (direct Cloud API), so the model name must be plain (`gpt-oss:20b`), not
> `gpt-oss:20b:cloud`. The `:cloud` suffix is only a local-Ollama-app routing
> signal.

### Running the workflow manually

The workflow fires on PR/push. To test the workflow file itself without opening a
PR, push to a branch and open a draft PR, or temporarily add `workflow_dispatch:`
to the `on:` block and trigger it from the Actions tab.

---

## 7. Page objects — reference and guide

All page objects live in `tests/pages/` and derive from `BasePage`. Use them
instead of driving selectors inline in specs — they keep tests readable and
survive minor markup changes.

### BasePage (`tests/pages/BasePage.js`)

```js
const { BasePage } = require('../pages/BasePage');

class MyPage extends BasePage {
  constructor(page) { super(page); }
  get thing() { return this.loc('#thing'); }   // this.loc -> page.locator
  async doStuff() { await this.open('/'); ... } // this.open -> page.goto(path)
}
```

- `this.page` — the Playwright `Page`.
- `this.baseUrl` — `process.env.BASE_URL || 'http://127.0.0.1:8787'`.
- `this.loc(selector, options?)` — shortcut for `this.page.locator(selector, options)`.
  Pass Playwright filter options as the 2nd arg, e.g.
  `this.loc('#chatList .chat-row', { hasText: title })`. The 2nd arg is
  forwarded deliberately — dropping it silently loses `hasText` / `has`
  filters, which is exactly the bug that made `rowByTitle()` not filter by
  title.
- `this.open(path = '/')` — `page.goto(path)`.
- `this.shrinkViewport({ width?, height? })` — `page.setViewportSize` (default
  1280×440). Used by the follow-up tests so two answers overflow `#messages` and
  the ↖ jump-to-message navigation actually has something to scroll. Call after
  `open()` so the loading splash (already cleared) is not affected.

### ChatPage (`tests/pages/ChatPage.js`) — left chat pane + top-bar status

| Member | What it is |
|--------|-----------|
| `welcome` | the `#welcome` card |
| `splash` | the `#splash` loading overlay (shown on every open/refresh) |
| `open(path?)` | **overrides `BasePage.open`**: `page.goto(path)` then `await expectSplashGone()` — so every spec starts with the splash cleared and the UI interactable. Always go through `chat.open()`, not raw `page.goto()` |
| `expectSplashGone(timeout?)` | awaits `#splash` being hidden (the app removes it from layout via the `.hidden` class once the ≥1.5 s loading animation finishes). Call this after any direct `page.reload()` too, since the splash re-shows on reload |
| `input`, `sendBtn` | composer textarea + send button |
| `statusDot`, `statusText` | Ollama health indicator |
| `newChatBtn` | top-right "New chat" |
| `exampleItems()` | the predefined suggestion chips (`#examples li[data-q]`) |
| `userBubbles()`, `assistantBubbles()` | all user / assistant message bubbles |
| `lastUserBubble()`, `lastAssistantBubble()` | the most recent of each |
| `thinkingIndicator()` | the `.thinking` div in the last assistant bubble — the "🤔 Thinking…" state the model shows on send, before any content arrives |
| `expectThinking(timeout?)` | asserts the model is currently in the thinking state (the indicator is visible). Needs a **held** mock or the indicator is replaced too fast to observe — see §9 |
| `expectWelcomeVisible()` | waits for the welcome card |
| `expectOllamaConnected(timeout?)` | waits for the dot to gain class `ok` |
| `expectOllamaDisconnected(timeout?)` | waits for class `bad` |
| `clickExample(i)` | clicks suggestion chip `i` (this sends the question) |
| `fillQuestion(text)`, `send()` | type a question and click Send |
| `startNewChat()` | click "New chat" |

### BlocksPanePage (`tests/pages/BlocksPanePage.js`) — right "Scratch blocks" pane

| Member | What it is |
|--------|-----------|
| `blocksHost`, `blocksEmpty` | the rendered-blocks container / empty-state card |
| `scrollToMsgBtn` | the hover "↖" jump-to-message button |
| `tabsWrap`, `tabStrip`, `tabPrev`, `tabNext` | the `#blockTabs` wrapper, the `#tabStrip` scroll area, and the contextual `‹`/`›` overflow arrows (hidden unless tabs overflow) |
| `tabs()` | the `Answer N` tabs |
| `activeTab()` | the selected tab |
| `renderedSvgs()` | the scratchblocks SVGs |
| `selectTab(i)` | click a tab (Playwright auto-scrolls the strip to it) |
| `expectActiveTabNumber(n)` | assert the active tab is the Nth answer — matches the i18n label in either language (`Answer N` / `Отговор N`) so the tab-strip scroll tests don't depend on which language a prior run left in `preferences.json` |
| `tabStripHasNoScrollbar()` | true when the strip's native scrollbar is hidden (`offsetWidth === clientWidth`) — proves the arrows, not a scrollbar, are the scroll UI |
| `tabVisibleInStrip(i)` | true when tab `i` overlaps the strip's visible area — proves the scroller actually revealed a far-away tab |
| `jumpToAnswerAndAssert(i)` | select tab `i`, click ↖, wait for `#messages` to smooth-scroll to that answer's row; returns the clamped target scrollTop (used by the follow-up tests) |
| `assertTwoTabsAndJumpIcons()` | two tabs exist, both render blocks, and ↖ on tab 1/2 scrolls to answer 1/2 (targets differ → icon is tab-aware) |
| `expectBlocksRendered()` | asserts ≥1 SVG visible and empty-state hidden |
| `expectEmpty()` | asserts 0 SVGs and empty-state visible |

### PreferencesModalPage (`tests/pages/PreferencesModalPage.js`)

| Member | What it is |
|--------|-----------|
| `modal` | the `#prefsModal` overlay |
| `openBtn` | the `#prefsBtn` ⚙️ button (reopens the modal after first run) |
| `ageInput`, `nameInput` | `#pAge`, `#pName` |
| `ageError` | inline age validation error |
| `saveBtn`, `cancelBtn`, `closeBtn` | action buttons |
| `expectVisible()`, `expectHidden()` | modal visibility |
| `isFirstRun()` | `data-first === "1"` (modal can't be dismissed until saved) |
| `selectLang('en'\|'bg')`, `selectGender('boy'\|'girl'\|'unspecified')`, `setAge(n)`, `setName(s)` | fill fields |
| `save()` | click Save and wait for the modal to close |
| `persistedGender()` | GET `/api/preferences` and return `body.prefs.gender` — proves the value round-tripped through `preferences.json`, not just that the radio stayed selected (used by the gender round-trip test) |
| `cancel()` | click Cancel |
| `ensureDismissed({lang?, age?, name?, gender?})` | if the first-run modal is open, fill it (defaults `en` / age 8 / gender `unspecified` — the pre-checked "Prefer not to say" radio, so the field is always set) and save; else a no-op. **Use this in every non-initial spec** right after `chat.open()` so a missing `preferences.json` (fresh CI/Docker) doesn't block the test |

> **First run:** with no `preferences.json`, the app forces the modal open and
> refuses to close it until a valid age is saved. Your test must save prefs
> before it can interact with the chat. Non-initial tests should call
> `await prefs.ensureDismissed()` right after `chat.open()` instead of the
> explicit fill+save — it's a no-op when prefs already exist. Only the initial
> smoke test drives the modal explicitly (it's testing the modal itself).

### ChatHistoryDrawerPage (`tests/pages/ChatHistoryDrawerPage.js`)

| Member | What it is |
|--------|-----------|
| `openBtn` | top-bar "Chats" button |
| `drawer`, `backdrop`, `closeBtn` | drawer, scrim, × button |
| `chatRows()`, `emptyState()` | rows / empty message |
| `open()`, `close()` | toggle (waits for visibility) |
| `rowByTitle(title)` | a row matching a title |
| `clickChatByTitle(title)` | open a saved chat |
| `deleteChatByTitle(title)` | accept confirm() and delete |
| `expectEmpty()` | asserts the empty state is shown |

---

## 8. SQLite factory — guide and examples

`tests/support/sqliteFactory.js` opens the **same DB file the app uses** via
`node:sqlite` (WAL + `busy_timeout=5000`) so the factory and the running server
can coexist. Use it to seed chats/messages and to clear/reset the DB between
scenarios.

The DB path comes from `SCRATCH_DB_PATH` (default
`test-data/scratch_helper.test.db`). In Docker, both containers point
`SCRATCH_DB_PATH` at the shared `dbdata` volume. `preferences.json` follows the
same pattern via `SCRATCH_PREFS_PATH` (see `tests/support/env.js` `prefsPath()`,
default `test-data/preferences.json`); the specs that reset first-run state
(`initial`, `gender`, `splashLogo`) `fs.unlinkSync(prefsPath())`.

### API

```js
const { createFactory } = require('../support/sqliteFactory');
const f = createFactory(/* optional path */).open();

f.clear();                          // delete all rows, keep schema + file
f.reset();                          // drop + recreate tables
f.createNew();                      // delete the DB file (and -wal/-shm) and open fresh

const chat = f.insertChat({ title: 'Cat walk', lang: 'en' });
// -> { id, title, lang, created_at, updated_at }

const msg = f.insertMessage({ chatId: chat.id, role: 'user', content: 'How?' });
// -> { id, chatId, seq, role, content, blocks, created_at }
// seq auto-increments per chat if omitted

const chat2 = f.insertConversation({
  title: 'Jump',
  lang: 'en',
  turns: [
    { role: 'user', content: 'Make the cat jump.' },
    { role: 'assistant', content: 'Use the jump block.', blocks: 'when green flag clicked\nchange y by (10)' },
  ],
});
// seeds a chat + all its messages in one call

f.listChats();                      // newest-first
f.getChat(id);                      // { chat, messages }
f.close();
```

### Example: seed a chat, then assert it appears in the drawer

```js
const { test, expect } = require('@playwright/test');
const { createFactory } = require('../support/sqliteFactory');
const { ChatPage } = require('../pages/ChatPage');
const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
const { ChatHistoryDrawerPage } = require('../pages/ChatHistoryDrawerPage');

test('a seeded chat shows up in the history drawer @mock', async ({ page }) => {
  // Seed BEFORE the page reads the list. The app queries /api/chats live, so it
  // will see rows the factory just inserted.
  const db = createFactory().open();
  db.clear();
  db.insertConversation({
    title: 'Make the cat glide',
    lang: 'en',
    turns: [{ role: 'user', content: 'Glide to a corner.' }],
  });
  db.close();

  const chat = new ChatPage(page);
  const prefs = new PreferencesModalPage(page);
  const drawer = new ChatHistoryDrawerPage(page);

  await chat.open();
  await prefs.ensureDismissed();   // no-op if preferences.json already exists

  await drawer.open();
  await expect(drawer.rowByTitle('Make the cat glide')).toBeVisible();
  await drawer.clickChatByTitle('Make the cat glide');
});
```

### Seeding: use `globalSetup`, not per-spec `clear()`

The shared DB is cleared and seeded **once** before all tests by
`tests/support/globalSetup.js` (wired via `globalSetup` in `playwright.config.js`).
Specs should **read** the seed rows and not call `db.clear()` themselves — a
spec clearing the shared DB wipes rows out from under other specs (and under
retries). The seed data and shared chat-insertion texts live in
`tests/utils/testConstants.js`: the seed chats (`FULL_CONVERSATION_DATA`,
`MEOW_CONVERSATION_DATA`), the follow-up answers/questions and block markup
(`FOLLOWUP_ANSWER1/2`, `FOLLOWUP_Q1/2`, `walkBlocks`, `glideBlocks`), the
`buildManyTabsConversation(count)` builder for the 20-tab arrow-scroll test, and
the `OFFTOPIC_QUESTION` prompt for the `@real` safety-gate test.

```js
// tests/support/globalSetup.js (runs once per run, before any test)
const { createFactory } = require('./sqliteFactory');
const { FULL_CONVERSATION_DATA, MEOW_CONVERSATION_DATA } = require('../utils/testConstants');

module.exports = async function () {
  const db = createFactory().open();
  db.clear();
  db.insertConversation(FULL_CONVERSATION_DATA);
  db.insertConversation(MEOW_CONVERSATION_DATA);
  db.close();
};
```

> If a test needs its own throwaway chat (e.g. the delete test), insert one with
> a **unique title** (`Date.now()`) directly into the DB via the factory, use
> it, and delete it — don't touch the shared seed rows.

> **Concurrency note:** WAL + `busy_timeout` lets the factory and the server
> share the file. Avoid heavy concurrent writes from both at once. Workers are
> pinned to 1 in `playwright.config.js` — and this is **required**, not just
> preferred: the suite is not parallel-safe at `workers>1` (see §6).

---

## 9. Mocking Ollama — guide and examples

`tests/support/mockOllama.js` provides three helpers. Register the route **before**
the action that triggers `POST /api/chat` (e.g. before clicking a chip).

### `mockChatAnswer(page, { content?, reasoning?, hold? })`

Fulfills `/api/chat` with a canned SSE stream containing a fenced scratchblocks
block (by default), so the frontend creates an "Answer N" tab and renders SVGs.
Always returns `{ release }`.

```js
const { mockChatAnswer } = require('../support/mockOllama');

await mockChatAnswer(page);                         // default answer (with blocks)
await mockChatAnswer(page, { content: 'Custom text\n\n```scratchblocks\nmove [10] steps\n```' });
await mockChatAnswer(page, { reasoning: 'thinking…' }); // exercise the "Thinking…" path
```

#### `hold: true` — asserting the "Thinking…" state

The frontend renders the "🤔 Thinking…" indicator into the assistant bubble
**immediately on send, before the fetch** (`app.js` sets the bubble to
`thinkingHTML()`, then `updateLive()` replaces it once content/reasoning
arrives). The mock fulfills `/api/chat` **instantly**, so without help the
indicator is replaced before Playwright can observe it — `chat.expectThinking()`
would flake or fail.

`hold: true` gates the response behind a `release()` function. The route
handler awaits a promise and only fulfills once you call `release()`, so the
indicator stays on screen until you've asserted it. This is **deterministic**
(no `setTimeout` sleep). When `hold` is false, `release` is a no-op, so callers
that ignore the return value are unaffected.

```js
const { mockChatAnswer } = require('../support/mockOllama');

// Register the held mock BEFORE the action that triggers /api/chat.
const { release } = await mockChatAnswer(page, { hold: true });

await chat.clickExample(0);              // (or fillQuestion + send) — this fires the fetch
await chat.expectThinking();             // the model is thinking, no answer yet
release();                               // let the canned answer stream in
await expect(chat.lastAssistantBubble()).toContainText('cat');   // answer arrived
```

> **Order matters.** Register the route **before** the click/send (so the fetch
> hits the mock, not the server), and call `release()` only **after** you've
> asserted the thinking state — that's what makes the assertion a genuine
> "thinking *before* answering" check, not a race.

### `mockChatSequence(page, answers)`

Fulfills each successive `POST /api/chat` with a **different** canned answer —
`answers[0]` on the first call, `answers[1]` on the second, and so on (the last
entry is reused for any extra calls). Use this for **follow-up** scenarios where
a second question must produce a second, distinct answer with its own
scratchblocks fence, so the right pane grows a second "Answer 2" tab. No
reasoning, no hold — just sequential content.

```js
const { mockChatSequence } = require('../support/mockOllama');
const { FOLLOWUP_ANSWER1, FOLLOWUP_ANSWER2 } = require('../utils/testConstants');
await mockChatSequence(page, [FOLLOWUP_ANSWER1, FOLLOWUP_ANSWER2]);
// send FOLLOWUP_Q1 -> ANSWER1 (tab 1), send FOLLOWUP_Q2 -> ANSWER2 (tab 2)
```

See `tests/specs/followupBlocks.spec.js` for a full example, including asserting
the hover "↖" jump-to-message button scrolls the chat to the tab's answer. The
answers/questions/block markup live in `tests/utils/testConstants.js`; the ↖
scroll math and two-tab assertion live on `BlocksPanePage`
(`jumpToAnswerAndAssert`, `assertTwoTabsAndJumpIcons`).

### `mockChatEmpty(page, { reasoning? })`

Fulfills `/api/chat` with **no content delta** (only optional reasoning, then
`[DONE]`). The frontend shows the "no answer" message and produces **no block
tab** — useful for mocked UI tests of the empty/no-answer path.

```js
const { mockChatEmpty } = require('../support/mockOllama');
await mockChatEmpty(page);
```

### Important: what is and isn't mocked

- **Mocked:** `POST /api/chat` (the browser fetch). The server never sees it, so
  the classifier and Ollama never run.
- **Not mocked:** `GET /api/health`, `GET/POST /api/chats`, `/api/chats/:id`,
  `/api/chats/:id/messages`, `/api/preferences`. These hit the real server and
  the real SQLite DB. That's intentional — persistence and health are part of
  what the tests verify.

### Writing your own canned answer

The body must be an SSE stream the frontend understands
(`data: {json}\n\n` lines, ending with `data: [DONE]\n\n`). Newlines inside the
JSON `content` string are fine — `JSON.stringify` escapes them as `\n`, so each
`data:` line stays on one physical line.

```js
const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
const body =
  sse({ choices: [{ delta: { content: 'My answer\n\n```scratchblocks\nmove [10] steps\n```' } }] }) +
  'data: [DONE]\n\n';

await page.route('**/api/chat', (route) =>
  route.fulfill({ status: 200, contentType: 'text/event-stream; charset=utf-8', body }));
```

---

## 10. Writing a new test — step-by-step

1. **Decide the tag.** UI/flow test with no need for real model output → `@mock`.
   Anything that must exercise the real model or the server safety gate → `@real`.

2. **Pick a file.** Put `@mock` tests in `tests/specs/*.spec.js`. Put `@real`
   tests in `tests/real/*.spec.js`.

3. **Compose page objects**; seed state with the SQLite factory if needed.

   > **Loading splash:** `chat.open()` already waits for the `#splash` loading
   > overlay to clear (≥1.5 s on every open/refresh) before returning, so you do
   > not need to do anything special after `chat.open()`. If a spec calls
   > `page.reload()` directly, follow it with `await chat.expectSplashGone()` —
   > the splash re-shows on reload and would otherwise cover the UI.

   > **First-run modal:** every non-initial spec should call
   > `await prefs.ensureDismissed()` right after `chat.open()` — it fills and
   > saves the preferences modal if it's open (no `preferences.json` yet, e.g. a
   > fresh CI/Docker runner) and is a no-op otherwise. Skipping it makes a spec
   > hang behind the modal in clean environments. The gender field defaults to
   > `unspecified` (the pre-checked "Prefer not to say" radio), so the modal is
   > always submittable without picking a gender; pass `gender: 'boy'|'girl'` to
   > `ensureDismissed` when a test needs a specific gender in the prompt. The
   > initial smoke test is the only one that drives the modal explicitly, because
   > it tests the modal; it guarantees a clean first-run state by deleting
   > `preferences.json` in `beforeEach` (the server reads the file fresh on each
   > `/api/preferences` GET, so the next page load forces the modal).

4. **Example — a mocked test** (no real Ollama):

   ```js
   const { test, expect } = require('@playwright/test');
   const { ChatPage } = require('../pages/ChatPage');
   const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
   const { BlocksPanePage } = require('../pages/BlocksPanePage');
   const { mockChatAnswer } = require('../support/mockOllama');

   test('asking a question produces an Answer tab @mock', async ({ page }) => {
     const chat = new ChatPage(page);
     const prefs = new PreferencesModalPage(page);
     const blocks = new BlocksPanePage(page);

     await chat.open();
     await prefs.ensureDismissed();              // fill the first-run modal if present

     await chat.expectOllamaConnected();
     await mockChatAnswer(page);                 // intercept before sending
     await chat.fillQuestion('How do I keep score?');
     await chat.send();

     await expect(chat.lastAssistantBubble()).toBeVisible();
     await expect(blocks.tabs()).toHaveCount(1);
     await blocks.expectBlocksRendered();
   });
   ```

5. **Example — assert the model thinks before it answers** (`@mock`, held mock):

   The "🤔 Thinking…" indicator is shown on send and replaced the moment the
   response arrives, so a normal (instant) mock hides it too fast. Hold the
   mock, assert thinking, then release and assert the answer. Step by step:

   1. **Register the held mock before the send.** The route must be in place
      before the fetch fires, and `hold: true` keeps it from fulfilling until
      you say so.
   2. **Trigger the chat** (click a chip, or `fillQuestion` + `send`).
   3. **Assert the user message appeared** (optional but good — it's appended
      before the thinking indicator).
   4. **Assert the thinking state** — `chat.expectThinking()`. At this point
      no assistant content exists yet.
   5. **`release()`** the held response so the canned answer streams in.
   6. **Assert the answer** — the thinking indicator is gone and the assistant
      bubble contains the answer (+ the block tab, if your canned answer
      includes a scratchblocks fence).

   ```js
   const { test, expect } = require('@playwright/test');
   const { ChatPage } = require('../pages/ChatPage');
   const { PreferencesModalPage } = require('../pages/PreferencesModalPage');
   const { BlocksPanePage } = require('../pages/BlocksPanePage');
   const { mockChatAnswer } = require('../support/mockOllama');

   test('the model shows it is thinking before answering @mock', async ({ page }) => {
     const chat = new ChatPage(page);
     const prefs = new PreferencesModalPage(page);
     const blocks = new BlocksPanePage(page);

     await chat.open();
     await prefs.ensureDismissed();
     await chat.expectOllamaConnected();

     // 1. Held mock: /api/chat will not fulfill until release() is called.
     const { release } = await mockChatAnswer(page, { hold: true });

     // 2. Start the chat.
     await chat.clickExample(0);

     // 3. The user's question appears.
     await expect(chat.lastUserBubble()).toContainText('cat walk');

     // 4. The model is thinking — no answer yet.
     await chat.expectThinking();

     // 5. Let the canned answer stream in.
     release();

     // 6. The answer replaces the thinking indicator; a block tab is created.
     await expect(chat.lastAssistantBubble()).toContainText('cat');
     await expect(blocks.tabs()).toHaveCount(1);
     await blocks.expectBlocksRendered();
   });
   ```

6. **Example — a real-API test** (no mock; needs `OLLAMA_API_KEY`):

   ```js
   test('a Scratch question gets an answer with blocks @real', async ({ page }) => {
     const chat = new ChatPage(page);
     const prefs = new PreferencesModalPage(page);
     const blocks = new BlocksPanePage(page);

     await chat.open();
     await prefs.ensureDismissed();

     await chat.expectOllamaConnected();
     await chat.fillQuestion('How do I make the cat glide to a corner?');
     await chat.send();

     await expect(chat.lastAssistantBubble()).toBeVisible();
     await expect(blocks.tabs().first()).toHaveText(/Answer 1/);
     await blocks.expectBlocksRendered();
   });

   test('an off-topic question gets no answer and no blocks @real', async ({ page }) => {
     const chat = new ChatPage(page);
     const prefs = new PreferencesModalPage(page);
     const blocks = new BlocksPanePage(page);

     await chat.open();
     await prefs.ensureDismissed();

     await chat.expectOllamaConnected();
     await chat.fillQuestion('Tell me a bedtime story about a dragon.');
     await chat.send();

     // The server's classifier returns OTHER -> emitRefusal sends a canned
     // message with NO scratchblocks fence, so no tab is created.
     await expect(chat.lastAssistantBubble()).toBeVisible();
     await expect(blocks.tabs()).toHaveCount(0);
     await blocks.expectEmpty();
   });
   ```

7. **Run it locally:**

   ```bash
   npm test -- --grep "your title"
   # or, for a @real test:
   OLLAMA_API_KEY=<key> SCRATCH_MODEL=gpt-oss:20b npm run test:real -- --grep "your title"
   ```

---

## 11. Tagging convention (@mock / @real)

- Put the tag **in the test title**, e.g.
  `test('does a thing @mock', async ({ page }) => { ... })`.
- `--grep @mock` runs only mock tests; `--grep @real` runs only real tests.
  `npm test` (no grep) runs **all** tests — don't do that without a key, because
  the `@real` ones will hit a dummy key and fail.
- CI uses `--grep @mock` (always) and `--grep @real` (only with the secret).
- A `test.describe('... @real', () => { ... })` group tag also works — Playwright
  greps the full title path (describe › test).

---

## 12. Troubleshooting

- **`Playwright is not installed. Run this once: npm install`** — you ran the
  no-Docker path without installing dev deps. Run `npm install`.
- **`browser version mismatch` / `Executable doesn't exist` in Docker** — the
  `@playwright/test` npm version (1.61.1) must match the Playwright image tag
  (`mcr.microsoft.com/playwright:v1.61.1`). Both are pinned to the same version;
  bump them together when upgrading.
- **`@real` tests fail with 401 / Unauthorized** — `OLLAMA_API_KEY` is missing,
  wrong, or expired. Recreate it at https://ollama.com/settings. Locally, put it
  in `.env` or your shell.
- **`:cloud` model not found in API mode** — you used `SCRATCH_MODEL=gpt-oss:20b:cloud`
  with `OLLAMA_BASE=https://ollama.com`. Drop the `:cloud` suffix.
- **Port 8787 already in use (local no-Docker)** — the `webServer` reuses an
  existing server on 8787. If a stale server is running with the wrong env, stop
  it first, or set `PORT` and `BASE_URL` to another port:
  `PORT=8800 BASE_URL=http://127.0.0.1:8800 npm test`.
- **`unable to open database file`** — only happens if you override
  `SCRATCH_DB_PATH` to a path whose parent doesn't exist. The server and factory
  both create the parent dir now, so this should not recur.
- **`initial` / `gender` / `splashLogo` fail in CI but pass locally (mock)** —
  `preferences.json` must be the SAME file in the app and tests containers, or a
  spec's `fs.unlinkSync(prefsPath())` deletes a file the app never reads and the
  app keeps a prior spec's prefs. Locally the repo-root file is the app's file,
  so it works; in Docker the app's `/app/preferences.json` is unmounted, so the
  unlink is a no-op and the first-run modal never opens. Fix: keep
  `SCRATCH_PREFS_PATH=/data/preferences.json` set on BOTH the `scratch-app` and
  `tests` services in `docker-compose.yml` (the `dbdata` volume is mounted in
  both). Do not drop it from either container.
- **Tests pass locally but fail in CI (mock, other causes)** — the `@mock` suite
  is deterministic, so a CI-only failure usually means a selector/timing change
  or a Docker-only shared-state issue (see the previous bullet). Download the
  `playwright-report-*` artifact and open it; check the trace
  (`trace: 'retain-on-failure'` is on).
- **Every `chat.open()` takes ≥1.5 s** — that's the loading splash, not a hang.
  The app shows a `#splash` overlay for at least 1.5 s (longer while the boot
  fetches run) on every open/refresh, and `ChatPage.open()` awaits it clearing.
  With `workers: 1` this adds roughly 1.5 s per `chat.open()` to the suite time.
  If a test times out at 10 s right after `open()`, the splash never cleared —
  which means one of the boot fetches (`/api/health`, `/api/preferences`,
  `/api/chats`) hung; check the server log, not the splash code.
- **`dorny/test-reporter` on a fork PR** — `checks: write` is not available for
  fork PRs. The reporter step has `continue-on-error: true` and a
  `hashFiles('test-results/junit.xml')` guard, so this no longer fails the job;
  the `Run tests` step remains the source of truth. On your own repo the
  reporter posts the per-test summary as normal.
- **Tests fail intermittently only at `workers>1`** — expected; the suite is
  not parallel-safe (see §6). `initial.spec.js` deletes `preferences.json` to
  force the first-run modal, and a concurrent spec saving prefs recreates it
  before the initial page reads `/api/preferences`, so the modal never opens.
  Keep `workers: 1`. To raise workers, first decouple `initial.spec` from the
  shared `preferences.json` (e.g. mock `/api/preferences`).
- **Cross-container SQLite `database is locked`** — rare; the factory and server
  share the DB with WAL + a 5s busy timeout. If it happens, do factory writes in
  `beforeEach` (before the page loads) rather than mid-test.
- **`chat.expectThinking()` flakes / times out** — the "Thinking…" indicator is
  replaced the instant the response arrives. With a normal `mockChatAnswer` the
  fulfillment is instant, so the indicator is gone before the assertion runs.
  Use `mockChatAnswer(page, { hold: true })`, assert thinking, then `release()`
  (see §9 and the step-by-step in §10). Don't reach for a `setTimeout` sleep —
  the hold gate is deterministic.
- **`npm ci` fails with "no package-lock.json"** — expected. `package-lock.json`
  is gitignored by design (the app is zero-dependency and `@playwright/test` is
  pinned exactly in `package.json`; CI regenerates with `--no-package-lock`).
  Use `npm install`, not `npm ci`.

---

## 13. File layout reference

```
playwright.config.js            webServer (auto-start / reuse), reporters, project
package.json                    @playwright/test (devDependency) + test scripts
tests/
  pages/
    BasePage.js                 base page object (page, baseUrl, loc, open, shrinkViewport)
    ChatPage.js                 left chat pane + status; open() awaits the loading splash
    BlocksPanePage.js           right scratch-blocks pane + tabs
    PreferencesModalPage.js     preferences modal
    ChatHistoryDrawerPage.js    chat history drawer
  support/
    env.js                      baseUrl() / dbPath() / prefsPath()
    globalSetup.js              seeds the shared DB once before all tests
    mockOllama.js               mockChatAnswer / mockChatSequence / mockChatEmpty
    sqliteFactory.js            clear / reset / createNew / insert* / list / get
  utils/
    testConstants.js            shared seed chats (FULL/MEOW) + follow-up answers/questions + 20-tab builder + OFFTOPIC_QUESTION
  specs/
    initial.spec.js             @mock initial smoke test (first-run modal)
    newChatAndDeleteChat.spec.js @mock new-chat + delete-chat (self-contained)
    gender.spec.js              @mock gender preference round-trip (persist + reload)
    followupBlocks.spec.js      @mock follow-up -> 2nd block tab + ↖ jump-to-message (fresh + seeded chat); 20-tab arrow-scroll test
    splashLogo.spec.js          @mock served index.html splash logo matches saved language (no EN flash on BG refresh)
  real/
    safety.spec.js              @real safety-gate test (off-topic -> refusal; gated on key)
Dockerfile                      app image (zero-dep, node:22-slim)
.dockerignore                   keeps the app image small (excludes root *.md explicitly, not **/*.md)
docker-compose.yml              app + Playwright containers (shared DB volume; `expose`, no host port)
.github/workflows/playwright.yml CI: 2 jobs (mock always, real gated on OLLAMA_API_KEY via check-secret; isolated compose projects; workers=1 serial; concurrency cancels superseded runs; reporter guarded + continue-on-error)
scripts/test.sh / test.bat      no-Docker local run
```

### Environment variables (test-time)

| Variable | Default | Purpose |
|----------|---------|---------|
| `BASE_URL` | `http://127.0.0.1:8787` | App URL Playwright targets (Docker: `http://scratch-app:8787`) |
| `SCRATCH_DB_PATH` | `test-data/scratch_helper.test.db` | DB the app + factory share (Docker: `/data/scratch_helper.db` on the shared `dbdata` volume) |
| `SCRATCH_PREFS_PATH` | `test-data/preferences.json` | `preferences.json` the app reads/writes — must match the path specs `unlink` to reset first-run state (Docker: `/data/preferences.json` on the shared `dbdata` volume). Locally a throwaway under `test-data/` so `npm test` never clobbers the user's real `preferences.json`. |
| `OLLAMA_BASE` | `https://ollama.com` | Ollama backend |
| `OLLAMA_API_KEY` | `mock-dummy-key` | Cloud API key (real for `@real`) |
| `SCRATCH_MODEL` | `glm-5.2` | Model name (no `:cloud` in API mode) |
| `COMPOSE_PROJECT_NAME` | repo dir name | CI sets `scratch-mock` / `scratch-real` per job to isolate Docker volumes/containers |
| `HOST` | `127.0.0.1` | App bind host (`0.0.0.0` in Docker) |
| `PORT` | `8787` | App bind port |
| `SCRATCH_NO_OPEN` | `1` (in tests) | Skip the desktop browser launch |
| `PLAYWRIGHT_ARGS` | `--grep @mock` | Extra args for `npx playwright test` (Docker) |