import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  ANTHROPIC_API_KEY,
  MODEL,
  PORT,
  PUBLIC_URL,
  FERGUS_MCP_URL,
} from "./config.js";
import { checkPassword, issueSession, clearSession, requireAuth } from "./auth.js";
import { startAuth as startFergusAuth, handleCallback as handleFergusCallback, getAccessToken as getFergusToken, isConnected as isFergusConnected, disconnect as disconnectFergus } from "./fergus.js";
import { startAuth as startGmailAuth, handleCallback as handleGmailCallback, getAccessToken as getGmailToken, isConnected as isGmailConnected, disconnect as disconnectGmail } from "./gmail.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "..", "public");

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// The system prompt is assembled from the markdown files in prompts/ (base
// persona + the gear-entry workflow + Linc's standard fits + NZ shorthand).
// Edit those files to change behaviour — no code change needed.
const PROMPTS_DIR = path.join(__dirname, "..", "prompts");
function loadSystemPrompt(): string {
  try {
    const files = fs
      .readdirSync(PROMPTS_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort();
    const parts = files
      .map((f) => fs.readFileSync(path.join(PROMPTS_DIR, f), "utf8").trim())
      .filter(Boolean);
    if (parts.length) return parts.join("\n\n---\n\n");
  } catch (err) {
    console.error("Could not load prompts/:", err);
  }
  return "You are the internal assistant for Linc Electrical. Use the connected Fergus tools to look up and act on real job data; confirm before changing anything.";
}
const SYSTEM_PROMPT = loadSystemPrompt();

interface Session {
  messages: any[];
  lastUsed: number;
}
const sessions = new Map<string, Session>();

const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.lastUsed > SESSION_TTL_MS) sessions.delete(id);
}, 30 * 60 * 1000).unref();

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));

/* ---------- public (no login required) ---------- */
app.get("/login", (_req, res) => res.sendFile(path.join(PUBLIC, "login.html")));
app.get("/login.js", (_req, res) => res.sendFile(path.join(PUBLIC, "login.js")));
app.get("/styles.css", (_req, res) => res.sendFile(path.join(PUBLIC, "styles.css")));

app.post("/api/login", (req, res) => {
  if (checkPassword(req.body?.password)) {
    issueSession(res);
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: "Wrong password" });
  }
});
app.post("/api/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

/* ---------- everything below requires app login ---------- */
app.use(requireAuth);

app.get("/api/session", (_req, res) => res.json({ sessionId: crypto.randomUUID() }));
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, model: MODEL, fergusConnected: isFergusConnected(), gmailConnected: isGmailConnected() }),
);

app.get("/api/fergus/status", (_req, res) => res.json({ connected: isFergusConnected() }));
app.get("/api/fergus/connect", async (_req, res) => {
  try {
    res.redirect(await startFergusAuth());
  } catch (err: any) {
    res.redirect("/?fergus_error=" + encodeURIComponent(err?.message ?? "Could not start Fergus login"));
  }
});
app.get("/api/fergus/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) {
    res.redirect("/?fergus_error=" + encodeURIComponent(error));
    return;
  }
  try {
    await handleFergusCallback(code, state);
    res.redirect("/?fergus=connected");
  } catch (err: any) {
    res.redirect("/?fergus_error=" + encodeURIComponent(err?.message ?? "Fergus login failed"));
  }
});
app.post("/api/fergus/disconnect", (_req, res) => {
  disconnectFergus();
  res.json({ ok: true });
});

app.get("/api/gmail/status", (_req, res) => res.json({ connected: isGmailConnected() }));
app.get("/api/gmail/connect", async (_req, res) => {
  try {
    res.redirect(await startGmailAuth());
  } catch (err: any) {
    res.redirect("/?gmail_error=" + encodeURIComponent(err?.message ?? "Could not start Gmail login"));
  }
});
app.get("/api/gmail/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) {
    res.redirect("/?gmail_error=" + encodeURIComponent(error));
    return;
  }
  try {
    await handleGmailCallback(code, state);
    res.redirect("/?gmail=connected");
  } catch (err: any) {
    res.redirect("/?gmail_error=" + encodeURIComponent(err?.message ?? "Gmail login failed"));
  }
});
app.post("/api/gmail/disconnect", (_req, res) => {
  disconnectGmail();
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  const { sessionId, message } = req.body ?? {};
  if (typeof sessionId !== "string" || !sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  // Make sure Fergus is connected and we have a fresh token *before* streaming.
  let fergusToken: string;
  try {
    fergusToken = await getFergusToken();
  } catch {
    res.status(409).json({
      error: "Fergus is not connected yet. Click Connect Fergus at the top, then try again.",
      needsFergus: true,
    });
    return;
  }

  let session = sessions.get(sessionId);
  if (!session) {
    session = { messages: [], lastUsed: Date.now() };
    sessions.set(sessionId, session);
  }
  session.lastUsed = Date.now();
  session.messages.push({ role: "user", content: message });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  (res as any).flushHeaders?.();

  const send = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const mcpServer: any = {
    type: "url",
    url: FERGUS_MCP_URL,
    name: "fergus",
    authorization_token: fergusToken,
  };

  let aborted = false;
  let currentStream: ReturnType<typeof client.beta.messages.stream> | null = null;
  req.on("close", () => {
    aborted = true;
    try {
      currentStream?.abort();
    } catch {
      /* ignore */
    }
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let guard = 0;
  let retries = 0;
  const MAX_RETRIES = 2;

  try {
    while (!aborted && guard++ < 12) {
      let streamedAny = false;
      try {
        const stream = client.beta.messages.stream({
          model: MODEL,
          max_tokens: 16000,
          betas: ["mcp-client-2025-11-20"],
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          mcp_servers: [mcpServer],
          tools: [{ type: "mcp_toolset", mcp_server_name: "fergus" }],
          // No extended thinking — keeps Haiku cheap/fast and avoids the
          // adaptive-thinking config Haiku doesn't accept. (Bigger models can
          // still answer well without it for lookups/gear entry.)
          messages: session.messages,
        } as any);
        currentStream = stream;

        for await (const event of stream as any) {
          if (aborted) break;
          if (event.type === "content_block_start" && event.content_block?.type === "mcp_tool_use") {
            send("tool", { name: event.content_block.name });
          } else if (event.type === "content_block_delta") {
            const delta = event.delta;
            if (delta?.type === "text_delta") {
              streamedAny = true;
              send("text", { text: delta.text });
            } else if (delta?.type === "thinking_delta") {
              streamedAny = true;
              send("thinking", { text: delta.thinking });
            }
          }
        }
        if (aborted) break;

        const final = await stream.finalMessage();
        session.messages.push({ role: "assistant", content: final.content });

        if (final.stop_reason === "pause_turn") continue;
        if (final.stop_reason === "refusal") {
          send("error", { message: "The request was declined for safety reasons." });
        }
        break; // success
      } catch (err: any) {
        const msg = String(err?.message ?? err ?? "");
        const isMcpConn = /MCP server/i.test(msg);
        // Fergus's MCP server occasionally blips; retry a couple of times before
        // giving up — but only if we hadn't started streaming a reply yet.
        if (isMcpConn && !streamedAny && !aborted && retries < MAX_RETRIES) {
          retries++;
          send("thinking", { text: `Fergus didn't respond — retrying (${retries})…\n` });
          await sleep(700 * retries);
          continue;
        }
        console.error("Chat error:", err);
        if (!aborted) {
          send("error", {
            message: isMcpConn
              ? "Couldn't reach Fergus just now — it can be briefly unavailable. Give it a few seconds and try again. If it keeps happening, tap “Connect Fergus” up top to refresh the link."
              : "Something went wrong handling that — try again in a moment.",
          });
        }
        break;
      }
    }
    if (!aborted) send("done", {});
  } finally {
    res.end();
  }
});

// Static app (index.html at /, app.js) — served last, behind the login gate.
app.use(express.static(PUBLIC));

app.listen(PORT, () => {
  console.log(`\n  Claude ⇄ Fergus live chat`);
  console.log(`  → ${PUBLIC_URL}`);
  console.log(`  Model:  ${MODEL}`);
  console.log(`  Fergus: ${FERGUS_MCP_URL} (connected: ${isFergusConnected()})\n`);
});
