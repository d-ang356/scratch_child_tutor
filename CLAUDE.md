# CLAUDE.md — scratch_helper

## What this project is
A tiny, zero-dependency local web app that teaches **Scratch 3.0** (offline desktop
editor) to a young child. It talks to **any Ollama-hosted model** (default
`glm-5.2:cloud`) via the OpenAI-compatible `/v1/chat/completions` endpoint — either
through the local Ollama desktop app or directly to the Ollama Cloud API with a key.
The browser sends questions to a small Node proxy; the model answers in English or
Bulgarian, explains the steps on the left, and draws the actual Scratch blocks on the
right with scratchblocks.

## Architecture
- `server.js` — zero-dependency Node HTTP server.
  - Serves `public/` static files (+ `/img/` from the repo-root `img/` dir).
  - Proxies `/api/chat` to Ollama at `${OLLAMA_BASE}/v1/chat/completions`, picking
    `http` vs `https` from the URL. Two backends: the local Ollama app
    (default `http://localhost:11434`, no key) or the Ollama Cloud API
    (`https://ollama.com` + `OLLAMA_API_KEY`). Auth header is `Bearer ollama`
    (a harmless placeholder the local daemon ignores) unless `OLLAMA_API_KEY` is
    set, in which case it's `Bearer <key>`.
  - Reads/writes `preferences.json` via `/api/preferences`.
  - Persists chat history in `scratch_helper.db` using built-in `node:sqlite`
    (Node 22.5+; experimental, so `start.bat`/`start.sh` pass `--no-warnings`).
  - Has a strict **topic gate** before `/api/chat`: a short, non-streaming
    classifier call refuses non-Scratch/non-robotics questions before the tutor
    ever sees them. It feeds the classifier **only the latest user message**
    (not the whole history) — see performance note below.
- `public/app.js` — streaming frontend with i18n, preferences modal, chat drawer,
  right-pane block sub-tabs (one tab per assistant answer that contains blocks),
  and a hover “↖” icon under each tab that scrolls to the matching chat message.
- `public/index.html` + `styles.css` — two-pane dark Claude-style UI.
- `scratchblocks-prompts/system.md` — the full bilingual tutor system prompt.
  - It is prepended to every chat (plus a short per-child context from prefs).
  - Contains hard safety rules: only Scratch 3.0 + official Scratch extensions.
  - Tells the child **which Scratch palette** each block lives in, and where in
    the palette for ages ≤8.
- `public/vendor/scratchblocks.min.js` + `public/locales/bg.json` — block renderer.

## How to run
```bash
start.bat        # Windows
./start.sh       # Linux / macOS
```
Or manually: `node --no-warnings server.js` and open `http://127.0.0.1:8787`.

For the Ollama Cloud API instead of the local app:
```bash
OLLAMA_BASE=https://ollama.com OLLAMA_API_KEY=<key> SCRATCH_MODEL=glm-5.2 node --no-warnings server.js
```
(no `:cloud` suffix in API mode — see rule 9).

## Key technical rules
1. **Zero dependencies.** Prefer Node built-ins (`node:sqlite`, `crypto`, `http`).
   If you ever need a DB replacement, keep the same schema/endpoints.
2. **UTF-8 safety.** Always read request bodies with `Buffer.concat(chunks).toString('utf8')`;
   never `raw += chunk` — Cyrillic splits across chunks and corrupts Bulgarian input.
3. **System prompt is server-side.** `server.js` prepends it; the browser cannot change it.
   Per-child prefs (age/name) are injected into a fresh system prompt on every request.
4. **Safety is two-layer.**
   - Server gate in `handleChat` (`CLASSIFIER_PROMPT`) short-circuits off-topic input
     with a canned refusal SSE message. The classifier sees **only the latest user
     message**, not the conversation history. This is safe only because the gate is
     lenient (`UNSURE → SCRATCH`, and it fails OPEN on error/timeout) **and** the
     tutor prompt is the independent second layer. Do not "fix" this by re-sending
     the whole history — it adds a large cloud round-trip on every turn.
   - Tutor prompt (`# Scope and safety`) refuses anything that slips through.
   Be very cautious about weakening either layer — children and parents use this app.
5. **Blocks only from official Scratch 3.0 + extensions.** Allowed extensions:
   WeDo 2.0, Pen, Music, micro:bit, EV3, BOOST, Makey Makey, Go Direct.
   Extension blocks MUST end with `:: <category>` (`wedo`, `pen`, `music`, `microbit`,
   `ev3`, `boost`, `makeymakey`, `gdxfor`). Reporters put `::` *inside* parens:
   `(distance:: wedo)`. Booleans put `::` *inside* `<>`: `<tilted [any v]?:: wedo>`.
6. **Client-driven persistence.** The browser saves user/assistant messages to SQLite
   after the stream completes; history is sent back as context on the next turn.
7. **Right pane tabs.** Each assistant answer that contains a fenced `scratchblocks`
   block becomes a tab; multiple `---` scripts within one answer stack inside that tab.
   A hover “↖” icon jumps to the matching instruction message in the chat.
8. **Loaded chats scroll to the bottom of the last message** so the latest turn is
   always visible.
9. **Backend/model is configurable; any Ollama model works.** `OLLAMA_BASE`,
   `OLLAMA_API_KEY`, and `SCRATCH_MODEL` env vars drive it. `server.js` picks
   `http`/`https` from `OLLAMA_BASE` (so `https://ollama.com` works) and sends
   `Authorization: Bearer <OLLAMA_API_KEY>` when a key is set, else a harmless
   `Bearer ollama` placeholder the local daemon ignores. `checkHealth`
   short-circuits for the cloud API (`/ollama\.com/`) — `/api/tags` needs auth
   the local probe doesn't send, and cloud has no "installed models" notion.
   **`:cloud` suffix rule:** the suffix (e.g. `glm-5.2:cloud`) is a *local-app
   routing signal* only — the local daemon strips it before proxying to Ollama
   Cloud. When `OLLAMA_BASE=https://ollama.com` (direct API), use the **plain**
   model name (`glm-5.2`); the server prints a warning if it sees `:cloud` there.
   A gitignored `.env` next to `server.js` is loaded at startup (`loadEnvFile`)
   so you can set these without shell exports; real env vars still override it.

## File structure
```
server.js                       Node proxy + SQLite + prefs + safety gate
public/
  index.html                    App shell + prefs modal + chat drawer
  app.js                        Frontend state, i18n, SSE streaming, tabs
  styles.css                    UI styles
  vendor/scratchblocks.min.js   Block renderer (v3.7.0 UMD)
  locales/bg.json               Bulgarian block locale
scratchblocks-prompts/system.md Tutor system prompt (bilingual + safety)
start.bat / start.sh            Launchers
playwright.config.js            Playwright config (webServer, reporters, projects)
tests/
  pages/                        page objects (Base/Chat/BlocksPane/Preferences/ChatHistory)
  support/                      mockOllama (route interception), sqliteFactory, env
  specs/initial.spec.js         @mock initial smoke test
  real/safety.spec.js           @real safety-gate tests (to implement)
Dockerfile                      app image (zero-dep, node:22-slim)
docker-compose.yml              app + official Playwright container (shared DB volume)
.github/workflows/playwright.yml CI: 2 shards (mock always, real gated on OLLAMA_API_KEY via check-secret job; isolated compose projects)
scripts/test.sh / test.bat      no-Docker local test run
```

## Git / local data
- `.gitignore` already excludes:
  - `preferences.json`
  - `scratch_helper.db*` (SQLite DB + WAL/journal)
  - `.claude/`
  - planning scratch files (`PLAN.md`, `TODO.md`, etc.)
  - `package-lock.json` — local-only, deliberately NOT committed. The app is
    zero-dependency (end users never `npm install`), `@playwright/test` is
    pinned exactly in `package.json`, and CI/Docker install with
    `--no-package-lock` and regenerate the tree anyway; a committed lock would
    also carry macOS-only `fsevents` entries that clash with the Linux CI image.
    Use `npm install`, never `npm ci` (which requires a lock). Revisit if a
    runtime dependency is ever added.
- Never commit local user data. After testing, reset state with:
  `rm -f preferences.json scratch_helper.db scratch_helper.db-*`

## Common gotchas
- The default model (`glm-5.2:cloud`) is a **reasoning model**: it streams
  `delta.reasoning` before `delta.content`. The UI renders the "Thinking…"
  indicator **immediately on send** (before any delta) to mask the server-side
  classifier round-trip; `updateLive` replaces it once reasoning/content actually
  arrives. A non-reasoning model simply won't emit `delta.reasoning`; the UI
  still works (it falls back to a cursor while `content` is empty).
- **Cloud API is HTTPS.** `server.js` uses `pickModule(url)` to choose
  `http`/`https`; if you ever add another upstream call, route it through the
  same helper instead of hardcoded `http.request`, or cloud requests will fail
  with a TLS/protocol error. `checkHealth` deliberately skips `/api/tags` for
  cloud because that endpoint requires auth and cloud has no "pulled models"
  list — don't "fix" it by probing `/api/tags` against `ollama.com`.
- **Pre-thinking latency is the topic gate.** Before the tutor stream can start,
  `handleChat` blocks on one non-streaming cloud round-trip to classify the latest
  user message. That call is the dominant cost before the first token — which is why
  it now takes only the latest message and the UI shows the thinking spinner up front
  rather than waiting for the first delta.
- scratchblocks uses the **input language** as the display language. The model must
  emit blocks in the same language the child asked in (`en` or `bg`).
- Ollama blocks cross-origin browser requests; that is why the same-origin Node proxy
  exists. Do not try to call Ollama directly from `app.js`.
- Port fallback: `server.js` tries 8787, 8788, 8789, 8790 — unless `PORT` is set,
  in which case it binds only that port. `HOST` (default `127.0.0.1`) and
  `SCRATCH_DB_PATH` (default `scratch_helper.db` next to `server.js`) are also
  env-configurable, mainly for the Docker test setup (bind `0.0.0.0`, share a DB
  volume with the SQLite test factory). `SCRATCH_NO_OPEN=1` skips the desktop
  browser launch (headless/CI/Docker). `initDB` sets `PRAGMA journal_mode=WAL`
  + `busy_timeout=5000` so the test factory can read/write the same DB file
  concurrently with the server.

## Functional tests (Playwright)
- Playwright is a **dev-only** dependency (`@playwright/test` 1.61.1 in
  `package.json`); the app stays zero-dependency and normal users never run
  `npm install`. The Docker test image is the official
  `mcr.microsoft.com/playwright:v1.61.1` — keep its tag in sync with the npm
  version or browsers won't match.
- Two test groups, selected by tag in the test title:
  - **`@mock`** — `page.route('**/api/chat', fulfill)` short-circuits at the
    browser→server boundary, so the server classifier + Ollama call **never
    run**. Deterministic, free, no secret. `/api/health` is NOT intercepted, so
    "Ollama connected" is still verified (green in cloud mode whenever a key —
    even the `mock-dummy-key` default — is set). The initial smoke test lives
    here. Do NOT mock `/api/health` — that would defeat the connection check.
  - **`@real`** — no interception; the full server→Ollama path runs. Needs a
    real `OLLAMA_API_KEY`. Used for the safety gate: Scratch question → answer +
    blocks; off-topic → neither. CI runs these only when the secret is set.
- `playwright.config.js` `webServer` auto-starts the app for no-Docker local
  runs and **reuses** the app container for Docker/CI runs (via `BASE_URL`).
  Workers=1, no parallelism — tests share one app + one SQLite DB.
- The **SQLite factory** (`tests/support/sqliteFactory.js`) opens the same DB
  file via `node:sqlite` (WAL + busy_timeout) and can clear/reset/createNew and
  seed chats/messages. In Docker, `SCRATCH_DB_PATH` points both containers at a
  shared volume. Cross-container SQLite over a shared volume is fine for the
  factory's seed/clear workload; avoid heavy concurrent writes.
- Page objects derive from `tests/pages/BasePage.js` (`loc(selector, options)`
  forwards Playwright filter options like `hasText`/`has` — dropping the 2nd
  arg silently breaks title filters, which is why `rowByTitle` filters by
  `hasText`). Add new screens as new page objects rather than driving selectors
  inline in specs. Non-initial specs call `prefs.ensureDismissed()` right after
  `chat.open()` so a missing `preferences.json` (fresh CI/Docker) doesn't block
  the test; the initial smoke test drives the modal explicitly.
- CI runs **two shards** as two separate jobs: `mock-tests` (always) and
  `real-api-tests` (gated on `OLLAMA_API_KEY`). Each is its own job on its own
  runner with its own `COMPOSE_PROJECT_NAME` (`scratch-mock` / `scratch-real`)
  so the `dbdata`/`nm` volumes and `app`/`tests` containers never collide
  between shards. The real shard is gated through a `check-secret` job because a
  job-level `if` can read `needs.*.outputs` but **not** `secrets` **or
  `matrix`** — the secret is materialized into a job output, then
  `if: ${{ needs.check-secret.outputs.has_key == 'true' }}` skips the whole real
  job when there is no key. (Triggers are `pull_request` to `main` and `push` to
  `main` only — no `workflow_dispatch` — so the workflow never runs without a
  PR or a push to `main`; a feature-branch push only triggers YAML validation,
  not a run.) CI reports: HTML report uploaded as an artifact (one per shard);
  JUnit XML → `dorny/test-reporter` posts a pass/fail summary on the run.

## Style guidelines
- Match existing code: plain ES modules in browser, CommonJS in Node, minimal comments,
  clear variable names, no TypeScript, no frameworks.
- Keep the UI child-friendly: short labels, warm tone, large tap targets.
- Any change touching the safety model must be adversarially tested with off-topic
  prompts in both English and Bulgarian.

## Testing tips
- Use `node --check server.js` and `node --check public/app.js` for syntax.
- Use `curl -N -X POST http://127.0.0.1:8787/api/chat ...` to capture the SSE stream.
- For scratchblocks verification, use jsdom + a fake canvas `getContext` with
  `measureText` (the project previously had QA scripts under `_qa/` that were removed).
- Verify `.gitignore` by running `git status --short` and confirming no `.db`/prefs files.
