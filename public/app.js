const messagesEl = document.getElementById("messages");
const emptyEl = document.getElementById("empty");
const form = document.getElementById("chatForm");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const newChatBtn = document.getElementById("newChat");

let sessionId = localStorage.getItem("fergus_session") || crypto.randomUUID();
localStorage.setItem("fergus_session", sessionId);
let busy = false;

/* ---------- helpers ---------- */

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Very small markdown: **bold**, `code`, and line breaks.
function renderMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function hideEmpty() {
  if (emptyEl) emptyEl.style.display = "none";
}

function addUserMessage(text) {
  hideEmpty();
  const wrap = document.createElement("div");
  wrap.className = "msg user";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  scrollToBottom();
}

/* Creates an assistant turn container and returns a controller. */
function createAssistantTurn() {
  hideEmpty();
  const wrap = document.createElement("div");
  wrap.className = "msg assistant";

  const thinkingEl = document.createElement("div");
  thinkingEl.className = "thinking";
  thinkingEl.style.display = "none";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const typing = document.createElement("div");
  typing.className = "typing";
  typing.innerHTML = "<span></span><span></span><span></span>";
  bubble.appendChild(typing);

  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  scrollToBottom();

  let text = "";
  let thinking = "";
  let typingRemoved = false;
  let currentTool = null;

  const removeTyping = () => {
    if (!typingRemoved) {
      typing.remove();
      typingRemoved = true;
    }
  };

  return {
    tool(name) {
      // Insert a tool chip before the bubble.
      const chip = document.createElement("div");
      chip.className = "tool-chip";
      const pretty = String(name || "tool").replace(/^manage-/, "").replace(/[-_]/g, " ");
      chip.innerHTML = `<span class="dot"></span> Fergus · ${escapeHtml(pretty)}`;
      wrap.insertBefore(chip, bubble);
      currentTool = chip;
      scrollToBottom();
    },
    thinking(chunk) {
      thinking += chunk;
      thinkingEl.style.display = "block";
      thinkingEl.textContent = thinking;
      if (!wrap.contains(thinkingEl)) wrap.insertBefore(thinkingEl, bubble);
      scrollToBottom();
    },
    text(chunk) {
      removeTyping();
      // Once real text arrives, collapse the thinking preview.
      thinkingEl.style.display = "none";
      text += chunk;
      bubble.innerHTML = renderMarkdown(text);
      scrollToBottom();
    },
    error(message) {
      removeTyping();
      bubble.className = "error-bubble";
      bubble.textContent = message;
      scrollToBottom();
    },
    finish() {
      removeTyping();
      if (!text.trim() && bubble.className === "bubble") {
        bubble.textContent = "(no response)";
      }
    },
  };
}

/* ---------- streaming request ---------- */

async function sendMessage(text) {
  if (busy || !text.trim()) return;
  busy = true;
  sendBtn.disabled = true;
  input.value = "";
  autoGrow();

  addUserMessage(text);
  const turn = createAssistantTurn();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: text }),
    });

    if (!res.ok || !res.body) {
      const info = await res.json().catch(() => ({}));
      if (info.needsLogin) {
        window.location.href = "/login";
        return;
      }
      turn.error(info.error || `Request failed (${res.status})`);
      if (info.needsFergus && typeof refreshFergusStatus === "function") refreshFergusStatus();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";

      for (const block of blocks) {
        let event = "message";
        let data = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (!data) continue;
        let payload;
        try {
          payload = JSON.parse(data);
        } catch {
          continue;
        }

        if (event === "text") turn.text(payload.text || "");
        else if (event === "thinking") turn.thinking(payload.text || "");
        else if (event === "tool") turn.tool(payload.name);
        else if (event === "error") turn.error(payload.message || "Error");
        else if (event === "done") turn.finish();
      }
    }
    turn.finish();
  } catch (err) {
    turn.error(err?.message || "Connection lost.");
  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

/* ---------- UI wiring ---------- */

function autoGrow() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";
}

input.addEventListener("input", autoGrow);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(input.value);
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => sendMessage(chip.textContent.trim()));
});

/* ---------- Fergus connection + account ---------- */

const fergusPill = document.getElementById("fergusPill");
const connectBtn = document.getElementById("connectFergus");
const banner = document.getElementById("fergusBanner");
const bannerConnect = document.getElementById("bannerConnect");
const logoutBtn = document.getElementById("logout");

function goConnect() {
  window.location.href = "/api/fergus/connect";
}
connectBtn.addEventListener("click", goConnect);
bannerConnect.addEventListener("click", goConnect);

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/login";
});

async function refreshFergusStatus() {
  try {
    const res = await fetch("/api/fergus/status");
    const { connected } = await res.json();
    if (connected) {
      fergusPill.textContent = "Fergus: connected";
      fergusPill.className = "pill pill-on";
      connectBtn.hidden = true;
      banner.hidden = true;
    } else {
      fergusPill.textContent = "Fergus: not connected";
      fergusPill.className = "pill pill-off";
      connectBtn.hidden = false;
      banner.hidden = false;
    }
  } catch {
    fergusPill.textContent = "Fergus: unknown";
    fergusPill.className = "pill pill-off";
  }
}

// Surface the result of the OAuth round-trip and clean up the URL.
(function handleReturnParams() {
  const params = new URLSearchParams(window.location.search);
  const err = params.get("fergus_error");
  if (err) {
    banner.hidden = false;
    document.getElementById("bannerText").textContent = "Fergus connection failed: " + err;
  }
  if (params.get("fergus") || err) {
    window.history.replaceState({}, "", "/");
  }
})();

refreshFergusStatus();
setInterval(refreshFergusStatus, 60000);

newChatBtn.addEventListener("click", async () => {
  await fetch("/api/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {});
  sessionId = crypto.randomUUID();
  localStorage.setItem("fergus_session", sessionId);
  messagesEl.innerHTML = "";
  messagesEl.appendChild(emptyEl);
  emptyEl.style.display = "";
  input.focus();
});

input.focus();
