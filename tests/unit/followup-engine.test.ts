import { describe, expect, it } from "vitest";
import { dueFromHint, type FollowUpContext, planFollowUps } from "@/lib/domain/followup-engine";
import { bucketFollowUps } from "@/lib/domain/followups";
import type { FollowUpTask } from "@/lib/domain/types";

const emptySummary = {
  action_items: [],
  resources: [],
  introductions_offered: [],
  reconnect_signals: [],
  offered_further_help: false,
  advice: [],
};

function ctx(over: Partial<FollowUpContext> = {}): FollowUpContext {
  return {
    today: "2026-10-22",
    meetingId: "m1",
    contactId: "c1",
    contactFirstName: "Sarah",
    meetingDate: "2026-10-22",
    meetingCompleted: true,
    summary: emptySummary,
    thankYouAlreadySent: false,
    strength: "new",
    lastOutboundDate: null,
    mission: { start: null, end: null, disclosure: "when_relevant" },
    existingRuleKeys: new Set(),
    ...over,
  };
}

describe("follow-up engine", () => {
  it("recommends a thank-you within 24 hours after a completed meeting", () => {
    const plan = planFollowUps(ctx());
    expect(plan.recommendations).toHaveLength(1);
    const [ty] = plan.recommendations;
    expect(ty).toMatchObject({ kind: "thank_you", due_date: "2026-10-23", priority: "high", confidence: "high" });
    expect(ty.reason).toBeTruthy();
    expect(ty.message_angle).toBeTruthy();
  });

  it("does not invent a recurring follow-up when there's no reason to reconnect", () => {
    const plan = planFollowUps(ctx({ thankYouAlreadySent: true }));
    expect(plan.recommendations).toHaveLength(0);
    expect(plan.notes.join(" ")).toMatch(/no long-term follow-up/i);
  });

  it("schedules a late thank-you for today, not in the past", () => {
    const plan = planFollowUps(ctx({ meetingDate: "2026-10-15" }));
    expect(plan.recommendations[0].due_date).toBe("2026-10-22");
    expect(plan.recommendations[0].reason).toMatch(/late/);
  });

  it("follows up on a recommended book after time to read it", () => {
    const plan = planFollowUps(
      ctx({ thankYouAlreadySent: true, summary: { ...emptySummary, resources: [{ name: "The Goal", kind: "book", note: "" }] } }),
    );
    expect(plan.recommendations[0]).toMatchObject({ kind: "resource_followup", due_date: "2026-11-21" });
  });

  it("creates an action item for the user's own commitments using timing hints", () => {
    const plan = planFollowUps(
      ctx({
        thankYouAlreadySent: true,
        summary: { ...emptySummary, action_items: [{ owner: "me", description: "Send my resume", due_hint: "this week" }] },
      }),
    );
    expect(plan.recommendations[0]).toMatchObject({ kind: "action_item", due_date: "2026-10-27", confidence: "high" });
  });

  it("ignores things the contact will do (owner = them)", () => {
    const plan = planFollowUps(
      ctx({
        thankYouAlreadySent: true,
        summary: { ...emptySummary, action_items: [{ owner: "them", description: "Send slides", due_hint: null }] },
      }),
    );
    expect(plan.recommendations).toHaveLength(0);
  });

  it("checks in on an offered introduction", () => {
    const plan = planFollowUps(
      ctx({ summary: { ...emptySummary, introductions_offered: [{ person_or_role: "Daniel on the strategy team", note: "" }] } }),
    );
    const intro = plan.recommendations.find((r) => r.kind === "intro_response")!;
    expect(intro.due_date).toBe("2026-11-01");
    // The thank-you note angle also mentions accepting the intro.
    expect(plan.recommendations.find((r) => r.kind === "thank_you")!.message_angle).toMatch(/Daniel/);
  });

  it("never assumes a mission end date for post-mission reconnects", () => {
    const plan = planFollowUps(
      ctx({
        thankYouAlreadySent: true,
        mission: { start: "2026-12-30", end: null, disclosure: "when_relevant" },
        summary: { ...emptySummary, reconnect_signals: [{ phrase: "reconnect after your mission", timeframe: "after_mission", date: null }] },
      }),
    );
    const r = plan.recommendations.find((x) => x.kind === "post_mission_reconnect")!;
    expect(r.due_date).toBeNull();
    expect(r.timing_note).toMatch(/return date/i);
  });

  it("schedules post-mission reconnects ~3 weeks after a known return date", () => {
    const plan = planFollowUps(
      ctx({
        thankYouAlreadySent: true,
        mission: { start: "2026-12-30", end: "2028-12-15", disclosure: "when_relevant" },
        summary: { ...emptySummary, reconnect_signals: [{ phrase: "after your mission", timeframe: "after_mission", date: null }] },
      }),
    );
    expect(plan.recommendations.find((x) => x.kind === "post_mission_reconnect")!.due_date).toBe("2029-01-05");
  });

  it("moves non-urgent reminders out of the mission window", () => {
    const plan = planFollowUps(
      ctx({
        today: "2026-12-20",
        meetingDate: "2026-12-20",
        thankYouAlreadySent: true,
        mission: { start: "2026-12-30", end: "2028-12-15", disclosure: "when_relevant" },
        summary: { ...emptySummary, resources: [{ name: "The Goal", kind: "book", note: "" }] },
      }),
    );
    const r = plan.recommendations.find((x) => x.kind === "resource_followup")!;
    expect(r.due_date).toBe("2028-12-29");
    expect(r.timing_note).toMatch(/after you return/i);
  });

  it("pulls urgent tasks before the mission starts", () => {
    const plan = planFollowUps(
      ctx({
        today: "2026-12-20",
        meetingDate: "2026-12-20",
        thankYouAlreadySent: true,
        mission: { start: "2026-12-30", end: null, disclosure: "when_relevant" },
        summary: { ...emptySummary, action_items: [{ owner: "me", description: "Send article", due_hint: "next week" }] },
      }),
    );
    expect(plan.recommendations[0].due_date).toBe("2026-12-28");
  });

  it("offers an optional pre-mission note only for relationships with substance", () => {
    const base = { thankYouAlreadySent: true, mission: { start: "2026-12-30", end: null, disclosure: "when_relevant" as const } };
    expect(planFollowUps(ctx(base)).recommendations).toHaveLength(0);
    const warm = planFollowUps(ctx({ ...base, summary: { ...emptySummary, offered_further_help: true } }));
    expect(warm.recommendations[0]).toMatchObject({ kind: "pre_mission_update", due_date: "2026-12-16", confidence: "low" });
  });

  it("respects the user's choice to never mention the mission", () => {
    const plan = planFollowUps(
      ctx({
        thankYouAlreadySent: true,
        mission: { start: "2026-12-30", end: null, disclosure: "never" },
        summary: { ...emptySummary, offered_further_help: true },
      }),
    );
    expect(plan.recommendations.some((r) => r.kind === "pre_mission_update")).toBe(false);
  });

  it("spaces non-urgent messages at least two weeks after the last one", () => {
    const plan = planFollowUps(
      ctx({
        thankYouAlreadySent: true,
        lastOutboundDate: "2026-10-20",
        summary: {
          ...emptySummary,
          reconnect_signals: [{ phrase: "check back next week", timeframe: "specific_date", date: "2026-10-25" }],
        },
      }),
    );
    expect(plan.recommendations[0].kind).toBe("reconnect");
    expect(plan.recommendations[0].due_date).toBe("2026-11-03"); // moved from Oct 25
    expect(plan.recommendations[0].timing_note).toMatch(/two weeks/);
  });

  it("does not recreate recommendations that already exist (even dismissed ones)", () => {
    const plan = planFollowUps(ctx({ existingRuleKeys: new Set(["thank_you:m1"]) }));
    expect(plan.recommendations).toHaveLength(0);
  });

  it("parses loose timing phrases", () => {
    const c = { today: "2026-10-22", mission: { start: "2026-12-30", end: null, disclosure: "when_relevant" as const } };
    expect(dueFromHint("tomorrow", c)).toBe("2026-10-23");
    expect(dueFromHint("next week", c)).toBe("2026-11-01");
    expect(dueFromHint("before my mission", c)).toBe("2026-12-23");
    expect(dueFromHint(null, c)).toBe("2026-10-29");
  });
});

describe("follow-up dashboard buckets", () => {
  const task = (id: string, due: string | null, status: FollowUpTask["status"] = "suggested") =>
    ({ id, due_date: due, status, completed_at: status === "completed" ? "2026-10-20T00:00:00Z" : null }) as FollowUpTask;

  it("groups into overdue / this week / upcoming / completed and hides dismissed", () => {
    const b = bucketFollowUps(
      [
        task("over", "2026-10-20"),
        task("today", "2026-10-22"),
        task("week", "2026-10-28"),
        task("later", "2026-11-15"),
        task("undated", null),
        task("done", "2026-10-01", "completed"),
        task("gone", "2026-10-21", "dismissed"),
      ],
      "2026-10-22",
    );
    expect(b.overdue.map((t) => t.id)).toEqual(["over"]);
    expect(b.thisWeek.map((t) => t.id)).toEqual(["today", "week"]);
    expect(b.upcoming.map((t) => t.id)).toEqual(["later", "undated"]);
    expect(b.completed.map((t) => t.id)).toEqual(["done"]);
  });
});
