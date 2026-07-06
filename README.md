# Scratch Helper 🐱

A small, friendly local web helper that teaches **Scratch 3.0** (the offline
desktop editor) to a young child. You ask how to make something — in **English**
or **Български** — and a tutor (the `glm-5.2:cloud` model via your local Ollama
app) explains the steps on the left and draws the actual Scratch blocks on the
right.

No history, no RAG, no accounts. A page refresh starts a brand-new chat.

```
your browser  ──/api/chat──▶  this server (node, no deps)  ──▶  local Ollama app  ──▶  Ollama Cloud (glm-5.2)
   left pane: chat                right pane: scratchblocks SVG (EN + Български)
```

## Requirements

1. **Node.js** (any recent version; v18+). — https://nodejs.org
2. **The Ollama desktop app** installed, running, and **signed in** to Ollama
   Cloud so the `:cloud` models work:
   - Start the Ollama app.
   - Run `ollama signin` once in a terminal and follow the prompts.
   - Confirm the model is available: `ollama list` should show `glm-5.2:cloud`
     (or run `ollama run glm-5.2:cloud` once to register it). The model is
     served by Ollama Cloud — you do **not** download gigabytes locally.
3. The default Ollama address `http://localhost:11434` is used. Override with
   `OLLAMA_BASE=http://host:port` if yours differs.

## Run

### Windows
Double-click **`start.bat`**, or in a terminal:
```
node server.js
```
A browser opens at `http://127.0.0.1:8787`.

### Linux / macOS
```
./start.sh
```

If port 8787 is busy the server automatically tries 8788–8790 and prints the
address it used.

## How to use

- Type a question like *“How do I make the cat walk and say hello?”* or
  *“Как да накарам котката да подскача?”* and press **Enter**.
- The **left pane** is the chat — the tutor explains the goal and the steps.
- The **right pane** shows the Scratch blocks, drawn the way they look in the
  editor, in the same language you asked in.
- **New chat** (top-right) or just refresh the page to start over.

## What’s inside

```
server.js                  tiny proxy + static server (Node, zero dependencies)
public/
  index.html               two-pane page
  app.js                   streaming chat + fenced-block parsing + rendering
  styles.css               dark, Claude-style two-pane look
  vendor/scratchblocks.min.js  the block renderer (vendored, MIT, v3.7.0)
  locales/bg.json          Bulgarian block names (so BG blocks render natively)
scratchblocks-prompts/
  system.md                the tutor system prompt (bilingual, with cheat-sheets)
start.bat / start.sh       launchers
```

## How the language works

- The model detects your question's language and **replies in that language**,
  and writes the Scratch blocks in that language too.
- `scratchblocks` (the renderer) parses and displays blocks in the language the
  markup is written in. The frontend always renders with `languages: ['bg',
  'en']`, so English block names and Bulgarian block names both work; each
  script displays in the language the model wrote it in.
- The Bulgarian block names come from the official scratchblocks Bulgarian
  locale, so they match what the child sees in the Scratch editor set to
  Bulgarian.

## Troubleshooting

- **“Ollama not reachable”** — start the Ollama app; the status dot turns green
  when it's up. Run `ollama signin` if you haven't.
- **Model not listed** — `ollama list` should include `glm-5.2:cloud`. If MIT
  renamed it, set `SCRATCH_MODEL=glm-5.2:cloud` (or the new name) before
  starting the server.
- **CORS / 403** — not expected, because the browser talks only to this server
  (same-origin), which talks to Ollama server-to-server. If you changed
  `OLLAMA_BASE` to a remote host, make sure that host is reachable.
- **Blocks don’t draw** — the model occasionally writes a block name that isn't
  recognized; ask the question again. The renderer draws unknown blocks in grey.
- **Windows env gotchas** — after changing any Ollama env var (`OLLAMA_HOST`,
  `OLLAMA_ORIGINS`, …), quit and relaunch the Ollama tray app; old terminals
  keep the old environment.

## Privacy

Everything is local: the page, the proxy, and the model call go through your own
machine's Ollama app. The only network hop is your local Ollama app → Ollama
Cloud (for the `:cloud` model). No chat is stored anywhere — refresh clears it.

## License

The included `scratchblocks.min.js` and `locales/bg.json` are MIT-licensed
(© scratchblocks contributors). The rest of this project is yours to use.