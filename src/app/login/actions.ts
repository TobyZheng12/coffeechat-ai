"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createToken, safeEqual, sessionSecret } from "@/lib/auth/signed-cookie";
import { config } from "@/lib/config";
import { supabaseServer } from "@/lib/supabase/server";
import { DEMO_COOKIE, LOCAL_SESSION_COOKIE, LOCAL_USER_ID } from "@/lib/workspace";

export interface LoginState {
  error?: string;
  sent?: boolean;
}

/** Local development sign-in with a passcode from .env.local. */
export async function signInLocal(_prev: LoginState, form: FormData): Promise<LoginState> {
  const cfg = config();
  if (cfg.backend !== "local" || cfg.isProduction) return { error: "Local sign-in is disabled." };
  const passcode = String(form.get("passcode") ?? "");
  if (cfg.local.passcode && !safeEqual(passcode, cfg.local.passcode)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return { error: "That passcode isn't right." };
  }
  const jar = await cookies();
  jar.delete(DEMO_COOKIE);
  jar.set(LOCAL_SESSION_COOKIE, createToken(LOCAL_USER_ID, sessionSecret(cfg.sessionSecret)), {
    httpOnly: true,
    sameSite: "lax",
    secure: cfg.isProduction,
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  redirect("/app");
}

/** Production sign-in: Supabase magic link, restricted to ALLOWED_EMAILS. */
export async function signInWithEmail(_prev: LoginState, form: FormData): Promise<LoginState> {
  const cfg = config();
  if (cfg.backend !== "supabase") return { error: "Email sign-in isn't configured." };
  const parsed = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const email = parsed.data;
  if (cfg.isProduction && cfg.allowedEmails.length === 0) {
    return { error: "Sign-in is closed. Set ALLOWED_EMAILS to enable it." };
  }
  if (cfg.allowedEmails.length && !cfg.allowedEmails.includes(email)) {
    // Same message either way, so the allowlist can't be probed.
    return { sent: true };
  }
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${cfg.siteUrl}/auth/callback` },
  });
  if (error) {
    console.error("[auth] magic link failed", error.message);
    return { error: "Couldn't send the sign-in link. Please try again in a minute." };
  }
  return { sent: true };
}

export async function signOut() {
  const cfg = config();
  const jar = await cookies();
  jar.delete(LOCAL_SESSION_COOKIE);
  jar.delete(DEMO_COOKIE);
  if (cfg.backend === "supabase") {
    const sb = await supabaseServer();
    await sb.auth.signOut();
  }
  redirect("/");
}
