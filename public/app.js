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
const chatsBtn = $("chatsBtn");
const prefsBtn = $("prefsBtn");
const chatDrawer = $("chatDrawer");
const chatList = $("chatList");
const drawerClose = $("drawerClose");
const blockTabsEl = $("blockTabs");
const chatBackdrop = $("chatBackdrop");
const scrollToMsgBtn = $("scrollToMsgBtn");
const prefsModal = $("prefsModal");
const prefsForm = $("prefsForm");
const prefsClose = $("prefsClose");
const prefsCancel = $("prefsCancel");
const pAge = $("pAge");
const pName = $("pName");
const pAgeErr = $("pAgeErr");

/* ---------- i18n ---------- */
const STRINGS = {
  en: {
    title: "Scratch Helper",
    subtitle: "Your friendly Scratch 3.0 tutor",
    statusChecking: "Checking Ollama…",
    statusReady: "Ollama ready",
    statusModelMissing: (m) => `Ollama up — model "${m}" not listed (try anyway)`,
    statusDown: "Ollama not reachable — start the Ollama app",
    statusServer: "Helper server problem",
    chats: "Chats",
    prefs: "Preferences",
    newChat: "New chat",
    chatHead: "Chat",
    blocksHead: "Scratch blocks",
    welcomeBig: "Hi there! 👋",
    welcomeSub: "Ask me how to make something in Scratch, in English or in Български.",
    composerPh: "Ask about Scratch…",
    composerTip: "Enter to send, Shift+Enter for a new line",
    send: "Send",
    stop: "Stop",
    chatsTitle: "Your chats",
    drawerEmpty: "No chats yet. Ask a question to start one!",
    blocksEmpty: "Your Scratch blocks will appear here.<br>Ask a question on the left to begin.",
    tabLabel: (n) => `Answer ${n}`,
    scrollToMsg: "Jump to the matching message",
    prefsTitle: "Preferences",
    prefsLang: "App language",
    langEn: "English",
    langBg: "Български",
    prefsAge: "Child's age (whole number, 1–17)",
    prefsAgeHint: "Used to match the tutor's words to the child.",
    prefsAgeErr: "Please enter a whole number from 1 to 17.",
    prefsName: "Child's name or nickname (optional)",
    prefsNamePh: "e.g. Mia",
    cancel: "Cancel",
    save: "Save",
    you: "You",
    tutor: "Scratch Helper",
    delConfirm: "Delete this chat?",
    noAnswer: "The model thought about it but didn't give an answer. Please try asking again.",
    noAnswer2: "**No answer came back.** Make sure the Ollama app is running, then try again.",
    noBlocks: "No Scratch blocks were returned this time. Try asking again — I'll do my best to show the blocks too!",
    stopped: "(stopped)",
    connLost: (m) => `**Connection lost.** ${m}`,
    ollamaFail: (t) => `**Could not reach Ollama.** Make sure the Ollama app is running and you are signed in (\`ollama signin\`), then try again.\n\n\`${t}\``,
    examples: [
      ["How do I make the cat walk and say hello when the game starts?", "How do I make the cat walk and say hello?"],
      ["How can I use an if block to check the score when the player clicks something?", "How do I use an if block to check the score?"],
      ["How do I make a WeDo 2.0 motor turn on when I press the green flag?", "How do I turn on a WeDo 2.0 motor?"],
    ],
  },
  bg: {
    title: "Scratch Помощник",
    subtitle: "Твоят приятелски учител по Scratch 3.0",
    statusChecking: "Проверявам Ollama…",
    statusReady: "Ollama е готов",
    statusModelMissing: (m) => `Ollama работи — моделът "${m}" не е в списъка (опитай пак)`,
    statusDown: "Ollama не е достъпен — стартирай приложението Ollama",
    statusServer: "Проблем със сървъра",
    chats: "Чатове",
    prefs: "Настройки",
    newChat: "Нов чат",
    chatHead: "Чат",
    blocksHead: "Блокове на Scratch",
    welcomeBig: "Здравей! 👋",
    welcomeSub: "Попитай ме как да направиш нещо в Scratch — на английски или на български.",
    composerPh: "Попитай за Scratch…",
    composerTip: "Enter за изпращане, Shift+Enter за нов ред",
    send: "Изпрати",
    stop: "Стоп",
    chatsTitle: "Твоите чатове",
    drawerEmpty: "Все още няма чатове. Задай въпрос, за да започнеш!",
    blocksEmpty: "Твоите блокове ще се появят тук.<br>Задай въпрос отляво, за да започнеш.",
    tabLabel: (n) => `Отговор ${n}`,
    scrollToMsg: "Премини към съобщението",
    prefsTitle: "Настройки",
    prefsLang: "Език на приложението",
    langEn: "English",
    langBg: "Български",
    prefsAge: "Възраст на детето (цяло число, 1–17)",
    prefsAgeHint: "Използва се, за да нагласим думите на учителя към детето.",
    prefsAgeErr: "Моля, въведи цяло число от 1 до 17.",
    prefsName: "Име или прякор на детето (по желание)",
    prefsNamePh: "напр. Мишо",
    cancel: "Отказ",
    save: "Запази",
    you: "Ти",
    tutor: "Scratch Помощник",
    delConfirm: "Изтриване на този чат?",
    noAnswer: "Моделът се замисли, но не даде отговор. Опитай пак.",
    noAnswer2: "**Не получих отговор.** Увери се, че приложението Ollama работи, и опитай пак.",
    noBlocks: "Този път няма блокове. Опитай пак — ще направя всичко възможно да ги покажа!",
    stopped: "(спряно)",
    connLost: (m) => `**Връзката прекъсна.** ${m}`,
    ollamaFail: (t) => `**Не мога да достигна Ollama.** Увери се, че приложението Ollama работи и си влязъл (\`ollama signin\`), после опитай пак.\n\n\`${t}\``,
    examples: [
      ["Как да накарам котката да ходи и да каже здравей, когато започна играта?", "Как да накарам котката да ходи и да каже здравей?"],
      ["Как да използвам блок „ако“, за да проверявам точките, когато играчът кликне нещо?", "Как да използвам блок „ако“ за точките?"],
      ["Как да накарам WeDo 2.0 мотор да се включи, когато щракна зеленото знаме?", "Как да включа WeDo 2.0 мотор?"],
    ],
  },
};

let LANG = "en";
const t = (key, ...args) => {
  const v = STRINGS[LANG][key];
  return typeof v === "function" ? v(...args) : v;
};

let currentStatus = { key: "checking", args: [] };
function showStatus(key, ...args) {
  currentStatus = { key, args };
  statusText.textContent = t(key, ...args) || "";
}

function applyI18n(lang) {
  LANG = lang === "bg" ? "bg" : "en";
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const v = STRINGS[LANG][key];
    if (typeof v === "string") el.textContent = v;
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    const v = STRINGS[LANG][el.getAttribute("data-i18n-ph")];
    if (typeof v === "string") el.setAttribute("placeholder", v);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const v = STRINGS[LANG][el.getAttribute("data-i18n-title")];
    if (typeof v === "string") el.setAttribute("title", v);
  });
  // Examples
  examplesEl.innerHTML = "";
  t("examples").forEach(([q, label]) => {
    const li = document.createElement("li");
    li.dataset.q = q;
    li.textContent = label;
    examplesEl.appendChild(li);
  });
  // Re-render status text and input hint in the current language.
  showStatus(currentStatus.key, ...currentStatus.args);
  inputEl.title = t("composerTip") || "";
  scrollToMsgBtn.title = t("scrollToMsg") || "";
  autoGrow();
}

/* ---------- State ---------- */
let prefs = null;
let ollamaOk = false;
let streaming = false;
let abortCtrl = null;
let healthTimer = null;
let currentChatId = null;
let chatMessages = [];      // [{role, content, blocks?}]  — full context for the model
let tabs = [];             // [{label, markup}]  — one per assistant answer with blocks
let activeTab = -1;
let liveRenderedSig = null; // signature of blocks already rendered during the live stream

/* ---------- Bulgarian locale for scratchblocks ---------- */
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
  showStatus("statusChecking");
  try {
    const res = await fetch("/api/health");
    const info = await res.json();
    if (info.ollamaUp && info.modelAvailable) {
      ollamaOk = true; clearHealthTimer();
      statusDot.className = "dot ok";
      showStatus("statusReady");
      enableInput(true);
    } else if (info.ollamaUp && !info.modelAvailable) {
      ollamaOk = true; clearHealthTimer();
      statusDot.className = "dot";
      showStatus("statusModelMissing", info.model);
      enableInput(true);
    } else {
      ollamaOk = false;
      statusDot.className = "dot bad";
      showStatus("statusDown");
      enableInput(false);
      scheduleHealthRetry();
    }
  } catch (e) {
    ollamaOk = false;
    statusDot.className = "dot bad";
    showStatus("statusServer");
    enableInput(false);
    scheduleHealthRetry();
  }
}
function clearHealthTimer() { if (healthTimer) { clearTimeout(healthTimer); healthTimer = null; } }
function scheduleHealthRetry() {
  if (healthTimer) return;
  healthTimer = setTimeout(() => { healthTimer = null; checkHealth(); }, 5000);
}

function enableInput(on) {
  if (streaming) { inputEl.disabled = true; sendBtn.disabled = false; return; }
  // Input is also gated on preferences being set.
  const allow = on && !!prefs;
  inputEl.disabled = !allow;
  sendBtn.disabled = !allow;
  if (allow) inputEl.focus();
}

/* ---------- Tiny safe markdown renderer ---------- */
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function inline(s) {
  s = escapeHtml(s);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
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
    if (!line.trim()) { html += flushPara(para); para = []; i++; continue; }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      html += flushPara(para); para = [];
      html += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
      i++; continue;
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      html += flushPara(para); para = [];
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`); i++;
      }
      html += `<ol>${items.join("")}</ol>`; continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      html += flushPara(para); para = [];
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`); i++;
      }
      html += `<ul>${items.join("")}</ul>`; continue;
    }
    para.push(line); i++;
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
  if (!scripts.length) { showBlocksError(t("noBlocks")); return; }
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
  const svgs = blocksHost.querySelectorAll("svg");
  if (svgs.length === 0) showBlocksError(t("noBlocks"));
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

/* ---------- Right-pane tabs (one per assistant answer) ---------- */
function renderTabs() {
  blockTabsEl.innerHTML = "";
  tabs.forEach((tab, i) => {
    const btn = document.createElement("button");
    btn.className = "tab" + (i === activeTab ? " active" : "");
    btn.textContent = tab.label;
    btn.addEventListener("click", () => selectTab(i));
    blockTabsEl.appendChild(btn);
  });
}
function selectTab(i) {
  if (i < 0 || i >= tabs.length) {
    scrollToMsgBtn.hidden = true;
    return;
  }
  activeTab = i;
  renderTabs();
  renderBlocks(tabs[i].markup);
  scrollToMsgBtn.hidden = false;
}
function addTab(markup, bubble) {
  if (!markup || !markup.trim()) return;
  tabs.push({ label: t("tabLabel", tabs.length + 1), markup, bubble });
  selectTab(tabs.length - 1);
}
function clearTabs() {
  tabs = []; activeTab = -1; blockTabsEl.innerHTML = "";
  blocksHost.innerHTML = ""; blocksWarn.hidden = true; blocksEmpty.hidden = false;
  scrollToMsgBtn.hidden = true;
}

function scrollToMessage(bubble) {
  if (!bubble) return;
  const wrap = bubble.parentElement;
  if (!wrap) return;
  // Align the top of the matching message with the top of the chat area.
  wrap.scrollIntoView({ block: "start", behavior: "smooth" });
}

function scrollMessagesToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

scrollToMsgBtn.addEventListener("click", () => {
  if (activeTab >= 0 && tabs[activeTab] && tabs[activeTab].bubble) {
    scrollToMessage(tabs[activeTab].bubble);
  }
});

/* ---------- Chat send / stream ---------- */
function appendMsg(role, who) {
  const wrap = document.createElement("div");
  wrap.className = "msg " + role;
  const whoEl = document.createElement("div");
  whoEl.className = "who";
  whoEl.textContent = who;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  wrap.appendChild(whoEl); wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

// Render a stored assistant message into the left pane: show only the prose
// explanation (everything before the scratchblocks fence), since the blocks
// themselves live in the right-pane tabs.
function renderAssistantContent(content) {
  const openMatch = content.match(FENCE_OPEN);
  let expl = openMatch ? content.slice(0, openMatch.index) : content;
  if (openMatch) {
    const completeMatch = content.match(FENCE_COMPLETE);
    if (completeMatch) {
      const after = content.slice(openMatch.index + completeMatch[0].length);
      if (after.trim()) expl += "\n\n" + after;
    }
  }
  return renderMarkdown(expl);
}
function extractBlocks(content) {
  const m = content.match(FENCE_COMPLETE);
  return m ? m[1] : "";
}

async function ensureChat() {
  if (currentChatId) return currentChatId;
  const res = await fetch("/api/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lang: prefs ? prefs.lang : "en" }),
  });
  const data = await res.json();
  currentChatId = data.id;
  return currentChatId;
}

async function send(question) {
  if (streaming || !question.trim() || !prefs) return;
  if (welcomeEl) welcomeEl.remove();
  streaming = true;
  enableInput(false);
  sendBtn.textContent = t("stop");

  // Right pane: start a fresh live view for this exchange.
  liveRenderedSig = null;
  blocksHost.innerHTML = "";
  blocksWarn.hidden = true;
  blocksEmpty.hidden = true;

  const userBubble = appendMsg("user", t("you"));
  userBubble.textContent = question;

  // Persist the user message + create the chat lazily, then push to context.
  try {
    await ensureChat();
    await fetch(`/api/chats/${currentChatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", content: question, title: question.slice(0, 60) }),
    });
  } catch (e) { /* non-fatal: still try to answer */ }
  chatMessages.push({ role: "user", content: question });

  const aiBubble = appendMsg("assistant", t("tutor"));
  // Show the thinking indicator immediately, before the fetch, so the child
  // gets instant feedback while the server runs the safety gate and waits for
  // the model's first reasoning delta. updateLive() replaces it once content
  // or reasoning actually arrives.
  aiBubble.innerHTML = thinkingHTML();
  messagesEl.scrollTop = messagesEl.scrollHeight;
  let content = "";
  let reasoning = "";

  abortCtrl = new AbortController();
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatMessages.map((m) => ({ role: m.role, content: m.content })) }),
      signal: abortCtrl.signal,
    });
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      aiBubble.innerHTML = renderMarkdown(t("ollamaFail", txt.slice(0, 200)));
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
      buf = lines.pop();
      for (const line of lines) handleLine(line);
    }
    buf += decoder.decode();
    if (buf.trim()) handleLine(buf);
    finalize(content, reasoning, aiBubble);
  } catch (e) {
    if (e.name === "AbortError") {
      const openMatch = content.match(FENCE_OPEN);
      const expl = openMatch ? content.slice(0, openMatch.index) : content;
      aiBubble.innerHTML = renderMarkdown(expl) + `<p><em>${t("stopped")}</em></p>`;
      const blocks = extractBlocks(content) || (content.match(FENCE_LOOSE) || [])[1] || "";
      if (blocks.trim()) addTab(blocks, aiBubble);
    } else {
      aiBubble.innerHTML = renderMarkdown(t("connLost", e.message));
    }
  } finally {
    finishStream();
  }
}

function thinkingHTML() {
  return '<div class="thinking">🤔 <span class="dots"><i></i><i></i><i></i></span> ' + escapeHtml(t("statusChecking").replace("Ollama", "…")) + '</div>';
}

function updateLive(content, reasoning, aiBubble) {
  if (!content.trim()) {
    aiBubble.innerHTML = reasoning.trim() ? thinkingHTML() : '<span class="cursor"></span>';
    return;
  }
  const openMatch = content.match(FENCE_OPEN);
  const expl = openMatch ? content.slice(0, openMatch.index) : content;
  aiBubble.innerHTML = renderMarkdown(expl) + (streaming ? '<span class="cursor"></span>' : "");

  const completeMatch = content.match(FENCE_COMPLETE);
  if (completeMatch) {
    const markup = completeMatch[1];
    const sig = markup.trim();
    if (sig !== liveRenderedSig && sig.length) {
      liveRenderedSig = sig;
      renderBlocks(markup);
    }
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function finalize(content, reasoning, aiBubble) {
  if (!content.trim()) {
    aiBubble.innerHTML = reasoning.trim()
      ? renderMarkdown(t("noAnswer"))
      : renderMarkdown(t("noAnswer2"));
    finishStream();
    return;
  }
  aiBubble.innerHTML = renderAssistantContent(content);

  const blocks = extractBlocks(content);
  if (blocks.trim()) {
    addTab(blocks, aiBubble);
  } else if (tabs.length === 0) {
    // No blocks this turn (e.g. a polite off-topic refusal) and no prior tabs:
    // show the friendly empty state rather than a scary error.
    blocksHost.innerHTML = "";
    blocksEmpty.hidden = false;
  } else {
    // Keep showing the last existing tab.
    selectTab(activeTab >= 0 ? activeTab : tabs.length - 1);
  }

  // Persist the assistant message + add to context.
  chatMessages.push({ role: "assistant", content, blocks: blocks || null });
  if (currentChatId) {
    fetch(`/api/chats/${currentChatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "assistant", content, blocks: blocks || null }),
    }).catch(() => {});
  }
  refreshChatList();
}

function finishStream() {
  streaming = false;
  sendBtn.textContent = t("send");
  enableInput(ollamaOk);
}

/* ---------- Chat history (drawer) ---------- */
async function refreshChatList() {
  try {
    const res = await fetch("/api/chats");
    const chats = await res.json();
    chatList.innerHTML = "";
    if (!chats.length) {
      const div = document.createElement("div");
      div.className = "drawer-empty";
      div.textContent = t("drawerEmpty");
      chatList.appendChild(div);
      return;
    }
    chats.forEach((c) => {
      const row = document.createElement("div");
      row.className = "chat-row" + (c.id === currentChatId ? " active" : "");
      const title = document.createElement("div");
      title.className = "chat-title";
      title.textContent = c.title || t("newChat");
      const time = document.createElement("div");
      time.className = "chat-time";
      time.textContent = relativeTime(c.updated_at);
      const del = document.createElement("button");
      del.className = "chat-del";
      del.textContent = "✕";
      del.title = t("delConfirm");
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(t("delConfirm"))) return;
        await fetch(`/api/chats/${c.id}`, { method: "DELETE" });
        if (c.id === currentChatId) startNewChat();
        refreshChatList();
      });
      row.appendChild(title); row.appendChild(time); row.appendChild(del);
      row.addEventListener("click", () => loadChat(c.id));
      chatList.appendChild(row);
    });
  } catch (e) { /* ignore */ }
}

function relativeTime(unix) {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unix);
  if (diff < 60) return "·";
  if (diff < 3600) return Math.floor(diff / 60) + "m";
  if (diff < 86400) return Math.floor(diff / 3600) + "h";
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + "d";
  return new Date(unix * 1000).toLocaleDateString();
}

async function loadChat(id) {
  if (streaming && abortCtrl) abortCtrl.abort();
  try {
    const res = await fetch(`/api/chats/${id}`);
    const data = await res.json();
    if (!data.chat) return;
    currentChatId = data.chat.id;
    chatMessages = (data.messages || []).map((m) => ({
      role: m.role,
      content: m.content,
      blocks: m.blocks || null,
    }));
    // Rebuild the left pane.
    messagesEl.innerHTML = "";
    clearTabs();
    chatMessages.forEach((m) => {
      if (m.role === "user") {
        const b = appendMsg("user", t("you"));
        b.textContent = m.content;
      } else {
        const b = appendMsg("assistant", t("tutor"));
        b.innerHTML = renderAssistantContent(m.content);
        const blocks = m.blocks || extractBlocks(m.content);
        if (blocks && blocks.trim()) addTab(blocks, b);
      }
    });
    if (chatMessages.length === 0) showWelcome();
    if (tabs.length) selectTab(tabs.length - 1);
    else clearTabs();
    // When loading a saved chat, jump to the bottom of the last message.
    scrollMessagesToBottom();
    chatDrawer.hidden = true;
    chatBackdrop.hidden = true;
    refreshChatList();
  } catch (e) { /* ignore */ }
}

function showWelcome() {
  messagesEl.innerHTML = "";
  const w = document.createElement("div");
  w.className = "welcome";
  w.id = "welcome";
  w.innerHTML = `<div class="welcome-big">${escapeHtml(t("welcomeBig"))}</div>
    <div class="welcome-sub" id="welcomeSub">${t("welcomeSub")}</div>
    <ul class="examples" id="examples"></ul>`;
  messagesEl.appendChild(w);
  // Re-populate examples (applyI18n targets the original #examples; rebind here).
  const ex = w.querySelector("#examples");
  t("examples").forEach(([q, label]) => {
    const li = document.createElement("li");
    li.dataset.q = q;
    li.textContent = label;
    ex.appendChild(li);
  });
}

function startNewChat() {
  if (streaming && abortCtrl) abortCtrl.abort();
  currentChatId = null;
  chatMessages = [];
  clearTabs();
  showWelcome();
  refreshChatList();
}

/* ---------- Preferences ---------- */
async function loadPreferences() {
  try {
    const res = await fetch("/api/preferences");
    const data = await res.json();
    if (data.present && data.prefs) {
      prefs = data.prefs;
      if (prefs.age == null) prefs = null; // treat incomplete as not set
    }
  } catch (e) { /* ignore */ }
  if (prefs) {
    applyI18n(prefs.lang);
    checkHealth();
    enableInput(ollamaOk);
  } else {
    // First run (or incomplete prefs): force the modal.
    prefs = null;
    openPrefs(true);
  }
}

function openPrefs(forceFirst) {
  // Pre-fill from current prefs (or defaults).
  const cur = prefs || { lang: "en", age: null, name: "" };
  prefsForm.querySelector(`input[name="pLang"][value="${cur.lang || "en"}"]`).checked = true;
  pAge.value = cur.age != null ? cur.age : "";
  pName.value = cur.name || "";
  pAgeErr.hidden = true;
  prefsModal.hidden = false;
  prefsModal.dataset.first = forceFirst ? "1" : "";
}

function closePrefs() {
  // On first run we must not let the child close without saving.
  if (prefsModal.dataset.first === "1") return;
  prefsModal.hidden = true;
}

prefsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  pAgeErr.hidden = true;
  const lang = prefsForm.querySelector('input[name="pLang"]:checked').value;
  const ageRaw = pAge.value.trim();
  const age = Number(ageRaw);
  if (ageRaw === "" || !Number.isInteger(age) || age < 1 || age > 17) {
    pAgeErr.textContent = t("prefsAgeErr");
    pAgeErr.hidden = false;
    pAge.focus();
    return;
  }
  const name = pName.value.trim();
  const res = await fetch("/api/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lang, age, name }),
  });
  const data = await res.json();
  if (!res.ok || !data.prefs) {
    pAgeErr.textContent = (data.error || t("prefsAgeErr"));
    pAgeErr.hidden = false;
    return;
  }
  prefs = data.prefs;
  applyI18n(prefs.lang);
  checkHealth();
  prefsModal.dataset.first = "";
  prefsModal.hidden = true;
  enableInput(ollamaOk);
  refreshChatList();
});

// Age input: only whole numbers. Strip anything that would make it non-integer.
pAge.addEventListener("input", () => {
  pAgeErr.hidden = true;
  if (pAge.value === "") return;
  const cleaned = pAge.value.replace(/[^0-9]/g, "");
  if (cleaned !== pAge.value) pAge.value = cleaned;
  if (pAge.value !== "" && Number(pAge.value) > 17) pAge.value = "17";
});

prefsBtn.addEventListener("click", () => openPrefs(false));
prefsClose.addEventListener("click", closePrefs);
prefsCancel.addEventListener("click", closePrefs);
prefsModal.addEventListener("click", (e) => { if (e.target === prefsModal) closePrefs(); });

/* ---------- Chat drawer ---------- */
function openDrawer() { chatDrawer.hidden = false; chatBackdrop.hidden = false; refreshChatList(); }
function closeDrawer() { chatDrawer.hidden = true; chatBackdrop.hidden = true; }
chatsBtn.addEventListener("click", async () => { if (chatDrawer.hidden) openDrawer(); else closeDrawer(); });
drawerClose.addEventListener("click", closeDrawer);
chatBackdrop.addEventListener("click", closeDrawer);

/* ---------- Composer ---------- */
function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
}
inputEl.addEventListener("input", autoGrow);

composerEl.addEventListener("submit", (e) => {
  e.preventDefault();
  if (streaming) { if (abortCtrl) abortCtrl.abort(); return; }
  const q = inputEl.value.trim();
  if (!q) return;
  inputEl.value = "";
  autoGrow();
  send(q);
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); composerEl.requestSubmit(); }
});

examplesEl.addEventListener("click", (e) => {
  const li = e.target.closest("li[data-q]");
  if (!li) return;
  inputEl.value = li.dataset.q;
  autoGrow();
  composerEl.requestSubmit();
});

newChatBtn.addEventListener("click", startNewChat);

/* ---------- Boot ---------- */
applyI18n("en");
checkHealth();
loadPreferences();
refreshChatList();

/* Refresh = new chat. Also guard against bfcache restoring a stale stream. */
window.addEventListener("pageshow", (e) => { if (e.persisted) location.reload(); });

// Close drawers/modals with Escape.
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!chatDrawer.hidden) { closeDrawer(); e.preventDefault(); }
    else if (!prefsModal.hidden) { closePrefs(); e.preventDefault(); }
  }
});