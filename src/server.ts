import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
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
import { startAuth, handleCallback, getAccessToken, isConnected, disconnect } from "./fergus.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "..", "public");

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are the internal assistant for Linc Electrical (Palmerston North, NZ), talking to Lincoln and his team over live chat.

You are connected to the company's Fergus job-management system through MCP tools. Use those tools to look up and act on real business data — jobs, customers, sites, quotes, invoices, contacts, time entries, price books, calendar events, stock, and notes. Never invent Fergus data; if you don't know something, call a tool to find out.

How to work:
- Answer from live Fergus data, not from memory. When a question is about a specific job, customer, quote, or invoice, look it up.
- Be concise and direct — this is a working tool, not a chatbot. Lead with the answer, then supporting detail.
- New Zealand context: prices in NZD, GST is 15%, dates day/month/year.
- Before taking an action that changes data or is hard to reverse (creating/editing/deleting a job, quote, invoice, customer, or sending anything outward), briefly confirm the details with the user first.
- If a tool call fails or returns nothing, say so plainly rather than guessing.`;

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
  res.json({ ok: true, model: MODEL, fergusConnected: isConnected() }),
);

app.get("/api/fergus/status", (_req, res) => res.json({ connected: isConnected() }));
app.get("/api/fergus/connect", async (_req, res) => {
  try {
    res.redirect(await startAuth());
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
    await handleCallback(code, state);
    res.redirect("/?fergus=connected");
  } catch (err: any) {
    res.redirect("/?fergus_error=" + encodeURIComponent(err?.message ?? "Fergus login failed"));
  }
});
app.post("/api/fergus/disconnect", (_req, res) => {
  disconnect();
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
    fergusToken = await getAccessToken();
  } catch {
    res.status(409).json({
      error: "Fergus isn't connected yet — click “Connect Fergus” at the top, then try again.",
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

  try {
    let guard = 0;
    while (!aborted && guard++ < 10) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["mcp-client-2025-11-20"],
        system: SYSTEM_PROMPT,
        mcp_servers: [mcpServer],
        tools: [{ type: "mcp_toolset", mcp_server_name: "fergus" }],
        thinking: { type: "adaptive", display: "summarized" },
        messages: session.messages,
      } as any);
      currentStream = stream;

      for await (const event of stream as any) {
        if (aborted) break;
        if (event.type === "content_block_start" && event.content_block?.type === "mcp_tool_use") {
          send("tool", { name: event.content_block.name });
        } else if (event.type === "content_block_delta") {
          const delta = event.delta;
          if (delta?.type === "text_delta") send("text", { text: delta.text });
          else if (delta?.type === "thinking_delta") send("thinking", { text: delta.thinking });
        }
      }
      if (aborted) break;

      const final = await stream.finalMessage();
      session.messages.push({ role: "assistant", content: final.content });

      if (final.stop_reason === "pause_turn") continue;
      if (final.stop_reason === "refusal") {
        send("error", { message: "The request was declined for safety reasons." });
      }
      break;
    }
    if (!aborted) send("done", {});
  } catch (err: any) {
    console.error("Chat error:", err);
    if (!aborted) send("error", { message: err?.message ?? "Something went wrong." });
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
  console.log(`  Fergus: ${FERGUS_MCP_URL} (connected: ${isConnected()})\n`);
});
