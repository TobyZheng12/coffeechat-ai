import { z } from "zod";
import { addDays, isISODate } from "@/lib/domain/dates";
import type { FollowUpTask, UUID } from "@/lib/domain/types";
import { NotFoundError } from "@/lib/data/repository";
import { type AppContext, loadProfile, nowOf, todayFor } from "./context";

/**
 * Follow-up task actions. Every change is explicit and user-initiated.
 * Reminders are shown in-app; nothing is sent automatically.
 */

async function requireTask(ctx: AppContext, id: UUID): Promise<FollowUpTask> {
  const t = await ctx.repo.getFollowUp(id);
  if (!t) throw new NotFoundError("Follow-up");
  return t;
}

const dateSchema = z.string().refine(isISODate, "Use YYYY-MM-DD");

export async function acceptFollowUp(ctx: AppContext, id: UUID) {
  await requireTask(ctx, id);
  return (await ctx.repo.updateFollowUp(id, { status: "accepted" }))!;
}

export async function rescheduleFollowUp(ctx: AppContext, id: UUID, date: string) {
  await requireTask(ctx, id);
  const due = dateSchema.parse(date);
  return (await ctx.repo.updateFollowUp(id, { due_date: due, status: "accepted" }))!;
}

export async function snoozeFollowUp(ctx: AppContext, id: UUID, days: number) {
  const t = await requireTask(ctx, id);
  const n = z.number().int().min(1).max(365).parse(days);
  const profile = await loadProfile(ctx);
  const today = todayFor(ctx, profile);
  const base = t.due_date && t.due_date > today ? t.due_date : today;
  return (await ctx.repo.updateFollowUp(id, { due_date: addDays(base, n), status: "snoozed" }))!;
}

export async function dismissFollowUp(ctx: AppContext, id: UUID) {
  await requireTask(ctx, id);
  return (await ctx.repo.updateFollowUp(id, { status: "dismissed" }))!;
}

export async function completeFollowUp(ctx: AppContext, id: UUID) {
  const t = await requireTask(ctx, id);
  if (t.status === "completed") return t;
  const now = nowOf(ctx).toISOString();
  const updated = await ctx.repo.updateFollowUp(id, { status: "completed", completed_at: now });
  await ctx.repo.addInteraction({
    contact_id: t.contact_id,
    meeting_id: t.meeting_id,
    kind: "follow_up_completed",
    occurred_at: now,
    summary: t.title,
  });
  return updated!;
}

export async function reopenFollowUp(ctx: AppContext, id: UUID) {
  await requireTask(ctx, id);
  return (await ctx.repo.updateFollowUp(id, { status: "accepted", completed_at: null }))!;
}

export const ManualFollowUpSchema = z.object({
  contact_id: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  reason: z.string().trim().max(1000).default(""),
  due_date: z.union([dateSchema, z.literal("")]).default(""),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
});

export async function createManualFollowUp(ctx: AppContext, raw: z.input<typeof ManualFollowUpSchema>) {
  const input = ManualFollowUpSchema.parse(raw);
  const [task] = await ctx.repo.createFollowUps([
    {
      contact_id: input.contact_id,
      meeting_id: null,
      kind: "custom",
      title: input.title,
      reason: input.reason,
      message_angle: "",
      due_date: input.due_date || null,
      timing_note: "",
      priority: input.priority,
      confidence: "high",
      status: "accepted",
      rule_key: null,
      source: "manual",
    },
  ]);
  return task;
}
