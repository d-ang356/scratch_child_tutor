# CLAUDE.md — scratch_helper

## What this project is
A tiny, zero-dependency local web app that teaches **Scratch 3.0** (offline desktop
editor) to a young child. It uses the local Ollama app talking to the cloud model
`glm-5.2:cloud`. The browser sends questions to a small Node proxy; the model answers
in English or Bulgarian, explains the steps on the left, and draws the actual Scratch
blocks on the right with scratchblocks.

## Architecture
- `server.js` — zero-dependency Node HTTP server.
  - Serves `public/` static files.
  - Proxies `/api/chat` to local Ollama (`http://localhost:11434/v1/chat/completions`).
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
```

## Git / local data
- `.gitignore` already excludes:
  - `preferences.json`
  - `scratch_helper.db*` (SQLite DB + WAL/journal)
  - `.claude/`
  - planning scratch files (`PLAN.md`, `TODO.md`, etc.)
- Never commit local user data. After testing, reset state with:
  `rm -f preferences.json scratch_helper.db scratch_helper.db-*`

## Common gotchas
- The model `glm-5.2:cloud` is a **reasoning model**: it streams `delta.reasoning`
  before `delta.content`. The UI renders the "Thinking…" indicator **immediately on
  send** (before any delta) to mask the server-side classifier round-trip; `updateLive`
  replaces it once reasoning/content actually arrives.
- **Pre-thinking latency is the topic gate.** Before the tutor stream can start,
  `handleChat` blocks on one non-streaming cloud round-trip to classify the latest
  user message. That call is the dominant cost before the first token — which is why
  it now takes only the latest message and the UI shows the thinking spinner up front
  rather than waiting for the first delta.
- scratchblocks uses the **input language** as the display language. The model must
  emit blocks in the same language the child asked in (`en` or `bg`).
- Ollama blocks cross-origin browser requests; that is why the same-origin Node proxy
  exists. Do not try to call Ollama directly from `app.js`.
- Port fallback: `server.js` tries 8787, 8788, 8789, 8790.

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
