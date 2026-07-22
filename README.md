# Claude ⇄ Fergus Live Chat

An internal staff web app for **Linc Electrical**. It's a browser chat interface where Claude answers questions and takes actions against your live **Fergus** job‑management data — open jobs, customers, sites, quotes, invoices, contacts, time entries, price books, calendar, stock, and notes.

It works by wiring Claude to your **hosted Fergus MCP server** through the Anthropic **MCP connector**: the backend passes the Fergus MCP URL + token to the Messages API, and Anthropic runs the tool loop server‑side. There's no separate MCP server to build or host here — this app only needs the URL and token of the Fergus MCP that already exists.

```
Browser chat UI  ──▶  Node/Express backend  ──▶  Anthropic Messages API
                                                     │  (MCP connector)
                                                     ▼
                                              Hosted Fergus MCP  ──▶  Fergus
```

## Requirements

- Node.js 18+
- An Anthropic API key
- The URL of your hosted Fergus MCP server and an authorization token for it

## Setup

```bash
npm install
cp .env.example .env
# then edit .env — see below
```

Fill in `.env`:

| Variable            | Required | Notes                                                                 |
| ------------------- | -------- | --------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | yes      | From the Anthropic Console.                                           |
| `FERGUS_MCP_URL`    | yes      | The hosted Fergus MCP server endpoint (Streamable HTTP / SSE URL).    |
| `FERGUS_MCP_TOKEN`  | usually  | Bearer/OAuth token the Fergus MCP expects. Leave blank only if none.  |
| `MODEL`             | no       | Defaults to `claude-opus-4-8`.                                        |
| `PORT`              | no       | Defaults to `3000`.                                                   |

> The Fergus MCP URL and token are whatever you already use to connect Fergus as a
> remote MCP server (the same connector details you'd add in a Claude.ai custom
> connector). This app just points the API at that endpoint on your behalf.

## Run

Development (auto‑reload):

```bash
npm run dev
```

Production:

```bash
npm run build
npm start
```

Then open **http://localhost:3000**.

## How it works

- **`src/server.ts`** — Express server. `POST /api/chat` streams Claude's reply back
  to the browser over Server‑Sent Events. Each request declares the Fergus MCP server
  (`mcp_servers`) plus an `mcp_toolset`, with the `mcp-client-2025-11-20` beta, so
  Claude can call Fergus tools directly. Adaptive thinking is on so the UI can show a
  live "thinking" preview, and `pause_turn` is handled so long tool loops resume
  automatically. Conversation history is kept in memory per `sessionId`.
- **`public/`** — a dependency‑free chat UI. It renders streamed text, shows a chip
  each time Claude calls a Fergus tool, and a muted preview while Claude is thinking.

## Notes & limits

- **In‑memory sessions.** History lives in the server process and is cleared on
  restart (and after 6 hours idle). Fine for an internal single‑instance tool; add a
  store (Redis, a DB) if you need durability or multiple instances.
- **Trusted users only.** There's no authentication in front of the app and it has
  full Fergus access. Run it behind your VPN / SSO, or add auth before exposing it.
- **Confirm‑before‑acting.** The system prompt tells Claude to confirm before creating
  or changing Fergus data. Review actions before approving them.
- **Costs.** Every message is an Anthropic API call (plus tool round‑trips). Watch usage.

## Customising

- Change the assistant's behaviour: edit `SYSTEM_PROMPT` in `src/server.ts`.
- Swap the model: set `MODEL` in `.env`.
- Restrict which Fergus tools are available: give the `mcp_toolset` entry a
  `default_config`/`configs` allowlist (see the Anthropic MCP connector docs).
