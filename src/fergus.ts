import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, FERGUS_OAUTH } from "./config.js";

interface ClientReg {
  redirect_uri: string;
  client_id: string;
  client_secret?: string;
}

interface Tokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

const CLIENT_FILE = path.join(DATA_DIR, "oauth-client.json");
const TOKEN_FILE = path.join(DATA_DIR, "fergus-tokens.json");

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}
function writeJson(p: string, value: unknown): void {
  fs.writeFileSync(p, JSON.stringify(value, null, 2), { mode: 0o600 });
}

let tokens: Tokens | null = readJson<Tokens>(TOKEN_FILE);

// Short-lived PKCE state, keyed by the OAuth `state` param.
const pending = new Map<string, { verifier: string; createdAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.createdAt > 10 * 60 * 1000) pending.delete(k);
}, 60 * 1000).unref();

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function ensureClient(): Promise<ClientReg> {
  const existing = readJson<ClientReg>(CLIENT_FILE);
  if (existing && existing.redirect_uri === FERGUS_OAUTH.redirectUri) return existing;

  const res = await fetch(FERGUS_OAUTH.register, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Linc Electrical Fergus Chat",
      redirect_uris: [FERGUS_OAUTH.redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: FERGUS_OAUTH.scope,
    }),
  });
  if (!res.ok) {
    throw new Error(`Fergus client registration failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as any;
  const reg: ClientReg = {
    redirect_uri: FERGUS_OAUTH.redirectUri,
    client_id: body.client_id,
    client_secret: body.client_secret,
  };
  writeJson(CLIENT_FILE, reg);
  return reg;
}

function saveTokens(body: any): void {
  const expiresIn = Number(body.expires_in ?? 3600);
  tokens = {
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? tokens?.refresh_token,
    expires_at: Date.now() + expiresIn * 1000,
  };
  writeJson(TOKEN_FILE, tokens);
}

/** Begins the OAuth flow; returns the Fergus URL to send the user to. */
export async function startAuth(): Promise<string> {
  const client = await ensureClient();
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  pending.set(state, { verifier, createdAt: Date.now() });

  const url = new URL(FERGUS_OAUTH.authorize);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client.client_id);
  url.searchParams.set("redirect_uri", FERGUS_OAUTH.redirectUri);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", FERGUS_OAUTH.scope);
  return url.toString();
}

/** Handles the redirect back from Fergus; exchanges the code for tokens. */
export async function handleCallback(code: string, state: string): Promise<void> {
  const p = pending.get(state);
  if (!p) throw new Error("Login link expired — please click Connect Fergus again.");
  pending.delete(state);

  const client = await ensureClient();
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: FERGUS_OAUTH.redirectUri,
    client_id: client.client_id,
    code_verifier: p.verifier,
  });
  const res = await fetch(FERGUS_OAUTH.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!res.ok) throw new Error(`Fergus token exchange failed (${res.status}): ${await res.text()}`);
  saveTokens(await res.json());
}

async function refresh(): Promise<void> {
  if (!tokens?.refresh_token) {
    disconnect();
    throw new Error("Fergus session expired — please reconnect.");
  }
  const client = await ensureClient();
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: client.client_id,
  });
  const res = await fetch(FERGUS_OAUTH.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!res.ok) {
    disconnect();
    throw new Error("Fergus session expired — please reconnect.");
  }
  saveTokens(await res.json());
}

export function isConnected(): boolean {
  return !!tokens;
}

export function disconnect(): void {
  tokens = null;
  try {
    fs.unlinkSync(TOKEN_FILE);
  } catch {
    /* ignore */
  }
}

/** Returns a valid access token, refreshing if it's near expiry. */
export async function getAccessToken(): Promise<string> {
  if (!tokens) throw new Error("Fergus is not connected.");
  if (Date.now() > tokens.expires_at - 60_000) await refresh();
  return tokens!.access_token;
}
