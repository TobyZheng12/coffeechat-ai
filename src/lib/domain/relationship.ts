import { diffDays } from "./dates";
import type { Interaction, ISODate, Meeting } from "./types";

export type RelationshipStrength = "new" | "developing" | "warm";

/**
 * A deliberately simple, explainable score. It counts real two-way
 * interactions only — sending more messages never makes a relationship
 * "stronger" by itself.
 */
export function relationshipStrength(input: {
  meetings: Pick<Meeting, "status">[];
  interactions: Pick<Interaction, "kind" | "occurred_at">[];
}): RelationshipStrength {
  const completedMeetings = input.meetings.filter((m) => m.status === "completed").length;
  const replies = input.interactions.filter((i) => i.kind === "reply_received").length;
  const score = completedMeetings * 2 + replies;
  if (score >= 5 || completedMeetings >= 2) return "warm";
  if (score >= 2) return "developing";
  return "new";
}

export function lastContactDate(
  interactions: Pick<Interaction, "kind" | "occurred_at">[],
): string | null {
  const meaningful = interactions.filter((i) => i.kind !== "contact_created" && i.kind !== "note");
  if (meaningful.length === 0) return null;
  return meaningful.map((i) => i.occurred_at).sort().at(-1) ?? null;
}

export function daysSince(dateISO: string | null, today: ISODate): number | null {
  if (!dateISO) return null;
  return diffDays(today, dateISO.slice(0, 10));
}
