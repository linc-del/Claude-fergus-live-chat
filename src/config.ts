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
export const MODEL = process.env.MODEL || "claude-opus-4-8";
export const PORT = Number(process.env.PORT || 3000);
export const FERGUS_MCP_URL = process.env.FERGUS_MCP_URL || "https://mcp.fergus.com/mcp";

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
