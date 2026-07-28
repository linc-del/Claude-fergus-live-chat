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

### Talking to it (voice)

- **🎤 mic** (next to the message box) — tap, speak, it transcribes and sends. No typing.
- **Spoken replies** — when you talk to it, it reads the answer back.
- **🎙️ Hands-free** (top right) — toggle on for the van: it speaks each reply, then listens again automatically so you can go back and forth without touching the phone.

Voice uses the browser's built-in speech, so it's free and needs no extra keys — but it works best in **Chrome on Android/desktop** (iOS Safari support is patchy) and needs the **https** address (the mic is blocked on plain http, which is why hosting it properly matters). Typing works everywhere regardless. For sharper transcription of electrical jargon and part numbers, a paid speech service can be added later.

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
- **Fergus token storage** — kept in `DATA_DIR` (default `./data`, git-ignored). On Render the blueprint sets `DATA_DIR=/var/data` on a persistent disk, so the Fergus connection survives redeploys. Without a persistent disk (e.g. Render free tier), the token is wiped on each redeploy and you'd reconnect Fergus again.
- **Confirm-before-acting** — Claude is told to confirm before creating or changing Fergus data. Review actions before approving.
- **Costs** — every message is an Anthropic API call plus Fergus tool round-trips. Keep an eye on usage.

## Gear entry (dictate materials onto a job)

The app has Linc's **gear-entry** workflow built in (ported from the `fergus-gear-entry` skill). Say what you fitted — "chuck 20m of 2.5 TPS and 3 double GPOs on the Henderson job" — and it finds the job + phase, matches each item to the real Fergus price book (leaning on Linc's standard fits and NZ shorthand), shows a one-glance table to confirm, then pushes the lines onto the job. Prices come straight from the price book (ex-GST, no double-GST), and it won't push to the wrong job or invent a line.

That knowledge lives in **`prompts/`** as plain markdown — `00-assistant.md` (persona), `10-gear-entry.md` (the workflow), `20-standard-fits.md` (Linc's usual brands/codes), `30-nz-terms.md` (shorthand → search terms), `40-supply-email.md` (supply-order emails, below). Edit those to tune behaviour; no code change needed. They're assembled into the system prompt at startup (any `NN-name.md` file is picked up automatically, in filename order) and prompt-cached.

## Supply orders (get the gear ordered)

The flip side of gear-entry: instead of recording what you fitted, it puts together what you need to **order**. Say "sort the order for the Henderson job" or "email Ideal for 2 double GPOs and 30m of 2.5" — it gathers the items (from a Fergus job/quote or straight from your dictation), matches each to the real pricebook **product code**, groups them by supplier (Ideal, Voltex…), shows a one-glance table to confirm, then hands back a **ready-to-send order email** — subject line and a picked-clean list per supplier.

The app talks to Fergus only and has no mailbox, so it can't send the email itself — it writes it out for you to copy in (or reads it back hands-free). It won't invent a product code: anything it can't match is flagged in plain English so the supplier can quote a code back, rather than a wrong part turning up. The rules live in **`prompts/40-supply-email.md`**.

## Customising

- Assistant behaviour / gear-entry rules: edit the files in `prompts/`.
- Model: set `MODEL` in `.env`.
- Restrict which Fergus tools are allowed: give the `mcp_toolset` entry a `default_config`/`configs` allowlist (see the Anthropic MCP connector docs).

## Automations

- **Supplier documents → Drive** (`automation/supplier-docs-to-drive/`) — a Google Apps Script that auto-files supplier PDFs arriving at `accounts@lincelectrical.co.nz` into a dated Drive folder, so the Claude assistant can read them. Runs free on Google, no server. See its [README](automation/supplier-docs-to-drive/README.md) for the 5-minute setup.
