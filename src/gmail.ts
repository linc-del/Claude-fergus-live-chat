import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_OAUTH, GMAIL_ALLOWED_ACCOUNTS } from "./config.js";

// Multiple mailboxes can be connected. Tokens are stored as a map keyed by the
// account's email address so Claude can search across all of them at once.
interface Account {
  email: string;
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}
type Store = Record<string, Account>;

const TOKEN_FILE = path.join(DATA_DIR, "gmail-tokens.json");

function loadStore(): Store {
  try {
    const raw = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
    // Legacy single-token format (pre multi-account): wrap it so it still works
    // until normalizeStore() re-keys it by the real email address.
    if (raw && typeof raw === "object" && raw.access_token) {
      return {
        _legacy: {
          email: "",
          access_token: raw.access_token,
          refresh_token: raw.refresh_token,
          expires_at: raw.expires_at ?? 0,
        },
      };
    }
    if (raw && typeof raw === "object") return raw as Store;
  } catch {
    /* no file yet */
  }
  return {};
}

function saveStore(store: Store): void {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}

function findKey(store: Store, account: string): string {
  if (store[account]) return account;
  for (const k of Object.keys(store)) if (store[k].email === account) return k;
  throw new Error(`Mailbox "${account}" isn't connected.`);
}

/* ---------- OAuth ---------- */

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

let codeVerifier = "";
let stateToken = "";

export async function startAuth(): Promise<string> {
  codeVerifier = generateCodeVerifier();
  stateToken = crypto.randomBytes(32).toString("hex");

  const codeChallenge = generateCodeChallenge(codeVerifier);
  const params = new URLSearchParams({
    client_id: GMAIL_CLIENT_ID,
    redirect_uri: GMAIL_OAUTH.redirectUri,
    response_type: "code",
    scope: GMAIL_OAUTH.scope,
    state: stateToken,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });

  return `${GMAIL_OAUTH.authorize}?${params}`;
}

async function getProfileEmail(token: string): Promise<string> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Couldn't read Gmail profile: ${res.statusText}`);
  const data = (await res.json()) as any;
  return data.emailAddress as string;
}

export async function handleCallback(code: string, state: string): Promise<void> {
  if (state !== stateToken) throw new Error("State mismatch");

  const body = new URLSearchParams({
    client_id: GMAIL_CLIENT_ID,
    client_secret: GMAIL_CLIENT_SECRET,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: GMAIL_OAUTH.redirectUri,
  });

  const res = await fetch(GMAIL_OAUTH.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.statusText}`);
  const data = (await res.json()) as any;

  const email = await getProfileEmail(data.access_token);

  // Only allow the approved mailboxes to be connected. Reject anything else so
  // the "Add inbox" button can't pull in a personal or unrelated account.
  if (GMAIL_ALLOWED_ACCOUNTS.length && !GMAIL_ALLOWED_ACCOUNTS.includes(email.toLowerCase())) {
    codeVerifier = "";
    stateToken = "";
    throw new Error(
      `${email} isn't an approved mailbox. Only ${GMAIL_ALLOWED_ACCOUNTS.join(" and ")} can be connected.`,
    );
  }

  const store = loadStore();
  if (store._legacy) delete store._legacy;
  store[email] = {
    email,
    access_token: data.access_token,
    // Google only returns a refresh_token on first consent — keep any existing one.
    refresh_token: data.refresh_token ?? store[email]?.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  saveStore(store);

  codeVerifier = "";
  stateToken = "";
}

async function refresh(acc: Account): Promise<string> {
  if (!acc.refresh_token) throw new Error("No refresh token — reconnect this mailbox.");
  const body = new URLSearchParams({
    client_id: GMAIL_CLIENT_ID,
    client_secret: GMAIL_CLIENT_SECRET,
    refresh_token: acc.refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch(GMAIL_OAUTH.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.statusText}`);
  const data = (await res.json()) as any;
  acc.access_token = data.access_token;
  acc.expires_at = Date.now() + data.expires_in * 1000;
  return acc.access_token;
}

// Return a valid access token for a store key, refreshing + persisting if needed.
async function validToken(store: Store, key: string): Promise<string> {
  const acc = store[key];
  if (Date.now() < acc.expires_at - 60_000) return acc.access_token;
  const token = await refresh(acc);
  saveStore(store);
  return token;
}

// Re-key any account that isn't stored under its real email (legacy / first load).
async function normalizeStore(): Promise<void> {
  const store = loadStore();
  let changed = false;
  for (const key of Object.keys(store)) {
    const acc = store[key];
    if (!acc.email || key !== acc.email) {
      try {
        const token = await validToken(store, key);
        const email = await getProfileEmail(token);
        acc.email = email;
        store[email] = acc;
        if (key !== email) delete store[key];
        changed = true;
      } catch {
        /* leave as-is; will retry next time */
      }
    }
  }
  if (changed) saveStore(store);
}
normalizeStore().catch(() => {});

/* ---------- status ---------- */

export function listAccounts(): string[] {
  return Object.values(loadStore())
    .map((a) => a.email)
    .filter(Boolean);
}
export function isConnected(): boolean {
  return Object.keys(loadStore()).length > 0;
}
export function disconnect(email?: string): void {
  if (!email) {
    try {
      fs.unlinkSync(TOKEN_FILE);
    } catch {
      /* ignore */
    }
    return;
  }
  const store = loadStore();
  for (const k of Object.keys(store)) {
    if (k === email || store[k].email === email) delete store[k];
  }
  saveStore(store);
}

/* ---------- reading mail (across all connected mailboxes) ---------- */

export async function listLabels(): Promise<Array<{ account: string; name: string; id: string }>> {
  await normalizeStore().catch(() => {});
  const store = loadStore();
  const out: Array<{ account: string; name: string; id: string }> = [];
  for (const key of Object.keys(store)) {
    try {
      const token = await validToken(store, key);
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as any;
      for (const l of data.labels || []) {
        // Skip Gmail's internal category labels (CATEGORY_*, CHAT, etc.) — keep
        // user labels plus the useful system ones.
        if (l.type === "user" || ["INBOX", "SENT", "STARRED", "IMPORTANT"].includes(l.id)) {
          out.push({ account: store[key].email || key, name: l.name, id: l.id });
        }
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

export async function searchEmails(
  query: string,
  maxPerAccount = 20,
): Promise<Array<{ account: string; id: string }>> {
  await normalizeStore().catch(() => {});
  const store = loadStore();
  const out: Array<{ account: string; id: string }> = [];
  for (const key of Object.keys(store)) {
    try {
      const token = await validToken(store, key);
      const params = new URLSearchParams({ q: query, maxResults: String(maxPerAccount) });
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as any;
      for (const m of data.messages || []) out.push({ account: store[key].email || key, id: m.id });
    } catch {
      /* skip this mailbox on error */
    }
  }
  return out;
}

export async function getMessage(account: string, messageId: string): Promise<any> {
  const store = loadStore();
  const key = findKey(store, account);
  const token = await validToken(store, key);
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Gmail fetch failed: ${res.statusText}`);
  return res.json();
}

export async function getAttachment(
  account: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const store = loadStore();
  const key = findKey(store, account);
  const token = await validToken(store, key);
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Attachment fetch failed: ${res.statusText}`);
  const data = (await res.json()) as any;
  return Buffer.from(data.data, "base64url");
}

export async function getAccessToken(): Promise<string> {
  const store = loadStore();
  const key = Object.keys(store)[0];
  if (!key) throw new Error("Gmail not connected");
  return validToken(store, key);
}
