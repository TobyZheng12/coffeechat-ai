import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { MockProvider } from "@/lib/ai/mock";
import type { AIProvider } from "@/lib/ai/provider";
import { sessionSecret, verifyToken } from "@/lib/auth/signed-cookie";
import { config } from "@/lib/config";
import { localStore } from "@/lib/data/local-store";
import { MemoryRepository } from "@/lib/data/memory";
import type { Repository } from "@/lib/data/repository";
import { SupabaseRepository } from "@/lib/data/supabase";
import { DEMO_ID_PATTERN, getDemoRepository } from "@/lib/demo/registry";
import type { AppContext } from "@/lib/services/context";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Resolves WHO is making this request and WHICH data they may touch.
 * This is the only place that decides between the private database, the
 * local data file, and the isolated public demo.
 */

export const DEMO_COOKIE = "cc_demo";
export const LOCAL_SESSION_COOKIE = "cc_session";
export const LOCAL_USER_ID = "10ca1000-0000-4000-8000-000000000001";

export type WorkspaceMode = "supabase" | "local" | "demo";

export interface Workspace extends AppContext {
  mode: WorkspaceMode;
  email: string | null;
}

function aiProvider(mode: WorkspaceMode): AIProvider {
  const { ai, demo } = config();
  if (mode === "demo" && demo.ai !== "live") return new MockProvider();
  if (ai.provider === "mock") return new MockProvider();
  if (ai.apiKey) return new AnthropicProvider(ai.model, ai.apiKey);
  return new MockProvider();
}

function build(mode: WorkspaceMode, repo: Repository, email: string | null): Workspace {
  const cfg = config();
  return {
    mode,
    email,
    repo,
    ai: aiProvider(mode),
    aiDailyLimit: mode === "demo" ? cfg.demo.dailyLimit : cfg.ai.dailyLimit,
  };
}

/** Returns the current workspace, or null when signed out. Cached per request. */
export const getWorkspace = cache(async (): Promise<Workspace | null> => {
  // Everything below is per-request (session, clock, per-user data).
  await connection();
  const cfg = config();
  const jar = await cookies();

  // 1. Public demo — fictional, in-memory, never touches real storage.
  const demoId = jar.get(DEMO_COOKIE)?.value;
  if (cfg.demo.enabled && demoId && DEMO_ID_PATTERN.test(demoId)) {
    return build("demo", await getDemoRepository(demoId), null);
  }

  // 2. Production: Supabase Auth + Row Level Security.
  if (cfg.backend === "supabase") {
    const sb = await supabaseServer();
    const { data } = await sb.auth.getClaims();
    const claims = data?.claims;
    if (!claims?.sub) return null;
    const email = typeof claims.email === "string" ? claims.email.toLowerCase() : null;
    if (cfg.allowedEmails.length && (!email || !cfg.allowedEmails.includes(email))) return null;
    return build("supabase", new SupabaseRepository(sb, claims.sub), email);
  }

  // 3. Local development: passcode session + JSON file.
  if (cfg.isProduction) return null; // local file storage is never used in production
  const userId = verifyToken(jar.get(LOCAL_SESSION_COOKIE)?.value, sessionSecret(cfg.sessionSecret));
  if (userId !== LOCAL_USER_ID) return null;
  return build("local", new MemoryRepository(localStore(cfg.local.dataFile), LOCAL_USER_ID), null);
});

export async function requireWorkspace(): Promise<Workspace> {
  const ws = await getWorkspace();
  if (!ws) redirect("/login");
  return ws;
}
