/*
 * scratch_helper server — tiny zero-dependency Node server.
 *   - serves the static frontend from ./public
 *   - GET  /api/health   -> reports whether the local Ollama app + model are up
 *   - POST /api/chat     -> streams an OpenAI-compatible chat completion from the
 *                          local Ollama app (model glm-5.2:cloud) to the browser,
 *                          with the Scratch-tutor system prompt prepended.
 *
 * Run:  node server.js
 * Then open http://127.0.0.1:8787
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const HOST = '127.0.0.1';
const PORTS = [8787, 8788, 8789, 8790];
const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://localhost:11434';
const MODEL = process.env.SCRATCH_MODEL || 'glm-5.2:cloud';

const PUBLIC_DIR = path.join(__dirname, 'public');
const SYSTEM_PROMPT_PATH = path.join(__dirname, 'scratchblocks-prompts', 'system.md');

// Load the tutor system prompt once at startup.
let SYSTEM_PROMPT = '';
try {
  SYSTEM_PROMPT = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf8');
} catch (e) {
  console.error('WARNING: could not read system prompt at', SYSTEM_PROMPT_PATH, e.message);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  // Normalize and prevent path traversal outside public/. Use a separator so a
  // sibling whose name begins with "public" (e.g. "publicsecret") can't slip in.
  const resolved = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + path.sep)) {
    return sendJSON(res, 403, { error: 'forbidden' });
  }
  fs.stat(resolved, (err, stat) => {
    if (err || !stat.isFile()) {
      return sendJSON(res, 404, { error: 'not found' });
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(resolved).pipe(res);
  });
}

// Probe the local Ollama app for reachability and whether the model is listed.
function checkHealth(callback) {
  const req = http.get(`${OLLAMA_BASE}/api/tags`, (upstream) => {
    let data = '';
    upstream.on('data', (c) => (data += c));
    upstream.on('end', () => {
      let modelAvailable = false;
      try {
        const parsed = JSON.parse(data);
        const models = Array.isArray(parsed.models) ? parsed.models : [];
        modelAvailable = models.some((m) => m && m.name === MODEL);
      } catch (_) { /* ignore */ }
      callback({ ok: true, ollamaUp: true, model: MODEL, modelAvailable });
    });
    upstream.on('error', () => callback({ ok: false, ollamaUp: false, model: MODEL, modelAvailable: false }));
  });
  req.on('error', () => callback({ ok: false, ollamaUp: false, model: MODEL, modelAvailable: false }));
  req.setTimeout(4000, () => {
    try { req.destroy(); } catch (_) {}
    callback({ ok: false, ollamaUp: false, model: MODEL, modelAvailable: false });
  });
}

function handleHealth(req, res) {
  checkHealth((info) => sendJSON(res, 200, info));
}

// Forward a chat completion (SSE) from the browser to the local Ollama app,
// streaming the response straight back. The system prompt is prepended here so
// the browser can never drop or change it, and no chat history is kept (the
// browser sends only the current question).
function handleChat(req, res) {
  // Accumulate raw request bytes as Buffers, then decode as UTF-8. Doing
  // `raw += chunk` would corrupt multi-byte characters (e.g. Cyrillic) split
  // across chunk boundaries — critical for this bilingual helper.
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    let body;
    try {
      body = JSON.parse(raw || '{}');
    } catch (e) {
      return sendJSON(res, 400, { error: 'invalid JSON body' });
    }
    const userMessages = Array.isArray(body.messages) ? body.messages : [];
    if (!userMessages.length) {
      return sendJSON(res, 400, { error: 'no messages' });
    }
    // Keep only valid roles; prepend the system message.
    const clean = userMessages
      .filter((m) => m && typeof m.content === 'string')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...clean];

    const ollamaURL = new URL(`${OLLAMA_BASE}/v1/chat/completions`);
    const payload = JSON.stringify({
      model: MODEL,
      messages,
      stream: true,
      temperature: body.temperature ?? 0.6,
    });

    const upstream = http.request(
      {
        method: 'POST',
        hostname: ollamaURL.hostname,
        port: ollamaURL.port,
        path: ollamaURL.pathname,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ollama',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (up) => {
        if (up.statusCode !== 200) {
          let errData = '';
          up.on('data', (c) => (errData += c));
          up.on('end', () => sendJSON(res, 502, { error: `Ollama returned ${up.statusCode}`, detail: errData.slice(0, 500) }));
          return;
        }
        // Pipe the SSE stream straight through to the browser.
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          'Connection': 'keep-alive',
        });
        // Stop pulling from Ollama if the browser disconnects mid-stream.
        res.on('close', () => { try { up.destroy(); } catch (_) {} });
        up.pipe(res);
      }
    );
    upstream.on('error', (e) => {
      if (!res.headersSent) sendJSON(res, 502, { error: 'cannot reach Ollama', detail: e.message });
      else { try { res.end(); } catch (_) {} }
    });
    upstream.setTimeout(120000, () => {
      try { upstream.destroy(); } catch (_) {}
      if (!res.headersSent) sendJSON(res, 504, { error: 'Ollama timed out' });
    });
    upstream.write(payload);
    upstream.end();
  });
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'GET' && url === '/api/health') return handleHealth(req, res);
  if (req.method === 'POST' && url === '/api/chat') return handleChat(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  sendJSON(res, 405, { error: 'method not allowed' });
});

function listenOnAvailablePort(i) {
  if (i >= PORTS.length) {
    console.error('No available port in', PORTS);
    process.exit(1);
  }
  const port = PORTS[i];
  // One error handler per attempt (remove any previous) to avoid listener
  // accumulation across the fallback chain.
  server.removeAllListeners('error');
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      listenOnAvailablePort(i + 1);
    } else {
      console.error(e);
      process.exit(1);
    }
  });
  server.listen(port, HOST, () => {
    server.removeAllListeners('error');
    const base = `http://${HOST}:${port}`;
    console.log(`scratch_helper running at  ${base}`);
    console.log(`Forwarding chat to       ${OLLAMA_BASE}/v1/chat/completions`);
    console.log(`Model                    ${MODEL}`);
    console.log(`System prompt loaded:   ${SYSTEM_PROMPT ? 'yes' : 'NO (missing file!)'}`);
    console.log(`Open the page in your browser. Press Ctrl+C to stop.`);
    // Open the browser (best-effort, non-fatal).
    const opener =
      process.platform === 'win32' ? `start "" "${base}"` :
      process.platform === 'darwin' ? `open "${base}"` :
      `xdg-open "${base}"`;
    try { exec(opener); } catch (_) { /* ignore */ }
  });
}

listenOnAvailablePort(0);