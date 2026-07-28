import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Where tokens / oauth client / session secret are stored. On hosting with a
// persistent disk, point DATA_DIR at the mounted volume so it survives deploys.
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`\nMissing required env var ${name} — copy .env.example to .env and fill it in.\n`);
    process.exit(1);
  }
  return v;
}

export const ANTHROPIC_API_KEY = required("ANTHROPIC_API_KEY");
export const APP_PASSWORD = required("APP_PASSWORD");

// Per-person logins. Set USERS to "name:password,name:password" (e.g.
// "caitlin:pw1,dee:pw2") to give staff their own login so the app can record
// who did what. The owner can always sign in with APP_PASSWORD as "linc".
// If USERS is unset, everyone just shares APP_PASSWORD.
function loadUsers(): Record<string, string> {
  const users: Record<string, string> = {};
  const raw = process.env.USERS || "";
  for (const pair of raw.split(",")) {
    const idx = pair.indexOf(":");
    if (idx < 0) continue;
    const name = pair.slice(0, idx).trim().toLowerCase();
    const pass = pair.slice(idx + 1).trim();
    if (name && pass) users[name] = pass;
  }
  return users;
}
// Owner login "linc" is always APP_PASSWORD, unless USERS overrides it.
export const USERS: Record<string, string> = { linc: APP_PASSWORD, ...loadUsers() };

// Gmail mailboxes the app is allowed to read. Anything not on this list is
// rejected at connect time, so the "Add inbox" button can't pull in a personal
// or unrelated account. Override with GMAIL_ALLOWED_ACCOUNTS (comma-separated).
export const GMAIL_ALLOWED_ACCOUNTS: string[] = (
  process.env.GMAIL_ALLOWED_ACCOUNTS ||
  "accounts@lincelectrical.co.nz,office@lincelectrical.co.nz"
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
// claude-haiku-4-5 = cheapest tier (~1/5 of Opus). Override with the MODEL env
// var to move up to claude-sonnet-5 or claude-opus-4-8 if you want more grunt.
export const MODEL = process.env.MODEL || "claude-haiku-4-5";
export const PORT = Number(process.env.PORT || 3000);
export const FERGUS_MCP_URL = process.env.FERGUS_MCP_URL || "https://mcp.fergus.com/mcp";

export const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || "";
export const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || "";

// Public base URL the app is reached at (used to build the OAuth redirect URI).
// Locally this is http://localhost:3000; in the cloud, set PUBLIC_URL to your domain.
export const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
export const SECURE_COOKIES = PUBLIC_URL.startsWith("https://");

// Cookie-signing secret. Use env if provided; otherwise generate and persist so
// logins survive restarts.
function loadSessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const p = path.join(DATA_DIR, "session-secret.txt");
  try {
    return fs.readFileSync(p, "utf8").trim();
  } catch {
    const s = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(p, s, { mode: 0o600 });
    return s;
  }
}
export const SESSION_SECRET = loadSessionSecret();

// Fergus OAuth endpoints (from https://mcp.fergus.com/.well-known/oauth-authorization-server).
export const FERGUS_OAUTH = {
  authorize: "https://mcp.fergus.com/oauth/authorize",
  token: "https://mcp.fergus.com/oauth/token",
  register: "https://mcp.fergus.com/oauth/register",
  scope: "profile",
  redirectUri: `${PUBLIC_URL}/api/fergus/callback`,
};

// Google OAuth endpoints. One connection grants both Gmail (read) and Drive
// (read) — adding the Drive scope means accounts must reconnect once to grant it.
export const GMAIL_OAUTH = {
  authorize: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  scope:
    "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.readonly",
  redirectUri: `${PUBLIC_URL}/api/gmail/callback`,
};
