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
    getText() {
      return text;
    },
  };
}

/* ---------- streaming request ---------- */

async function sendMessage(text, viaVoice = false) {
  if (busy || !text.trim()) return;
  busy = true;
  sendBtn.disabled = true;
  if (window.speechSynthesis) window.speechSynthesis.cancel();
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
    if (!viaVoice) input.focus();
  }

  // Speak the reply back when the user talked to it (or hands-free is on).
  const replyText = turn.getText();
  if ((viaVoice || handsFree) && replyText.trim()) {
    if (handsFree) {
      // Listen WHILE speaking so the user can talk over her (barge-in),
      // then keep listening for the next turn.
      startListening();
      speak(replyText);
    } else {
      speak(replyText);
    }
  } else if (handsFree) {
    startListening();
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

/* ---------- Voice: talk to it, and it talks back ---------- */

const micBtn = document.getElementById("mic");
const handsFreeBtn = document.getElementById("handsFree");
const hintEl = document.getElementById("hint");

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;

// In-app browsers (Messenger/Facebook/Instagram/etc.) expose the speech API but
// the microphone doesn't actually work in them — voice needs real Chrome/Safari.
const ua = navigator.userAgent || "";
const inAppBrowser = /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|Twitter|WebView|; wv\)/i.test(ua);
const voiceSupported = !!SpeechRec && !inAppBrowser;

const DEFAULT_HINT = 'Tap the mic to talk · Hands-free for the van · say “stop” to cut her off';
let hintTimer = null;
function voiceNote(msg) {
  if (!hintEl) return;
  hintEl.textContent = msg;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    hintEl.textContent = DEFAULT_HINT;
  }, 6000);
}

let handsFree = false;
let recognizing = false;
let recognition = null;

const SPEAK_RATE = 1.5; // 1.5x speed

// Barge-in tuning. While she's talking, only a stop word or a clearly-real
// phrase interrupts her — short fragments (usually the echo of her own voice
// through the speaker) are ignored. Raise these to make her LESS likely to cut
// herself off (i.e. lower the effective mic sensitivity while she speaks).
const STOP_WORDS = /\b(stop|wait|hold on|hang on|quiet|shush|enough|pause|cancel|thanks claude)\b/i;
const BARGE_MIN_CHARS = 15;
const BARGE_MIN_WORDS = 3;
const BARGE_GRACE_MS = 700; // ignore the first moment after she starts (leading echo)
let speakStartedAt = 0;

function isStopOnly(t) {
  return STOP_WORDS.test(t) && t.replace(STOP_WORDS, "").replace(/[^a-z0-9]/gi, "").length < 3;
}

// Pick the smoothest available ENGLISH voice. Never fall back to a
// non-English voice — reading English text with, say, a Chinese engine
// sounds wrong. If the device has no English voice, we leave chosenVoice
// null and just set the utterance language to English.
let chosenVoice = null;
function pickVoice() {
  if (!synth) return;
  const voices = synth.getVoices();
  if (!voices.length) return;
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang || ""));
  if (!en.length) {
    chosenVoice = null;
    return;
  }
  const byName = (frag) => en.find((v) => (v.name || "").toLowerCase().includes(frag));
  chosenVoice =
    byName("google uk english female") ||
    byName("libby") ||
    byName("sonia") ||
    byName("aria") ||
    byName("jenny") ||
    byName("natural") ||
    byName("samantha") ||
    byName("karen") ||
    en.find((v) => /^en[-_]?(nz|au|gb)/i.test(v.lang)) ||
    en.find((v) => /^en[-_]?us/i.test(v.lang)) ||
    en[0];
}
if (synth) {
  pickVoice();
  synth.addEventListener?.("voiceschanged", pickVoice);
}

function speak(text, onEnd) {
  if (!synth) {
    if (onEnd) onEnd();
    return;
  }
  synth.cancel();
  // Strip the little markdown bits so it reads naturally.
  const clean = text
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/^[#>\-*]\s?/gm, "")
    .trim();
  if (!clean) {
    if (onEnd) onEnd();
    return;
  }
  if (!chosenVoice) pickVoice(); // voices may have loaded after startup
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = "en-NZ"; // always English, even if no specific voice is chosen
  if (chosenVoice && /^en/i.test(chosenVoice.lang || "")) {
    utter.voice = chosenVoice;
    utter.lang = chosenVoice.lang;
  }
  utter.rate = SPEAK_RATE;
  utter.onend = () => onEnd && onEnd();
  utter.onerror = () => onEnd && onEnd();
  speakStartedAt = Date.now();
  synth.speak(utter);
}

function setListening(on) {
  recognizing = on;
  micBtn.classList.toggle("listening", on);
}

function startListening() {
  if (!voiceSupported || recognizing || busy) return;
  recognition = new SpeechRec();
  recognition.lang = "en-NZ";
  recognition.interimResults = true;
  recognition.continuous = handsFree; // keep the mic open in hands-free so you can talk over her
  recognition.maxAlternatives = 1;

  let finalText = "";
  let sent = false;
  setListening(true);

  recognition.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const chunk = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += chunk;
      else interim += chunk;
    }
    const heard = (finalText + interim).trim();
    if (!heard) return;

    // While she's speaking, be picky about what counts as "talking over her",
    // so the echo of her own voice doesn't make her cut herself off.
    if (synth && synth.speaking) {
      const isStop = STOP_WORDS.test(heard);
      const withinGrace = Date.now() - speakStartedAt < BARGE_GRACE_MS;
      const strong =
        heard.length >= BARGE_MIN_CHARS && heard.split(/\s+/).length >= BARGE_MIN_WORDS;

      if (isStop) {
        synth.cancel(); // "stop" always works
        finalText = "";
        input.value = "";
        autoGrow();
        return; // just stop; wait for the real command next
      }
      if (withinGrace || !strong) {
        finalText = ""; // treat short/early speech as echo — ignore it
        return;
      }
      synth.cancel(); // a genuine phrase over the top → cut her off and take it
    }

    input.value = heard;
    autoGrow();

    // In hands-free, send as soon as a complete phrase lands.
    if (handsFree && finalText.trim() && !sent) {
      const text = finalText.trim();
      if (isStopOnly(text)) {
        finalText = ""; // a bare "stop" isn't a query — don't send it
        input.value = "";
        return;
      }
      sent = true;
      finalText = "";
      stopListening();
      sendMessage(text, true);
    }
  };

  recognition.onerror = (e) => {
    setListening(false);
    const kind = e && e.error;
    if (kind === "not-allowed" || kind === "service-not-allowed" || kind === "audio-capture") {
      if (handsFree) {
        handsFree = false;
        handsFreeBtn.classList.remove("active");
        handsFreeBtn.textContent = "🎙️ Hands-free";
      }
      voiceNote(
        kind === "audio-capture"
          ? "No microphone found on this device."
          : "Microphone blocked — allow the mic, and use Chrome (not the Messenger browser).",
      );
    }
    // "no-speech" / "aborted" are normal in hands-free — onend will resume.
  };

  recognition.onend = () => {
    setListening(false);
    if (!handsFree) {
      const text = input.value.trim();
      if (text && !sent) {
        sent = true;
        sendMessage(text, true);
      }
      return;
    }
    // Hands-free: if nothing was sent (e.g. a silence), keep the mic alive.
    if (!sent && !busy) {
      setTimeout(() => {
        if (handsFree && !recognizing && !busy) startListening();
      }, 300);
    }
  };

  try {
    recognition.start();
  } catch {
    setListening(false);
    voiceNote("Voice isn't available here — open the site in Chrome and try again.");
  }
}

function stopListening() {
  if (recognition && recognizing) {
    try {
      recognition.stop();
    } catch {
      /* ignore */
    }
  }
}

if (voiceSupported) {
  micBtn.hidden = false;
  handsFreeBtn.hidden = false;
  if (hintEl) hintEl.textContent = DEFAULT_HINT;

  micBtn.addEventListener("click", () => {
    if (recognizing) {
      stopListening();
    } else {
      if (synth) synth.cancel(); // tapping the mic also stops her talking
      startListening();
    }
  });

  handsFreeBtn.addEventListener("click", () => {
    handsFree = !handsFree;
    handsFreeBtn.classList.toggle("active", handsFree);
    handsFreeBtn.textContent = handsFree ? "🎙️ Hands-free on" : "🎙️ Hands-free";
    if (handsFree) {
      if (!recognizing && !busy) startListening();
    } else {
      if (synth) synth.cancel();
      stopListening();
    }
  });
} else if (hintEl) {
  // Keep the mic/hands-free buttons hidden and explain why.
  hintEl.textContent = inAppBrowser
    ? "For voice, tap ⋯ (top-right) → “Open in Chrome”, then allow the microphone"
    : "Voice needs Chrome (Android/desktop) — typing works everywhere";
}

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
