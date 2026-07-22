import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { APP_PASSWORD, SESSION_SECRET, SECURE_COOKIES } from "./config.js";

const COOKIE = "linc_session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hmac(value: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function sign(value: string): string {
  return `${value}.${hmac(value)}`;
}

function verify(signed: string | undefined): boolean {
  if (!signed) return false;
  const dot = signed.lastIndexOf(".");
  if (dot < 0) return false;
  const value = signed.slice(0, dot);
  const mac = signed.slice(dot + 1);
  const expected = hmac(value);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const exp = Number(value.split(":")[1]);
  return Number.isFinite(exp) && Date.now() < exp;
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
  return verify(parseCookies(req)[COOKIE]);
}

export function issueSession(res: Response): void {
  const value = `s:${Date.now() + MAX_AGE_MS}`;
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

export function checkPassword(input: unknown): boolean {
  const a = Buffer.from(String(input ?? ""));
  const b = Buffer.from(APP_PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
