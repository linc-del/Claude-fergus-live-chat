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

function addUserMessage(text, attachments = []) {
  hideEmpty();
  const wrap = document.createElement("div");
  wrap.className = "msg user";
  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (attachments.length) {
    const strip = document.createElement("div");
    strip.className = "msg-attachments";
    for (const a of attachments) {
      if (a.mimeType && a.mimeType.startsWith("image/")) {
        const img = document.createElement("img");
        img.className = "msg-thumb";
        img.src = `data:${a.mimeType};base64,${a.data}`;
        img.alt = a.name || "image";
        strip.appendChild(img);
      } else {
        const chip = document.createElement("span");
        chip.className = "file-chip";
        chip.textContent = "📄 " + (a.name || "file");
        strip.appendChild(chip);
      }
    }
    bubble.appendChild(strip);
  }
  if (text) {
    const t = document.createElement("div");
    t.textContent = text;
    bubble.appendChild(t);
  }

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
  // Allow sending if there's text OR at least one attachment.
  if (busy || (!text.trim() && pendingAttachments.length === 0)) return;
  busy = true;
  sendBtn.disabled = true;
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (typeof clearPending === "function") clearPending();
  input.value = "";
  autoGrow();

  const attachments = pendingAttachments.slice();
  clearAttachments();

  const shown = text.trim() || (attachments.length ? "" : text);
  addUserMessage(shown, attachments);
  const turn = createAssistantTurn();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: text, attachments }),
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

/* ---------- Attachments (photos & PDFs) ---------- */

const attachBtn = document.getElementById("attach");
const fileInput = document.getElementById("fileInput");
const attachmentsEl = document.getElementById("attachments");
let pendingAttachments = [];

const MAX_IMAGE_DIM = 1568; // downscale photos to the vision sweet spot
const MAX_FILE_MB = 20;

attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files || []);
  fileInput.value = ""; // allow re-picking the same file
  for (const file of files) {
    if (file.size > MAX_FILE_MB * 1024 * 1024 && !file.type.startsWith("image/")) {
      voiceNote?.(`${file.name} is too big (max ${MAX_FILE_MB}MB).`);
      continue;
    }
    try {
      const att = await fileToAttachment(file);
      pendingAttachments.push(att);
    } catch {
      voiceNote?.(`Couldn't attach ${file.name}.`);
    }
  }
  renderAttachments();
});

function renderAttachments() {
  attachmentsEl.innerHTML = "";
  attachmentsEl.hidden = pendingAttachments.length === 0;
  pendingAttachments.forEach((a, i) => {
    const chip = document.createElement("div");
    chip.className = "attach-chip";
    if (a.mimeType && a.mimeType.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = `data:${a.mimeType};base64,${a.data}`;
      chip.appendChild(img);
    } else {
      const icon = document.createElement("span");
      icon.textContent = "📄";
      chip.appendChild(icon);
    }
    const label = document.createElement("span");
    label.className = "attach-name";
    label.textContent = a.name || "file";
    chip.appendChild(label);
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "attach-remove";
    rm.setAttribute("aria-label", "Remove");
    rm.textContent = "×";
    rm.addEventListener("click", () => {
      pendingAttachments.splice(i, 1);
      renderAttachments();
    });
    chip.appendChild(rm);
    attachmentsEl.appendChild(chip);
  });
}

function clearAttachments() {
  pendingAttachments = [];
  renderAttachments();
}

async function fileToAttachment(file) {
  if (file.type && file.type.startsWith("image/")) {
    const { mimeType, data } = await downscaleImage(file, MAX_IMAGE_DIM, 0.85);
    return { name: file.name, mimeType, data };
  }
  const data = await fileToBase64(file);
  return { name: file.name, mimeType: file.type || "application/octet-stream", data };
}

function downscaleImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve({ mimeType: "image/jpeg", data: dataUrl.split(",")[1] });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ---------- Fergus connection + account ---------- */

const fergusPill = document.getElementById("fergusPill");
const connectBtn = document.getElementById("connectFergus");
const gmailPill = document.getElementById("gmailPill");
const connectGmailBtn = document.getElementById("connectGmail");
const banner = document.getElementById("fergusBanner");
const bannerConnect = document.getElementById("bannerConnect");
const logoutBtn = document.getElementById("logout");

function goConnect() {
  window.location.href = "/api/fergus/connect";
}
function goConnectGmail() {
  window.location.href = "/api/gmail/connect";
}
connectBtn.addEventListener("click", goConnect);
connectGmailBtn.addEventListener("click", goConnectGmail);
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

async function refreshGmailStatus() {
  try {
    const res = await fetch("/api/gmail/status");
    const data = await res.json();
    const accounts = data.accounts || [];
    if (data.connected && accounts.length) {
      const label =
        accounts.length === 1 ? "Gmail: 1 inbox" : `Gmail: ${accounts.length} inboxes`;
      gmailPill.textContent = label;
      gmailPill.title = accounts.join("\n");
      gmailPill.className = "pill pill-on";
      // Keep the button visible so you can add more mailboxes.
      connectGmailBtn.hidden = false;
      connectGmailBtn.textContent = "Add inbox";
    } else {
      gmailPill.textContent = "Gmail: not connected";
      gmailPill.title = "";
      gmailPill.className = "pill pill-off";
      connectGmailBtn.hidden = false;
      connectGmailBtn.textContent = "Connect Gmail";
    }
  } catch {
    gmailPill.textContent = "Gmail: unknown";
    gmailPill.className = "pill pill-off";
  }
}

// Surface the result of the OAuth round-trip and clean up the URL.
(function handleReturnParams() {
  const params = new URLSearchParams(window.location.search);
  const ferguErr = params.get("fergus_error");
  const gmailErr = params.get("gmail_error");
  if (ferguErr) {
    banner.hidden = false;
    document.getElementById("bannerText").textContent = "Fergus connection failed: " + ferguErr;
  }
  if (gmailErr) {
    banner.hidden = false;
    document.getElementById("bannerText").textContent = "Gmail connection failed: " + gmailErr;
  }
  if (params.get("fergus") || ferguErr || params.get("gmail") || gmailErr) {
    window.history.replaceState({}, "", "/");
  }
})();

refreshFergusStatus();
refreshGmailStatus();
setInterval(refreshFergusStatus, 60000);
setInterval(refreshGmailStatus, 60000);

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

// Hands-free dictation buffer. We only send after you've actually stopped
// talking (a real pause), so you can speak a full sentence with little gaps.
// `committed` holds finalized speech carried across the recogniser's automatic
// restarts; each active session's transcript is rebuilt fresh (never appended)
// to avoid the word-stacking bug.
const SILENCE_MS = 1100; // extra wait after the last finished phrase before sending
let committed = "";
let liveText = ""; // committed + the current session's finalized words
let flushTimer = null;

function clearPending() {
  committed = "";
  liveText = "";
  clearTimeout(flushTimer);
  flushTimer = null;
}

function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    const text = liveText.trim();
    clearPending();
    input.value = "";
    if (!text || isStopOnly(text)) return;
    stopListening();
    sendMessage(text, true);
  }, SILENCE_MS);
}

function setListening(on) {
  recognizing = on;
  micBtn.classList.toggle("listening", on);
}

function startListening() {
  if (!voiceSupported || recognizing || busy) return;
  recognition = new SpeechRec();
  recognition.lang = "en-NZ";
  // No interim results — they stack/duplicate on some Android builds. We take
  // only finished phrases, which the recogniser endpoints on a natural pause.
  recognition.interimResults = false;
  recognition.continuous = handsFree; // keep the mic open in hands-free so you can talk over her
  recognition.maxAlternatives = 1;

  let sessionFinal = ""; // finalized words for THIS recogniser session (rebuilt each event)
  let sent = false;
  setListening(true);

  recognition.onresult = (e) => {
    // Rebuild this session's transcript from scratch every event (index 0),
    // so nothing stacks. Only final results exist now.
    let fin = "";
    for (let i = 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) fin += e.results[i][0].transcript + " ";
    }
    sessionFinal = fin.trim();
    liveText = (committed + " " + sessionFinal).trim();
    if (!liveText) return;

    // While she's speaking, be picky about what counts as "talking over her",
    // so the echo of her own voice doesn't make her cut herself off.
    if (synth && synth.speaking) {
      const isStop = STOP_WORDS.test(liveText);
      const withinGrace = Date.now() - speakStartedAt < BARGE_GRACE_MS;
      const strong =
        liveText.length >= BARGE_MIN_CHARS && liveText.split(/\s+/).length >= BARGE_MIN_WORDS;

      if (isStop) {
        synth.cancel(); // "stop" always works
        clearPending();
        input.value = "";
        autoGrow();
        return;
      }
      if (withinGrace || !strong) {
        return; // short/early speech is almost certainly echo — ignore it
      }
      synth.cancel(); // a genuine phrase over the top → cut her off and take it
    }

    input.value = liveText;
    autoGrow();
    if (handsFree) scheduleFlush(); // send once they actually pause
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
    // Commit this session's finalized words so they survive the restart.
    committed = (committed + " " + sessionFinal).trim();
    sessionFinal = "";

    if (!handsFree) {
      // Push-to-talk: send the one utterance when the mic stops.
      const text = committed.trim();
      committed = "";
      liveText = "";
      if (text && !sent) {
        sent = true;
        sendMessage(text, true);
      }
      return;
    }
    // Hands-free: recognition often stops on its own between phrases. Keep the
    // mic alive so the person can keep talking; the flush timer handles sending
    // once they actually pause. (Don't restart while we're busy replying.)
    if (!busy) {
      setTimeout(() => {
        if (handsFree && !recognizing && !busy) startListening();
      }, 250);
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
      clearPending();
      input.value = "";
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
