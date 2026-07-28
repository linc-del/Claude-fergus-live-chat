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
import { authenticate, issueSession, clearSession, requireAuth, currentUser } from "./auth.js";
import { GMAIL_ALLOWED_ACCOUNTS } from "./config.js";
import { startAuth as startFergusAuth, handleCallback as handleFergusCallback, getAccessToken as getFergusToken, isConnected as isFergusConnected, disconnect as disconnectFergus } from "./fergus.js";
import { startAuth as startGmailAuth, handleCallback as handleGmailCallback, isConnected as isGmailConnected, disconnect as disconnectGmail, listAccounts as listGmailAccounts, listLabels as listGmailLabels, searchEmails, getMessage, getAttachment } from "./gmail.js";

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
  const user = authenticate(req.body?.username, req.body?.password);
  if (user) {
    issueSession(res, user);
    console.log(`Login: ${user}`);
    res.json({ ok: true, user });
  } else {
    res.status(401).json({ error: "Wrong name or password" });
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

app.get("/api/gmail/status", (_req, res) =>
  res.json({ connected: isGmailConnected(), accounts: listGmailAccounts() }),
);
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
app.post("/api/gmail/disconnect", (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email : undefined;
  disconnectGmail(email);
  res.json({ ok: true, accounts: listGmailAccounts() });
});

app.get("/api/gmail/search", async (req, res) => {
  try {
    const query = String(req.query.q || "");
    if (!query) {
      res.status(400).json({ error: "q (query) required" });
      return;
    }
    const messages = await searchEmails(query, 10);
    res.json({ messages });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Gmail search failed" });
  }
});

app.get("/api/gmail/message/:account/:messageId", async (req, res) => {
  try {
    const message = await getMessage(req.params.account, req.params.messageId);
    res.json(message);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Message fetch failed" });
  }
});

app.get("/api/gmail/attachment/:account/:messageId/:attachmentId", async (req, res) => {
  try {
    const buffer = await getAttachment(
      req.params.account,
      req.params.messageId,
      req.params.attachmentId,
    );
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="attachment"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Attachment fetch failed" });
  }
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

  // Attribution: who sent this (from the signed session cookie).
  const user = currentUser(req) ?? "unknown";
  console.log(`[${user}] ${message.slice(0, 120)}`);

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

  // ---- Gmail as real client-side tools ----------------------------------
  // Walk a Gmail MIME tree, pulling the plain-text body and any attachments.
  function extractParts(payload: any): { text: string; attachments: any[] } {
    let text = "";
    const attachments: any[] = [];
    const walk = (part: any) => {
      if (!part) return;
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          filename: part.filename,
          mime: part.mimeType,
          attachment_id: part.body.attachmentId,
        });
      }
      if (part.mimeType === "text/plain" && part.body?.data) {
        text += Buffer.from(part.body.data, "base64url").toString("utf8");
      }
      if (Array.isArray(part.parts)) part.parts.forEach(walk);
    };
    walk(payload);
    return { text, attachments };
  }

  async function runGmailSearch(query: string): Promise<string> {
    const hits = await searchEmails(query, 20);
    if (!hits?.length) return `No emails found for "${query}".`;
    const out: any[] = [];
    for (let i = 0; i < Math.min(hits.length, 12); i++) {
      const { account, id } = hits[i];
      try {
        const full = await getMessage(account, id);
        const headers = full.payload?.headers || [];
        const h = (n: string) =>
          headers.find((x: any) => x.name?.toLowerCase() === n)?.value || "";
        const { text, attachments } = extractParts(full.payload);
        out.push({
          account,
          message_id: id,
          subject: h("subject"),
          from: h("from"),
          date: h("date"),
          snippet: (text || full.snippet || "").replace(/\s+/g, " ").slice(0, 800),
          attachments,
        });
      } catch (e: any) {
        out.push({ account, message_id: id, error: e?.message });
      }
    }
    const more = hits.length > out.length ? ` (showing ${out.length} of ${hits.length}+ matches — narrow the query if you need the rest)` : "";
    return `${out.length} result(s)${more}:\n${JSON.stringify(out, null, 2)}`;
  }

  async function runGmailLabels(): Promise<string> {
    const labels = await listGmailLabels();
    if (!labels?.length) return "No labels found.";
    return JSON.stringify(labels, null, 2);
  }

  async function runReadAttachment(
    account: string,
    messageId: string,
    attachmentId: string,
    filename?: string,
  ): Promise<any> {
    const buf = await getAttachment(account, messageId, attachmentId);
    const name = filename || "attachment";

    // PDFs: extract the text server-side and return it as plain text. This is
    // far more reliable than shipping the raw PDF back into the conversation —
    // it's small, works on any model, and doesn't choke when several invoices
    // are read in one turn (which was throwing a request error before).
    if (/\.pdf$/i.test(name)) {
      try {
        const { getDocumentProxy, extractText } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(buf));
        const { text } = await extractText(pdf, { mergePages: true });
        const clean = (text || "").replace(/\n{3,}/g, "\n\n").trim();
        if (clean.length < 20) {
          return `[${name}] appears to be a scanned/image-only PDF — no text could be extracted. Ask the user to open it manually, or check for a text-based copy.`;
        }
        return `[${name}] extracted text:\n\n${clean.slice(0, 20000)}${clean.length > 20000 ? "\n\n…(truncated)" : ""}`;
      } catch (e: any) {
        return `[${name}] could not be read as a PDF: ${e?.message ?? e}`;
      }
    }

    // Images: return as an image block (small, widely supported).
    const img = /\.(png|jpe?g|gif|webp)$/i.exec(name);
    if (img) {
      const ext = img[1].toLowerCase();
      const media = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";
      return [{ type: "image", source: { type: "base64", media_type: media, data: buf.toString("base64") } }];
    }

    // Anything else: best-effort text.
    return buf.toString("utf8").slice(0, 20000);
  }

  const gmailTools = isGmailConnected()
    ? [
        {
          name: "list_gmail_labels",
          description:
            "List the labels/folders in the connected Gmail mailbox(es). Use this to find where supplier documents are filed before searching — supplier invoices at Linc are usually under the 'Invoices & Statements' label. Returns account, label name, and id.",
          input_schema: { type: "object", properties: {} },
        },
        {
          name: "search_gmail",
          description:
            "Search the connected Gmail mailbox(es) for supplier emails and invoices. Searches every connected account at once. Uses Gmail search syntax. Returns matching emails as JSON: account (which mailbox it's in), message_id, subject, from, date, a body snippet, and any attachments (filename + attachment_id, needed for read_gmail_attachment). Supplier invoices at Linc are filed under the label 'Invoices & Statements' (or left loose in the inbox). To find supplier documents reliably, prefer 'label:\"Invoices & Statements\" has:attachment' and widen the date window; if that misses some, also try the plain inbox with 'has:attachment filename:pdf'. Other good queries: 'from:ideal has:attachment', 'Voltex 11136', 'subject:(invoice OR statement) newer_than:90d'.",
          input_schema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Gmail search query." },
            },
            required: ["query"],
          },
        },
        {
          name: "read_gmail_attachment",
          description:
            "Fetch and read a PDF/image attachment from a Gmail message so you can see the invoice contents — line items, part numbers, prices, GST, totals. Use account, message_id and attachment_id returned by search_gmail.",
          input_schema: {
            type: "object",
            properties: {
              account: { type: "string", description: "The mailbox the message is in (from search_gmail results)." },
              message_id: { type: "string" },
              attachment_id: { type: "string" },
              filename: { type: "string", description: "Attachment filename." },
            },
            required: ["account", "message_id", "attachment_id"],
          },
        },
      ]
    : [];

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
          tools: [{ type: "mcp_toolset", mcp_server_name: "fergus" }, ...gmailTools],
          // No extended thinking — keeps Haiku cheap/fast and avoids the
          // adaptive-thinking config Haiku doesn't accept. (Bigger models can
          // still answer well without it for lookups/gear entry.)
          messages: session.messages,
        } as any);
        currentStream = stream;

        for await (const event of stream as any) {
          if (aborted) break;
          if (
            event.type === "content_block_start" &&
            (event.content_block?.type === "mcp_tool_use" || event.content_block?.type === "tool_use")
          ) {
            const raw = event.content_block.name || "";
            const name =
              raw === "search_gmail" ? "Gmail · search"
              : raw === "read_gmail_attachment" ? "Gmail · read document"
              : raw === "list_gmail_labels" ? "Gmail · list folders"
              : raw;
            send("tool", { name });
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
          break;
        }

        // Handle our client-side Gmail tools, then loop so Claude sees the results.
        if (final.stop_reason === "tool_use") {
          const toolUses = final.content.filter((c: any) => c.type === "tool_use") as any[];
          const toolResults: any[] = [];
          for (const tu of toolUses) {
            try {
              if (tu.name === "list_gmail_labels") {
                const content = await runGmailLabels();
                toolResults.push({ type: "tool_result", tool_use_id: tu.id, content });
              } else if (tu.name === "search_gmail") {
                const content = await runGmailSearch(String(tu.input?.query ?? ""));
                toolResults.push({ type: "tool_result", tool_use_id: tu.id, content });
              } else if (tu.name === "read_gmail_attachment") {
                const content = await runReadAttachment(
                  String(tu.input?.account ?? ""),
                  String(tu.input?.message_id ?? ""),
                  String(tu.input?.attachment_id ?? ""),
                  tu.input?.filename,
                );
                toolResults.push({ type: "tool_result", tool_use_id: tu.id, content });
              } else {
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: tu.id,
                  content: `Unknown tool "${tu.name}".`,
                  is_error: true,
                });
              }
            } catch (e: any) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: `Couldn't complete ${tu.name}: ${e?.message ?? e}`,
                is_error: true,
              });
            }
          }
          if (toolResults.length) {
            session.messages.push({ role: "user", content: toolResults });
            continue; // back around so Claude can read the results and reply
          }
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
