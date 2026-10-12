import { z } from "zod";
import { looselySupported } from "@/lib/ai/grounding";
import { dateOf } from "@/lib/domain/dates";
import type { MessageDraft, MessageKind, UUID } from "@/lib/domain/types";
import { NotFoundError } from "@/lib/data/repository";
import { type AppContext, loadProfile, nowOf, runAI, todayFor } from "./context";

export const MESSAGE_KINDS = [
  "thank_you",
  "linkedin_message",
  "reconnection",
  "advice_update",
  "post_mission_reconnection",
  "action_followup",
] as const satisfies readonly MessageKind[];

export const DraftRequestSchema = z.object({
  contact_id: z.string().uuid(),
  meeting_id: z.string().uuid().nullable().default(null),
  follow_up_task_id: z.string().uuid().nullable().default(null),
  kind: z.enum(MESSAGE_KINDS),
  tone: z.enum(["professional", "friendly", "brief"]),
  user_context: z.string().trim().max(2000).default(""),
});

export interface DraftResult {
  draft: MessageDraft;
  /** Details the AI referenced that we couldn't find in your notes — double-check them. */
  unverifiedDetails: string[];
}

/** Generates a personalized draft. Never sends anything. */
export async function generateDraft(ctx: AppContext, raw: z.input<typeof DraftRequestSchema>): Promise<DraftResult> {
  const req = DraftRequestSchema.parse(raw);
  const contact = await ctx.repo.getContact(req.contact_id);
  if (!contact) throw new NotFoundError("Contact");
  const profile = await loadProfile(ctx);

  // Use the requested meeting, or the most recent completed one.
  const meetings = await ctx.repo.listMeetings({ contactId: contact.id });
  const meeting = req.meeting_id
    ? meetings.find((m) => m.id === req.meeting_id)
    : meetings.find((m) => m.status === "completed");
  if (req.meeting_id && !meeting) throw new NotFoundError("Meeting");

  const [summaries, notes] = meeting
    ? await Promise.all([ctx.repo.listSummaries({ meetingId: meeting.id }), ctx.repo.listNotes(meeting.id)])
    : [[], []];
  const summary = summaries[0] ?? null;
  const notesText = notes.map((n) => n.body).join("\n\n");
  const channel = req.kind === "linkedin_message" ? "linkedin" : "email";

  const ai = await runAI(ctx, "draft_message", {
    profile,
    today: todayFor(ctx, profile),
    contact,
    kind: req.kind,
    tone: req.tone,
    channel,
    meetingDate: meeting ? dateOf(meeting.completed_at ?? meeting.scheduled_at ?? meeting.created_at, profile.timezone) : null,
    summary,
    notes: notesText,
    userContext: req.user_context,
  });

  const knownText = [notesText, summary ? JSON.stringify(summary) : "", req.user_context, contact.personal_notes].join("\n");
  const unverifiedDetails = ai.details_used.filter((d) => !looselySupported(d, knownText));

  const draft = await ctx.repo.createDraft({
    contact_id: contact.id,
    meeting_id: meeting?.id ?? null,
    follow_up_task_id: req.follow_up_task_id,
    kind: req.kind,
    tone: req.tone,
    channel,
    subject: channel === "linkedin" ? "" : ai.subject.slice(0, 300),
    body: ai.body.slice(0, 20000),
    generated_by: ctx.ai.label,
  });
  return { draft, unverifiedDetails };
}

export const DraftEditSchema = z.object({
  subject: z.string().trim().max(300),
  body: z.string().trim().min(1).max(20000),
});

export async function saveDraftEdits(ctx: AppContext, draftId: UUID, raw: z.input<typeof DraftEditSchema>) {
  const input = DraftEditSchema.parse(raw);
  const d = await ctx.repo.updateDraft(draftId, input);
  if (!d) throw new NotFoundError("Draft");
  return d;
}

/**
 * The ONLY way a message becomes "sent". Copying a draft never marks it sent.
 * Also logs the interaction and completes the matching follow-up task.
 */
export async function markDraftSent(ctx: AppContext, draftId: UUID, sentAt?: string) {
  const draft = await ctx.repo.getDraft(draftId);
  if (!draft) throw new NotFoundError("Draft");
  if (draft.sent_at) return draft;
  const when = sentAt && !Number.isNaN(Date.parse(sentAt)) ? new Date(sentAt).toISOString() : nowOf(ctx).toISOString();
  const updated = await ctx.repo.updateDraft(draftId, { sent_at: when, status: "draft" });

  const label: Record<MessageKind, string> = {
    thank_you: "Thank-you email sent",
    linkedin_message: "LinkedIn message sent",
    reconnection: "Reconnection email sent",
    advice_update: "Advice update sent",
    post_mission_reconnection: "Post-mission reconnection sent",
    action_followup: "Follow-up sent",
  };
  await ctx.repo.addInteraction({
    contact_id: draft.contact_id,
    meeting_id: draft.meeting_id,
    kind: "message_sent",
    occurred_at: when,
    summary: draft.subject ? `${label[draft.kind]}: “${draft.subject}”` : label[draft.kind],
  });

  // Complete the follow-up this message fulfils.
  const tasks = await ctx.repo.listFollowUps({ contactId: draft.contact_id });
  const open = (t: (typeof tasks)[number]) => t.status !== "completed" && t.status !== "dismissed";
  const targets = tasks.filter(
    (t) =>
      open(t) &&
      (t.id === draft.follow_up_task_id ||
        (draft.kind === "thank_you" && t.kind === "thank_you" && t.meeting_id === draft.meeting_id)),
  );
  for (const t of targets) {
    await ctx.repo.updateFollowUp(t.id, { status: "completed", completed_at: when });
  }
  return updated!;
}

export async function discardDraft(ctx: AppContext, draftId: UUID) {
  const d = await ctx.repo.updateDraft(draftId, { status: "discarded" });
  if (!d) throw new NotFoundError("Draft");
  return d;
}
