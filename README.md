# Claude ⇄ Fergus Live Chat

An internal staff web app for **Linc Electrical**. It's a browser chat where Claude answers questions and takes actions against your live **Fergus** data — jobs, customers, sites, quotes, invoices, contacts, time entries, price books, calendar, stock, and notes.

Claude talks to Fergus directly through the Anthropic **MCP connector**: the app hands Claude the Fergus MCP server + your Fergus login, and Anthropic runs the tool calls. The app itself never touches Fergus — it just introduces the two.

```
Phone / desktop browser
        │  (team password login)
        ▼
   This app (Node/Express)
        │  Anthropic Messages API + MCP connector
        ▼
   Claude  ──(your Fergus OAuth login)──▶  Fergus MCP  ──▶  Fergus
```

Two logins are involved, and they're different:

- **App login** — a shared team password, so only your people can open the app once it's online.
- **Connect Fergus** — a one-time "Log in with Fergus" (OAuth) done from inside the app that links it to your Fergus account. The app keeps that connection refreshed.

## Requirements

- Node.js 18+
- An Anthropic API key (from the Anthropic Console)
- A Fergus account (you log into it from the app — nothing to paste)

## Run it locally

```bash
npm install
cp .env.example .env
```

Edit `.env` and set at least:

```
ANTHROPIC_API_KEY=sk-ant-...
APP_PASSWORD=pick-a-strong-team-password
```

Then:

```bash
npm run dev          # development, auto-reloads
# or: npm run build && npm start   # production
```

Open **http://localhost:3000**, enter the team password, then click **Connect Fergus** (top right) and sign into Fergus once. After that, chat away.

## Use it from your phone (hosting it online)

The chat page opens in any phone browser, but the "engine" needs to run somewhere always-on. To use it from your Android anywhere:

1. Deploy this app to a host that gives you an **https URL** (Render, Railway, Fly.io, a small VPS, etc.).
2. Set these env vars on the host:
   - `ANTHROPIC_API_KEY`
   - `APP_PASSWORD`
   - `PUBLIC_URL=https://your-app-url` ← **must be your real https URL** (it's used to build the Fergus login redirect, so it has to match exactly)
3. Open that URL on your phone, log in with the team password, and click **Connect Fergus** once.

Because it's now on the internet, the team-password login is what keeps it private — so use a strong password. (If you'd rather have per-person logins or Google sign-in later, that's a straightforward upgrade.)

> **On same-wifi only, no cloud:** you can also just run it on an office computer and open `http://<that-computer's-ip>:3000` from your phone while on the same wifi. Set `PUBLIC_URL` to that same `http://<ip>:3000` so the Fergus login redirect matches.

## Environment variables

| Variable            | Required | Notes                                                                          |
| ------------------- | -------- | ------------------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY` | yes      | Pays for Claude usage.                                                         |
| `APP_PASSWORD`      | yes      | Shared team password for the app login screen.                                 |
| `PUBLIC_URL`        | for hosting | The exact URL the app is reached at. Defaults to `http://localhost:3000`.    |
| `FERGUS_MCP_URL`    | no       | Defaults to `https://mcp.fergus.com/mcp` (correct as-is).                      |
| `MODEL`             | no       | Defaults to `claude-opus-4-8`.                                                 |
| `PORT`              | no       | Defaults to `3000`.                                                            |
| `SESSION_SECRET`    | no       | Auto-generated if unset. Set a fixed value if running multiple instances.      |

## How it works

- **`src/server.ts`** — Express server. `POST /api/chat` streams Claude's reply to the browser over SSE, declaring the Fergus MCP server (`mcp_servers` + `mcp_toolset`, beta `mcp-client-2025-11-20`) so Claude can call Fergus tools directly. Adaptive thinking is on so the UI shows a live "thinking" preview; `pause_turn` is handled so long tool runs resume. Conversations are kept in memory per session.
- **`src/auth.ts`** — the team-password login: a signed, HttpOnly session cookie; every route except the login page is gated.
- **`src/fergus.ts`** — the Connect Fergus flow: dynamic client registration, OAuth authorization-code + PKCE, and automatic token refresh. Tokens are stored under `data/` (git-ignored).
- **`public/`** — a dependency-free UI: login page, chat with streamed text, a chip each time Claude calls a Fergus tool, a Fergus connection pill, and a Connect banner.

## Notes & limits

- **In-memory chat history** — cleared on restart and after 6 h idle. Fine for a single instance; add Redis/DB for durability or multiple instances.
- **Fergus token storage** — kept in `data/fergus-tokens.json`. On hosts with ephemeral disks you may need to reconnect Fergus after a redeploy (or mount a persistent volume).
- **Confirm-before-acting** — Claude is told to confirm before creating or changing Fergus data. Review actions before approving.
- **Costs** — every message is an Anthropic API call plus Fergus tool round-trips. Keep an eye on usage.

## Customising

- Assistant behaviour: edit `SYSTEM_PROMPT` in `src/server.ts`.
- Model: set `MODEL` in `.env`.
- Restrict which Fergus tools are allowed: give the `mcp_toolset` entry a `default_config`/`configs` allowlist (see the Anthropic MCP connector docs).
