"use strict";

/* ---------- Elements ---------- */
const $ = (id) => document.getElementById(id);
const messagesEl = $("messages");
const welcomeEl = $("welcome");
const welcomeSubEl = $("welcomeSub");
const examplesEl = $("examples");
const inputEl = $("input");
const sendBtn = $("sendBtn");
const composerEl = $("composer");
const blocksHost = $("blocksHost");
const blocksEmpty = $("blocksEmpty");
const blocksWarn = $("blocksWarn");
const blocksScroll = $("blocksScroll");
const statusDot = $("statusDot");
const statusText = $("statusText");
const newChatBtn = $("newChatBtn");

/* ---------- State ---------- */
let ollamaOk = false;
let streaming = false;
let abortCtrl = null;
let healthTimer = null;     // retries the health probe until Ollama comes up
let renderedBlock = null;     // last scratchblocks markup rendered (to avoid re-render)
let renderedBlockSig = null;  // signature to avoid duplicate renders during streaming

/* ---------- Bulgarian locale for scratchblocks ----------
 * English ships built-in; we add Bulgarian so BG block names render natively.
 * We always render with languages ['bg','en'] so blocks the model writes in
 * either language parse and display in that same language. */
(async function loadBgLocale() {
  try {
    const res = await fetch("locales/bg.json");
    if (res.ok) {
      const bg = await res.json();
      if (window.scratchblocks && typeof window.scratchblocks.loadLanguages === "function") {
        window.scratchblocks.loadLanguages({ bg });
      }
    }
  } catch (e) { /* English still works as fallback */ }
})();

/* ---------- Health ---------- */
async function checkHealth() {
  statusDot.className = "dot";
  statusText.textContent = "Checking Ollama…";
  try {
    const res = await fetch("/api/health");
    const info = await res.json();
    if (info.ollamaUp && info.modelAvailable) {
      ollamaOk = true;
      clearHealthTimer();
      statusDot.className = "dot ok";
      statusText.textContent = "Ollama ready";
      enableInput(true);
    } else if (info.ollamaUp && !info.modelAvailable) {
      ollamaOk = true; // let them try anyway; the model may pull on demand
      clearHealthTimer();
      statusDot.className = "dot";
      statusText.textContent = `Ollama up — model "${info.model}" not listed (try anyway)`;
      enableInput(true);
    } else {
      ollamaOk = false;
      statusDot.className = "dot bad";
      statusText.textContent = "Ollama not reachable — start the Ollama app";
      enableInput(false);
      scheduleHealthRetry();
    }
  } catch (e) {
    ollamaOk = false;
    statusDot.className = "dot bad";
    statusText.textContent = "Helper server problem";
    enableInput(false);
    scheduleHealthRetry();
  }
}
function clearHealthTimer() { if (healthTimer) { clearTimeout(healthTimer); healthTimer = null; } }
function scheduleHealthRetry() {
  if (healthTimer) return;
  healthTimer = setTimeout(() => { healthTimer = null; checkHealth(); }, 5000);
}
checkHealth();

function enableInput(on) {
  if (streaming) { inputEl.disabled = true; sendBtn.disabled = false; return; } // keep Stop clickable
  inputEl.disabled = !on;
  sendBtn.disabled = !on;
  if (on) inputEl.focus();
}

/* ---------- Tiny safe markdown renderer ---------- */
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function inline(s) {
  s = escapeHtml(s);
  // inline code first
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // bold **text**
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // italics *text* or _text_ (avoid clashing with bold already applied)
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  return s;
}
function renderMarkdown(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let i = 0;
  const flushPara = (buf) => (buf.length ? `<p>${buf.map(inline).join("<br>")}</p>` : "");
  let para = [];
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      html += flushPara(para); para = []; i++; continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      html += flushPara(para); para = [];
      const lvl = heading[1].length;
      html += `<h${lvl}>${inline(heading[2])}</h${lvl}>`;
      i++; continue;
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      html += flushPara(para); para = [];
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i++;
      }
      html += `<ol>${items.join("")}</ol>`;
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      html += flushPara(para); para = [];
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`);
        i++;
      }
      html += `<ul>${items.join("")}</ul>`;
      continue;
    }
    para.push(line);
    i++;
  }
  html += flushPara(para);
  return html;
}

/* ---------- scratchblocks rendering ---------- */
const FENCE_OPEN = /```scratchblocks\b/i;
const FENCE_COMPLETE = /```scratchblocks\s*\n([\s\S]*?)```/i;
const FENCE_LOOSE = /```scratchblocks\s*\n([\s\S]*?)(?:```|$)/i;

function renderBlocks(markup) {
  blocksHost.innerHTML = "";
  blocksWarn.hidden = true;
  blocksWarn.textContent = "";
  const scripts = markup
    .split(/^\s*---\s*$/m)
    .map((s) => s.replace(/^\n+|\n+$/g, ""))
    .filter((s) => s.trim().length);
  if (!scripts.length) { showBlocksError("No blocks to show."); return; }
  scripts.forEach((src) => {
    const pre = document.createElement("pre");
    pre.className = "sb";
    pre.textContent = src;
    const wrap = document.createElement("div");
    wrap.className = "script";
    wrap.appendChild(pre);
    blocksHost.appendChild(wrap);
  });
  blocksEmpty.hidden = true;
  try {
    window.scratchblocks.renderMatching("pre.sb", { style: "scratch3", languages: ["bg", "en"] });
  } catch (e) {
    showBlocksError("Could not render the blocks: " + e.message);
    return;
  }
  // If nothing rendered (unknown syntax everywhere), warn.
  const svgs = blocksHost.querySelectorAll("svg");
  if (svgs.length === 0) {
    showBlocksError("The model's blocks could not be drawn. Try asking again.");
  }
  blocksScroll.scrollTop = 0;
}

function showBlocksError(msg) {
  blocksHost.innerHTML = "";
  blocksEmpty.hidden = true;
  const div = document.createElement("div");
  div.className = "blocks-error";
  div.textContent = msg;
  blocksHost.appendChild(div);
}

/* ---------- Chat send / stream ---------- */
function appendMsg(role, who) {
  const wrap = document.createElement("div");
  wrap.className = "msg " + role;
  const whoEl = document.createElement("div");
  whoEl.className = "who";
  whoEl.textContent = who;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  wrap.appendChild(whoEl);
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

async function send(question) {
  if (streaming || !question.trim()) return;
  if (welcomeEl) welcomeEl.remove();
  streaming = true;
  enableInput(false);
  sendBtn.textContent = "Stop";

  // Reset the right pane for this exchange.
  renderedBlock = null;
  renderedBlockSig = null;
  blocksHost.innerHTML = "";
  blocksWarn.hidden = true;
  blocksEmpty.hidden = false;

  const userBubble = appendMsg("user", "You");
  userBubble.textContent = question;

  const aiBubble = appendMsg("assistant", "Scratch Helper");
  let content = "";   // the kid-facing answer (what we render)
  let reasoning = "";  // glm-5.2 chain-of-thought; we do NOT show it, only use it
                       // to keep a "Thinking…" indicator alive while content is empty.

  abortCtrl = new AbortController();
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
      signal: abortCtrl.signal,
    });
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      aiBubble.innerHTML = renderMarkdown(`**Could not reach Ollama.** Make sure the Ollama app is running and you are signed in (\`ollama signin\`), then try again.\n\n\`${txt.slice(0, 200)}\``);
      finishStream();
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) return;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const obj = JSON.parse(data);
        const delta = obj.choices && obj.choices[0] && obj.choices[0].delta;
        if (delta) {
          if (delta.content) content += delta.content;
          if (delta.reasoning) reasoning += delta.reasoning;
          updateLive(content, reasoning, aiBubble);
        }
      } catch (_) { /* ignore malformed chunk */ }
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop(); // keep partial line
      for (const line of lines) handleLine(line);
    }
    // Flush the decoder and process any final line that lacked a trailing newline.
    buf += decoder.decode();
    if (buf.trim()) handleLine(buf);
    finalize(content, reasoning, aiBubble);
  } catch (e) {
    if (e.name === "AbortError") {
      const openMatch = content.match(FENCE_OPEN);
      const expl = openMatch ? content.slice(0, openMatch.index) : content;
      aiBubble.innerHTML = renderMarkdown(expl) + "<p><em>(stopped)</em></p>";
      if (renderedBlock === null) {
        const looseMatch = content.match(FENCE_LOOSE);
        if (looseMatch && looseMatch[1].trim()) renderBlocks(looseMatch[1]);
      }
    } else {
      aiBubble.innerHTML = renderMarkdown(`**Connection lost.** ${e.message}`);
    }
  } finally {
    finishStream();
  }
}

function thinkingHTML() {
  return '<div class="thinking">🤔 <span class="dots"><i></i><i></i><i></i></span> Thinking…</div>';
}

function updateLive(content, reasoning, aiBubble) {
  // While the model is still "thinking" (reasoning, no answer yet), show a
  // friendly placeholder so the child isn't staring at a blank bubble.
  if (!content.trim()) {
    if (reasoning.trim()) {
      aiBubble.innerHTML = thinkingHTML();
    } else {
      aiBubble.innerHTML = '<span class="cursor"></span>';
    }
    return;
  }
  // Explanation = everything before the opening scratchblocks fence (if any).
  const openMatch = content.match(FENCE_OPEN);
  const expl = openMatch ? content.slice(0, openMatch.index) : content;
  aiBubble.innerHTML = renderMarkdown(expl) + (streaming ? '<span class="cursor"></span>' : "");

  // Render blocks only once a complete (closed) fence exists.
  const completeMatch = content.match(FENCE_COMPLETE);
  if (completeMatch) {
    const markup = completeMatch[1];
    const sig = markup.trim();
    if (sig !== renderedBlockSig && sig.length) {
      renderedBlockSig = sig;
      renderedBlock = markup;
      renderBlocks(markup);
    }
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function finalize(content, reasoning, aiBubble) {
  if (!content.trim()) {
    aiBubble.innerHTML = reasoning.trim()
      ? renderMarkdown("The model thought about it but didn't give an answer. Please try asking again.")
      : renderMarkdown("**No answer came back.** Make sure the Ollama app is running, then try again.");
    return;
  }
  const openMatch = content.match(FENCE_OPEN);
  let expl = openMatch ? content.slice(0, openMatch.index) : content;
  // Keep any prose the model wrote AFTER the closing fence (it's told not to,
  // but don't silently drop a friendly "Have fun!" if it disobeys).
  if (openMatch) {
    const completeMatch = content.match(FENCE_COMPLETE);
    if (completeMatch) {
      const after = content.slice(openMatch.index + completeMatch[0].length);
      if (after.trim()) expl += "\n\n" + after;
    }
  }
  aiBubble.innerHTML = renderMarkdown(expl);

  if (renderedBlock === null) {
    // No complete block was streamed; try the tolerant (unclosed-fence) regex.
    const looseMatch = content.match(FENCE_LOOSE);
    if (looseMatch && looseMatch[1].trim()) {
      renderBlocks(looseMatch[1]);
    } else {
      blocksEmpty.hidden = true;
      const div = document.createElement("div");
      div.className = "blocks-error";
      div.textContent = "No Scratch blocks were returned this time. Try asking again — I'll do my best to show the blocks too!";
      blocksHost.appendChild(div);
    }
  }
}

function finishStream() {
  streaming = false;
  sendBtn.textContent = "Send";
  enableInput(ollamaOk);
}

/* ---------- Composer ---------- */
function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
}
inputEl.addEventListener("input", autoGrow);

composerEl.addEventListener("submit", (e) => {
  e.preventDefault();
  if (streaming) {
    if (abortCtrl) abortCtrl.abort();
    return;
  }
  const q = inputEl.value.trim();
  if (!q) return;
  inputEl.value = "";
  autoGrow();
  send(q);
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composerEl.requestSubmit();
  }
});

examplesEl.addEventListener("click", (e) => {
  const li = e.target.closest("li[data-q]");
  if (!li) return;
  inputEl.value = li.dataset.q;
  autoGrow();
  composerEl.requestSubmit();
});

newChatBtn.addEventListener("click", () => {
  if (streaming && abortCtrl) abortCtrl.abort();
  messagesEl.innerHTML = "";
  blocksHost.innerHTML = "";
  blocksWarn.hidden = true;
  blocksEmpty.hidden = false;
  renderedBlock = null;
  // Re-add the welcome card.
  location.reload();
});

/* Refresh = new chat. Also guard against bfcache restoring a stale stream. */
window.addEventListener("pageshow", (e) => {
  if (e.persisted) location.reload();
});