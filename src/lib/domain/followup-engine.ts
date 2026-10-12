import { addDays, diffDays, formatDate, maxDate } from "./dates";
import type { RelationshipStrength } from "./relationship";
import type {
  FollowUpInput,
  FollowUpKind,
  ISODate,
  MeetingSummary,
  MissionDisclosure,
  ResourceItem,
} from "./types";

/**
 * Smart follow-up engine.
 *
 * Design: the AI only *extracts facts* from meeting notes (who offered what,
 * what was promised, what was recommended). This file turns those facts into
 * dated recommendations with plain, testable rules. Keeping the timing logic
 * out of the model makes it predictable, explainable, and unit-testable.
 *
 * Principle: every recommendation needs a genuine reason. If the notes contain
 * no reason to reconnect, the engine recommends nothing beyond a thank-you —
 * never an arbitrary "check in monthly" reminder.
 */

export interface FollowUpContext {
  today: ISODate;
  meetingId: string;
  contactId: string;
  contactFirstName: string;
  meetingDate: ISODate;
  meetingCompleted: boolean;
  summary: Pick<
    MeetingSummary,
    | "action_items"
    | "resources"
    | "introductions_offered"
    | "reconnect_signals"
    | "offered_further_help"
    | "advice"
  > | null;
  thankYouAlreadySent: boolean;
  strength: RelationshipStrength;
  /** Date of the most recent message the user sent this contact, if any. */
  lastOutboundDate: ISODate | null;
  mission: { start: ISODate | null; end: ISODate | null; disclosure: MissionDisclosure };
  /** rule_keys of tasks that already exist (any status) — never recreate them. */
  existingRuleKeys: ReadonlySet<string>;
}

export interface FollowUpPlan {
  recommendations: FollowUpInput[];
  /** Human-readable explanations shown alongside the plan. */
  notes: string[];
}

const RESOURCE_DAYS: Record<ResourceItem["kind"], number> = {
  book: 30,
  course: 45,
  skill: 45,
  article: 14,
  podcast: 14,
  event: 14,
  other: 21,
};

/** Kinds that are time-sensitive and should happen *before* a mission, not after. */
const URGENT_KINDS: ReadonlySet<FollowUpKind> = new Set(["thank_you", "intro_response", "action_item"]);

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/** Interprets loose timing phrases like "this week" or "before I leave". */
export function dueFromHint(hint: string | null, ctx: Pick<FollowUpContext, "today" | "mission">): ISODate {
  const h = (hint ?? "").toLowerCase();
  if (/tomorrow|asap|right away|today/.test(h)) return addDays(ctx.today, 1);
  if (/this week|few days|couple (of )?days/.test(h)) return addDays(ctx.today, 5);
  if (/next week/.test(h)) return addDays(ctx.today, 10);
  if (/month/.test(h)) return addDays(ctx.today, 30);
  if (/before (my |the )?(mission|leav)/.test(h) && ctx.mission.start) {
    return maxDate(addDays(ctx.mission.start, -7), addDays(ctx.today, 1));
  }
  return addDays(ctx.today, 7);
}

export function planFollowUps(ctx: FollowUpContext): FollowUpPlan {
  const recs: FollowUpInput[] = [];
  const notes: string[] = [];
  const name = ctx.contactFirstName || "them";
  const s = ctx.summary;

  const push = (rec: Omit<FollowUpInput, "contact_id" | "meeting_id" | "status" | "source">) => {
    if (rec.rule_key && ctx.existingRuleKeys.has(rec.rule_key)) return;
    recs.push({
      ...rec,
      contact_id: ctx.contactId,
      meeting_id: ctx.meetingId,
      status: "suggested",
      source: "engine",
    });
  };

  // 1. Thank-you note — within 24 hours of a completed conversation.
  if (ctx.meetingCompleted && !ctx.thankYouAlreadySent) {
    const ideal = addDays(ctx.meetingDate, 1);
    const firstAdvice = s?.advice[0]?.advice;
    const intro = s?.introductions_offered[0];
    const angleParts = [
      firstAdvice
        ? `Mention one specific piece of advice — e.g. "${truncate(firstAdvice, 80)}" — and how you plan to use it.`
        : "Mention one specific thing from the conversation that stuck with you.",
    ];
    if (intro) angleParts.push(`Gratefully accept their offer to connect you with ${intro.person_or_role}.`);
    push({
      kind: "thank_you",
      title: `Send ${name} a thank-you note`,
      reason:
        diffDays(ctx.today, ideal) > 0
          ? "Thank-you notes land best within 24 hours. It's a little late, but still worth sending today."
          : "Thank-you notes land best within 24 hours of the conversation.",
      message_angle: angleParts.join(" "),
      due_date: maxDate(ideal, ctx.today),
      timing_note: "",
      priority: "high",
      confidence: "high",
      rule_key: `thank_you:${ctx.meetingId}`,
    });
  }

  if (s) {
    // 2. Introductions they offered — gently check in if nothing has happened.
    for (const intro of s.introductions_offered.slice(0, 2)) {
      push({
        kind: "intro_response",
        title: `Check on the introduction to ${intro.person_or_role}`,
        reason: `${name} offered to introduce you to ${intro.person_or_role}. If the introduction hasn't happened yet, a gentle, low-pressure reminder is appropriate.`,
        message_angle:
          "Keep it short and easy to decline: thank them again and offer a two-sentence blurb about yourself they can forward.",
        due_date: maxDate(addDays(ctx.meetingDate, 10), addDays(ctx.today, 1)),
        timing_note: "Skip this if the introduction already happened.",
        priority: "high",
        confidence: "high",
        rule_key: `intro:${ctx.meetingId}:${slug(intro.person_or_role)}`,
      });
    }

    // 3. Things the user promised to do.
    for (const item of s.action_items.filter((a) => a.owner === "me").slice(0, 3)) {
      push({
        kind: "action_item",
        title: `Follow through: ${truncate(item.description, 70)}`,
        reason: `You told ${name} you would do this. Following through is the clearest way to show you valued their time.`,
        message_angle: "Once it's done, send a 2–3 sentence update on what you did and what you learned.",
        due_date: dueFromHint(item.due_hint, ctx),
        timing_note: item.due_hint ? `You mentioned: "${item.due_hint}".` : "",
        priority: "high",
        confidence: item.due_hint ? "high" : "medium",
        rule_key: `action:${ctx.meetingId}:${slug(item.description)}`,
      });
    }

    // 4. Resources they recommended — follow up *after* engaging with them.
    for (const res of s.resources.slice(0, 2)) {
      const days = RESOURCE_DAYS[res.kind] ?? 21;
      push({
        kind: "resource_followup",
        title: `Share what you learned from ${truncate(res.name, 60)}`,
        reason: `${name} recommended ${res.name}. Reaching out after you've actually engaged with it gives you a genuine, non-transactional reason to reconnect.`,
        message_angle: "Name one specific takeaway and how you're applying it. No ask needed.",
        due_date: addDays(ctx.today, days),
        timing_note: `About ${days} days gives you time to ${res.kind === "book" ? "read it" : "work through it"}.`,
        priority: "medium",
        confidence: "medium",
        rule_key: `resource:${ctx.meetingId}:${slug(res.name)}`,
      });
    }

    // 5. Explicit reconnect signals ("reach out after your mission").
    for (const sig of s.reconnect_signals) {
      if (sig.timeframe === "after_resource") continue; // covered by rule 4
      if (sig.timeframe === "general") {
        notes.push(
          `${name} said to keep in touch. Reach out when you have a real update rather than on a fixed schedule.`,
        );
        continue;
      }
      if (sig.timeframe === "after_mission") {
        const end = ctx.mission.end;
        push({
          kind: "post_mission_reconnect",
          title: `Reconnect with ${name} after your mission`,
          reason: `${name} suggested reconnecting after your mission ("${truncate(sig.phrase, 80)}").`,
          message_angle:
            "Remind them briefly who you are and when you spoke, share what you're focused on now, and ask one thoughtful question.",
          due_date: end ? addDays(end, 21) : null,
          timing_note: end
            ? "About three weeks after you return, once you've settled in."
            : "No date yet — add your return date in Settings and this will be easy to schedule.",
          priority: "medium",
          confidence: "high",
          rule_key: `reconnect:${ctx.meetingId}:after_mission`,
        });
        continue;
      }
      const date = sig.date && sig.date > ctx.today ? sig.date : null;
      push({
        kind: "reconnect",
        title:
          sig.timeframe === "after_recruiting"
            ? `Reconnect with ${name} after recruiting season`
            : `Reconnect with ${name}`,
        reason: `${name} suggested reconnecting ("${truncate(sig.phrase, 80)}").`,
        message_angle: "Share a concrete update related to what you discussed, then ask one specific question.",
        due_date: date,
        timing_note: date ? "" : "They didn't give an exact date — pick one that fits your timeline.",
        priority: "medium",
        confidence: date ? "high" : "medium",
        rule_key: `reconnect:${ctx.meetingId}:${sig.timeframe}`,
      });
    }

    // 6. Optional pre-mission note — only for relationships with real substance.
    const ms = ctx.mission.start;
    const hasSubstance =
      ctx.strength !== "new" || s.offered_further_help || s.introductions_offered.length > 0;
    if (ms && ctx.mission.disclosure !== "never" && hasSubstance && diffDays(ms, ctx.today) >= 21) {
      push({
        kind: "pre_mission_update",
        title: `Optional: brief update to ${name} before you leave`,
        reason: `${name} was generous with help. A short note before ${formatDate(ms)} lets them know you'll be away and that you'd like to reconnect later. Only send it if it feels natural.`,
        message_angle: "Share one thing you did with their advice, and say you'd love to reconnect when you return.",
        due_date: addDays(ms, -14),
        timing_note: "Two weeks before you leave.",
        priority: "low",
        confidence: "low",
        rule_key: `pre_mission:${ctx.contactId}`,
      });
    }
  }

  // Respect message spacing: non-urgent notes shouldn't land right after another message.
  if (ctx.lastOutboundDate) {
    const earliest = addDays(ctx.lastOutboundDate, 14);
    for (const r of recs) {
      if (r.due_date && !URGENT_KINDS.has(r.kind) && r.kind !== "pre_mission_update" && r.due_date < earliest) {
        r.due_date = earliest;
        r.timing_note = joinNote(r.timing_note, "Spaced at least two weeks after your last message.");
      }
    }
  }

  // Never schedule reminders during the mission window.
  applyMissionWindow(recs, ctx);

  const longTerm = recs.filter((r) => r.kind !== "thank_you");
  if (longTerm.length === 0 && !notes.length) {
    notes.push(
      "No long-term follow-up is recommended yet — nothing in your notes gives a natural reason to reconnect. That's fine: reach out when you have a genuine update.",
    );
  }

  return { recommendations: recs, notes };
}

function applyMissionWindow(recs: FollowUpInput[], ctx: FollowUpContext) {
  const { start, end } = ctx.mission;
  if (!start) return;
  for (const r of recs) {
    if (!r.due_date) continue;
    const during = r.due_date >= start && (!end || r.due_date < end);
    if (!during) continue;
    const beforeLeaving = addDays(start, -2);
    if (URGENT_KINDS.has(r.kind) && beforeLeaving >= ctx.today) {
      r.due_date = beforeLeaving;
      r.timing_note = joinNote(r.timing_note, "Moved before your mission starts.");
    } else if (end) {
      r.due_date = addDays(end, 14);
      r.timing_note = joinNote(r.timing_note, "Moved to after you return from your mission.");
    } else {
      r.due_date = null;
      r.timing_note = joinNote(
        r.timing_note,
        "This would fall during your mission — reschedule once you know your return date.",
      );
    }
  }
}

function joinNote(a: string, b: string) {
  return a ? `${a} ${b}` : b;
}

function truncate(text: string, n: number) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}
