import { AIError, type AIProvider } from "@/lib/ai/provider";
import type { AITaskKind, AITaskMap } from "@/lib/ai/tasks";
import type { Repository } from "@/lib/data/repository";
import { todayIn } from "@/lib/domain/dates";
import type { Profile } from "@/lib/domain/types";
import { DEFAULT_PROFILE } from "@/lib/data/memory";

/**
 * Everything a service needs, passed explicitly. Services never read cookies,
 * env vars, or globals — which is what makes the whole workflow testable.
 */
export interface AppContext {
  repo: Repository;
  ai: AIProvider;
  /** Max real AI calls per user per day. Offline templates are not counted. */
  aiDailyLimit: number;
  now?: () => Date;
}

export function nowOf(ctx: AppContext): Date {
  return ctx.now?.() ?? new Date();
}

export async function loadProfile(ctx: AppContext): Promise<Profile> {
  const p = await ctx.repo.getProfile();
  if (p) return p;
  const ts = nowOf(ctx).toISOString();
  return { ...DEFAULT_PROFILE, id: ctx.repo.userId, created_at: ts, updated_at: ts };
}

export function todayFor(ctx: AppContext, profile: Pick<Profile, "timezone">): string {
  return todayIn(profile.timezone || "America/Denver", nowOf(ctx));
}

/** Runs an AI task after checking (and counting) the user's daily allowance. */
export async function runAI<K extends AITaskKind>(
  ctx: AppContext,
  kind: K,
  input: AITaskMap[K]["input"],
): Promise<AITaskMap[K]["output"]> {
  if (!ctx.ai.offline) {
    const day = nowOf(ctx).toISOString().slice(0, 10);
    const used = await ctx.repo.incrementAiUsage(day);
    if (used > ctx.aiDailyLimit) {
      throw new AIError(
        "usage_limit",
        `You've reached today's AI limit (${ctx.aiDailyLimit} requests). It resets tomorrow.`,
      );
    }
  }
  return ctx.ai.run(kind, input);
}

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "";
}
