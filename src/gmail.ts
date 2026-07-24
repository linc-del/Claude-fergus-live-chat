import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_OAUTH } from "./config.js";

interface GmailTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

const TOKEN_FILE = path.join(DATA_DIR, "gmail-tokens.json");

function loadTokens(): GmailTokens | null {
  try {
    const data = fs.readFileSync(TOKEN_FILE, "utf8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function saveTokens(tokens: GmailTokens): void {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

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

  saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  });

  codeVerifier = "";
  stateToken = "";
}

export async function getAccessToken(): Promise<string> {
  const tokens = loadTokens();
  if (!tokens) throw new Error("Gmail not connected");

  if (Date.now() < tokens.expires_at) return tokens.access_token;

  // Refresh token
  if (!tokens.refresh_token) throw new Error("No refresh token");
  const body = new URLSearchParams({
    client_id: GMAIL_CLIENT_ID,
    client_secret: GMAIL_CLIENT_SECRET,
    refresh_token: tokens.refresh_token,
    grant_type: "refresh_token",
  });

  const res = await fetch(GMAIL_OAUTH.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.statusText}`);
  const data = (await res.json()) as any;

  saveTokens({
    access_token: data.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  });

  return data.access_token;
}

export function isConnected(): boolean {
  return loadTokens() !== null;
}

export function disconnect(): void {
  try {
    fs.unlinkSync(TOKEN_FILE);
  } catch {
    /* ignore */
  }
}

export async function searchEmails(query: string, maxResults = 5): Promise<any[]> {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Gmail search failed: ${res.statusText}`);
  const data = (await res.json()) as any;
  return data.messages || [];
}

export async function getMessage(messageId: string): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Gmail fetch failed: ${res.statusText}`);
  return res.json();
}

export async function getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const token = await getAccessToken();
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) throw new Error(`Attachment fetch failed: ${res.statusText}`);
  const data = (await res.json()) as any;
  // data.data is base64url encoded
  return Buffer.from(data.data, "base64url");
}
