import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { USERS, SESSION_SECRET, SECURE_COOKIES } from "./config.js";

const COOKIE = "linc_session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hmac(value: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function sign(value: string): string {
  return `${value}.${hmac(value)}`;
}

// Returns the signed-in username, or null if the cookie is missing/invalid/expired.
// Cookie value format: "s:<expiry-ms>:<username>".
function verify(signed: string | undefined): string | null {
  if (!signed) return null;
  const dot = signed.lastIndexOf(".");
  if (dot < 0) return null;
  const value = signed.slice(0, dot);
  const mac = signed.slice(dot + 1);
  const expected = hmac(value);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const parts = value.split(":");
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || Date.now() >= exp) return null;
  return parts[2] || "team";
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function isLoggedIn(req: Request): boolean {
  return verify(parseCookies(req)[COOKIE]) !== null;
}

// The username on the current request's session, or null if not signed in.
export function currentUser(req: Request): string | null {
  return verify(parseCookies(req)[COOKIE]);
}

export function issueSession(res: Response, user: string): void {
  const value = `s:${Date.now() + MAX_AGE_MS}:${user}`;
  const attrs = [
    `${COOKIE}=${encodeURIComponent(sign(value))}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`,
  ];
  if (SECURE_COOKIES) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

export function clearSession(res: Response): void {
  const attrs = [`${COOKIE}=`, "HttpOnly", "Path=/", "Max-Age=0"];
  if (SECURE_COOKIES) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Validate a login. If a username is given, check it against the user list;
// otherwise fall back to matching any single configured password (owner's
// shared password still works with no name entered). Returns the resolved
// username on success, or null.
export function authenticate(username: unknown, password: unknown): string | null {
  const pass = String(password ?? "");
  const name = String(username ?? "").trim().toLowerCase();

  if (name) {
    const expected = USERS[name];
    if (expected && safeEqual(pass, expected)) return name;
    return null;
  }

  // No name entered — accept if the password matches any configured user
  // (keeps the old "just type the team password" flow working).
  for (const [user, expected] of Object.entries(USERS)) {
    if (safeEqual(pass, expected)) return user;
  }
  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isLoggedIn(req)) {
    next();
    return;
  }
  if (req.path.startsWith("/api/")) {
    res.status(401).json({ error: "Not logged in", needsLogin: true });
    return;
  }
  res.redirect("/login");
}
