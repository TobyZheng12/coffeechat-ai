import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Tiny HMAC-signed session token for LOCAL mode only (production uses
 * Supabase Auth). Format: `<userId>.<expiresAtMs>.<signature>`.
 */

const g = globalThis as unknown as { __ccDevSecret?: string };

export function sessionSecret(configured: string): string {
  if (configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be at least 32 characters in production.");
  }
  // Development fallback: random per server process (you'll sign in again after a restart).
  g.__ccDevSecret ??= randomBytes(32).toString("hex");
  return g.__ccDevSecret;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createToken(userId: string, secret: string, ttlMs = 1000 * 60 * 60 * 24 * 14): string {
  const payload = `${userId}.${Date.now() + ttlMs}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyToken(token: string | undefined, secret: string): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const expected = sign(`${userId}.${exp}`, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  return userId;
}

/** Constant-time string comparison for passcodes. */
export function safeEqual(a: string, b: string): boolean {
  const x = createHmac("sha256", "cmp").update(a).digest();
  const y = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(x, y);
}
