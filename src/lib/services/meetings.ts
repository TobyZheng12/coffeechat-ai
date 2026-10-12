import { z } from "zod";
import { groundNotes } from "@/lib/ai/grounding";
import { dateOf } from "@/lib/domain/dates";
import { type FollowUpPlan, planFollowUps } from "@/lib/domain/followup-engine";
import { relationshipStrength } from "@/lib/domain/relationship";
import type { FollowUpTask, MeetingMedium, MeetingSummary, UUID } from "@/lib/domain/types";
import { NotFoundError } from "@/lib/data/repository";
import { type AppContext, firstName, loadProfile, nowOf, runAI, todayFor } from "./context";
import { generateScript } from "./scripts";

export const NewMeetingSchema = z.object({
  scheduled_at: z
    .string()
    .trim()
    .default("")
    .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "Invalid date"),
  duration_minutes: z.coerce.number().int().min(5).max(240).default(30),
  medium: z.enum(["zoom", "phone", "in_person", "other"]).default("zoom"),
  focus: z.string().trim().max(2000).default(""),
  generate: z.boolean().default(true),
});

/** Schedules another conversation with an existing contact (history is kept). */
export async function scheduleMeeting(ctx: AppContext, contactId: UUID, raw: z.input<typeof NewMeetingSchema>) {
  const input = NewMeetingSchema.parse(raw);
  const contact = await ctx.repo.getContact(contactId);
  if (!contact) throw new NotFoundError("Contact");
  const count = (await ctx.repo.listMeetings({ contactId })).length;
  const scheduledAt = input.scheduled_at ? new Date(input.scheduled_at).toISOString() : null;
  const meeting = await ctx.repo.createMeeting({
    contact_id: contactId,
    title: count > 0 ? `Follow-up conversation with ${contact.full_name}` : `Coffee chat with ${contact.full_name}`,
    scheduled_at: scheduledAt,
    duration_minutes: input.duration_minutes,
    medium: input.medium as MeetingMedium,
  });
  if (scheduledAt) {
    await ctx.repo.addInteraction({
      contact_id: contactId,
      meeting_id: meeting.id,
      kind: "meeting_scheduled",
      occurred_at: nowOf(ctx).toISOString(),
      summary: `${input.duration_minutes}-minute conversation scheduled`,
    });
  }
  if (input.generate) await generateScript(ctx, meeting.id, { focus: input.focus });
  return meeting;
}

export const NotesSchema = z.object({
  body: z.string().trim().min(3, "Add a few words about the conversation").max(20000),
  kind: z.enum(["post_meeting", "live"]).default("post_meeting"),
  process: z.boolean().default(true),
});

export interface NotesResult {
  summary: MeetingSummary | null;
  createdFollowUps: FollowUpTask[];
  planNotes: string[];
}

/**
 * Saves notes (append-only), marks the meeting complete, then has the AI
 * extract advice / commitments / resources, and turns those into follow-ups.
 */
export async function saveMeetingNotes(ctx: AppContext, meetingId: UUID, raw: z.input<typeof NotesSchema>): Promise<NotesResult> {
  const input = NotesSchema.parse(raw);
  const meeting = await ctx.repo.getMeeting(meetingId);
  if (!meeting) throw new NotFoundError("Meeting");
  await ctx.repo.addNote(meetingId, input.body, input.kind);
  await markMeetingCompleted(ctx, meetingId);
  if (!input.process) return { summary: null, createdFollowUps: [], planNotes: [] };
  return processMeetingNotes(ctx, meetingId);
}

export async function markMeetingCompleted(ctx: AppContext, meetingId: UUID) {
  const meeting = await ctx.repo.getMeeting(meetingId);
  if (!meeting) throw new NotFoundError("Meeting");
  if (meeting.status === "completed") return meeting;
  const now = nowOf(ctx);
  const scheduled = meeting.scheduled_at ? new Date(meeting.scheduled_at) : null;
  const occurredAt = scheduled && scheduled <= now ? scheduled.toISOString() : now.toISOString();
  // If it was scheduled for later, it evidently happened now — record the real time.
  const updated = await ctx.repo.updateMeeting(meetingId, {
    status: "completed",
    completed_at: occurredAt,
    ...(scheduled && scheduled > now ? { scheduled_at: occurredAt } : {}),
  });
  await ctx.repo.addInteraction({
    contact_id: meeting.contact_id,
    meeting_id: meetingId,
    kind: "meeting_completed",
    occurred_at: occurredAt,
    summary: `${meeting.duration_minutes}-minute ${meeting.medium === "in_person" ? "meeting" : "informational interview"} completed`,
  });
  return updated!;
}

/** (Re)processes all notes for a meeting into a new summary version + follow-ups. */
export async function processMeetingNotes(ctx: AppContext, meetingId: UUID): Promise<NotesResult> {
  const meeting = await ctx.repo.getMeeting(meetingId);
  if (!meeting) throw new NotFoundError("Meeting");
  const contact = await ctx.repo.getContact(meeting.contact_id);
  if (!contact) throw new NotFoundError("Contact");
  const notes = await ctx.repo.listNotes(meetingId);
  if (notes.length === 0) return { summary: null, createdFollowUps: [], planNotes: [] };

  const profile = await loadProfile(ctx);
  const today = todayFor(ctx, profile);
  const meetingDate = dateOf(meeting.completed_at ?? meeting.scheduled_at ?? nowOf(ctx).toISOString(), profile.timezone);
  const notesText = notes.map((n) => n.body).join("\n\n");

  const ai = await runAI(ctx, "process_notes", {
    profile,
    today,
    contact,
    meetingDate,
    notes: notesText,
  });
  const { value } = groundNotes(ai, notesText);

  const summary = await ctx.repo.addSummary({
    meeting_id: meetingId,
    contact_id: contact.id,
    source_note_ids: notes.map((n) => n.id),
    summary: value.summary,
    key_points: value.key_points,
    advice: value.advice,
    action_items: value.action_items.map((a) => ({ ...a, due_hint: a.due_hint ?? null })),
    relationship_insights: value.relationship_insights,
    resources: value.resources,
    introductions_offered: value.introductions_offered,
    reconnect_signals: value.reconnect_signals,
    offered_further_help: value.offered_further_help,
    topics: value.topics,
    generated_by: ctx.ai.label,
  });

  // Knowledge base: one insight per piece of advice. Older versions are kept,
  // but we skip advice already recorded for this meeting.
  const existingInsights = new Set(
    (await ctx.repo.listInsights({ contactId: contact.id }))
      .filter((i) => i.meeting_id === meetingId)
      .map((i) => i.insight.toLowerCase()),
  );
  await ctx.repo.addInsights(
    value.advice
      .filter((a) => !existingInsights.has(a.advice.toLowerCase()))
      .map((a) => ({
        contact_id: contact.id,
        meeting_id: meetingId,
        summary_id: summary.id,
        insight: a.advice,
        topic: a.topic,
        source_quote: a.source_quote,
      })),
  );

  const plan = await planForMeeting(ctx, meetingId, summary);
  const created = await ctx.repo.createFollowUps(plan.recommendations);
  return { summary, createdFollowUps: created, planNotes: plan.notes };
}

/** Builds the follow-up plan for a meeting from the current relationship state. */
export async function planForMeeting(ctx: AppContext, meetingId: UUID, summary: MeetingSummary | null): Promise<FollowUpPlan> {
  const meeting = await ctx.repo.getMeeting(meetingId);
  if (!meeting) throw new NotFoundError("Meeting");
  const contact = await ctx.repo.getContact(meeting.contact_id);
  if (!contact) throw new NotFoundError("Contact");
  const profile = await loadProfile(ctx);
  const [meetings, interactions, drafts, tasks] = await Promise.all([
    ctx.repo.listMeetings({ contactId: contact.id }),
    ctx.repo.listInteractions({ contactId: contact.id }),
    ctx.repo.listDrafts({ contactId: contact.id }),
    ctx.repo.listFollowUps({ contactId: contact.id }),
  ]);
  const sent = drafts.filter((d) => d.sent_at);
  const lastOutbound = [
    ...sent.map((d) => d.sent_at as string),
    ...interactions.filter((i) => i.kind === "message_sent").map((i) => i.occurred_at),
  ]
    .sort()
    .at(-1);

  return planFollowUps({
    today: todayFor(ctx, profile),
    meetingId,
    contactId: contact.id,
    contactFirstName: firstName(contact.full_name),
    meetingDate: dateOf(meeting.completed_at ?? meeting.scheduled_at ?? nowOf(ctx).toISOString(), profile.timezone),
    meetingCompleted: meeting.status === "completed",
    summary,
    thankYouAlreadySent: sent.some((d) => d.meeting_id === meetingId && d.kind === "thank_you"),
    strength: relationshipStrength({ meetings, interactions }),
    lastOutboundDate: lastOutbound ? dateOf(lastOutbound, profile.timezone) : null,
    mission: { start: profile.mission_start, end: profile.mission_end, disclosure: profile.mission_disclosure },
    existingRuleKeys: new Set(tasks.map((t) => t.rule_key).filter((k): k is string => !!k)),
  });
}

export async function cancelMeeting(ctx: AppContext, meetingId: UUID) {
  const m = await ctx.repo.updateMeeting(meetingId, { status: "cancelled" });
  if (!m) throw new NotFoundError("Meeting");
  return m;
}

export const RescheduleSchema = z.object({
  scheduled_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date"),
  duration_minutes: z.coerce.number().int().min(5).max(240),
});

export async function rescheduleMeeting(ctx: AppContext, meetingId: UUID, raw: z.input<typeof RescheduleSchema>) {
  const input = RescheduleSchema.parse(raw);
  const m = await ctx.repo.updateMeeting(meetingId, {
    scheduled_at: new Date(input.scheduled_at).toISOString(),
    duration_minutes: input.duration_minutes,
  });
  if (!m) throw new NotFoundError("Meeting");
  return m;
}
