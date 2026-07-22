import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  ANTHROPIC_API_KEY,
  FERGUS_MCP_URL,
  FERGUS_MCP_TOKEN,
  PORT = "3000",
  MODEL = "claude-opus-4-8",
} = process.env;

if (!ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY — copy .env.example to .env and fill it in.");
  process.exit(1);
}
if (!FERGUS_MCP_URL) {
  console.error("Missing FERGUS_MCP_URL — set the hosted Fergus MCP server URL in .env.");
  process.exit(1);
}

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

// Drop sessions idle for more than 6 hours (in-memory only).
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastUsed > SESSION_TTL_MS) sessions.delete(id);
  }
}, 30 * 60 * 1000).unref();

const mcpServer: any = {
  type: "url",
  url: FERGUS_MCP_URL,
  name: "fergus",
  ...(FERGUS_MCP_TOKEN ? { authorization_token: FERGUS_MCP_TOKEN } : {}),
};

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, fergusUrl: FERGUS_MCP_URL });
});

app.post("/api/reset", (req, res) => {
  const { sessionId } = req.body ?? {};
  if (sessionId) sessions.delete(sessionId);
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

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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
    // Loop only to handle pause_turn (server-side MCP tool loop hit its limit).
    while (!aborted && guard++ < 10) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["mcp-client-2025-11-20"],
        system: SYSTEM_PROMPT,
        // The MCP connector: Anthropic connects to the Fergus MCP server
        // server-side and runs the tool loop for us.
        mcp_servers: [mcpServer],
        tools: [{ type: "mcp_toolset", mcp_server_name: "fergus" }],
        thinking: { type: "adaptive", display: "summarized" },
        messages: session.messages,
      } as any);
      currentStream = stream;

      for await (const event of stream as any) {
        if (aborted) break;
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block?.type === "mcp_tool_use") {
            send("tool", { name: block.name, server: block.server_name });
          }
        } else if (event.type === "content_block_delta") {
          const delta = event.delta;
          if (delta?.type === "text_delta") {
            send("text", { text: delta.text });
          } else if (delta?.type === "thinking_delta") {
            send("thinking", { text: delta.thinking });
          }
        }
      }

      if (aborted) break;

      const final = await stream.finalMessage();
      session.messages.push({ role: "assistant", content: final.content });

      if (final.stop_reason === "pause_turn") {
        // Re-run with the paused assistant turn appended; the server resumes.
        continue;
      }
      if (final.stop_reason === "refusal") {
        send("error", { message: "The request was declined for safety reasons." });
      }
      break;
    }
    if (!aborted) send("done", {});
  } catch (err: any) {
    console.error("Chat error:", err);
    if (!aborted) {
      send("error", {
        message: err?.message ?? "Something went wrong talking to Claude or Fergus.",
      });
    }
  } finally {
    res.end();
  }
});

// New session id helper for the frontend.
app.get("/api/session", (_req, res) => {
  res.json({ sessionId: crypto.randomUUID() });
});

app.listen(Number(PORT), () => {
  console.log(`\n  Claude ⇄ Fergus live chat running`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  Model:  ${MODEL}`);
  console.log(`  Fergus: ${FERGUS_MCP_URL}\n`);
});
