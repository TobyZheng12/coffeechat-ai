import { dateOf, diffDays, formatDate } from "@/lib/domain/dates";
import { isOpen } from "@/lib/domain/followups";
import { lastContactDate, relationshipStrength, type RelationshipStrength } from "@/lib/domain/relationship";
import type { ISODate } from "@/lib/domain/types";
import { type AppContext, loadProfile, todayFor } from "./context";

/**
 * "My Pre-Mission Networking Playbook".
 *
 * Compiled directly from saved records — no AI — so everything in it is
 * something you actually wrote down or decided. Designed to be read in two
 * years, when the details are long forgotten.
 */

export interface PlaybookPerson {
  contactId: string;
  name: string;
  role: string;
  company: string;
  howConnected: string;
  strength: RelationshipStrength;
  firstMet: ISODate | null;
  lastContact: ISODate | null;
  conversations: { date: ISODate; summary: string }[];
  advice: string[];
  worthRemembering: string[];
  openItems: string[];
  reconnect: { when: string; angle: string };
}

export interface Playbook {
  title: string;
  generatedOn: ISODate;
  owner: string;
  departure: ISODate | null;
  returnDate: ISODate | null;
  stats: { people: number; conversations: number; thankYous: number; insights: number };
  people: PlaybookPerson[];
  themes: { topic: string; items: { insight: string; by: string }[] }[];
  recruitingAdvice: { insight: string; by: string }[];
  beforeYouLeave: { title: string; who: string; due: ISODate | null; reason: string }[];
  afterYouReturn: { who: string; when: string; angle: string }[];
}

const RECRUITING = /recruit|case|interview|resume|network|application|internship|timeline|offer/i;

export async function buildPlaybook(ctx: AppContext): Promise<Playbook> {
  const profile = await loadProfile(ctx);
  const tz = profile.timezone;
  const today = todayFor(ctx, profile);
  const [contacts, meetings, summaries, insights, tasks, drafts, interactions] = await Promise.all([
    ctx.repo.listContacts(),
    ctx.repo.listMeetings(),
    ctx.repo.listSummaries({}),
    ctx.repo.listInsights(),
    ctx.repo.listFollowUps(),
    ctx.repo.listDrafts(),
    ctx.repo.listInteractions(),
  ]);
  const name = new Map(contacts.map((c) => [c.id, c.full_name]));
  const departure = profile.mission_start;
  const returnDate = profile.mission_end;

  const people: PlaybookPerson[] = contacts
    .map((c) => {
      const ms = meetings.filter((m) => m.contact_id === c.id);
      const done = ms.filter((m) => m.status === "completed");
      const ins = interactions.filter((i) => i.contact_id === c.id);
      const latest = new Map<string, (typeof summaries)[number]>();
      for (const s of summaries) if (s.contact_id === c.id && !latest.has(s.meeting_id)) latest.set(s.meeting_id, s);
      const sums = [...latest.values()];
      const open = tasks.filter((t) => t.contact_id === c.id && isOpen(t));
      const postTask = open.find((t) => t.kind === "post_mission_reconnect" || t.kind === "reconnect");
      const strength = relationshipStrength({ meetings: ms, interactions: ins });
      const lastDone = done.map((m) => m.completed_at ?? m.scheduled_at ?? "").sort().at(-1);
      const topTopic = sums.flatMap((s) => s.topics)[0];
      const last = lastContactDate(ins);

      return {
        contactId: c.id,
        name: c.full_name,
        role: c.current_position,
        company: c.current_company,
        howConnected: c.how_connected,
        strength,
        firstMet: done.length ? dateOf(done.map((m) => m.completed_at ?? m.created_at).sort()[0], tz) : null,
        lastContact: last ? dateOf(last, tz) : null,
        conversations: done
          .map((m) => ({
            date: dateOf(m.completed_at ?? m.scheduled_at ?? m.created_at, tz),
            summary: latest.get(m.id)?.summary ?? "No summary saved.",
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        advice: Array.from(new Set(sums.flatMap((s) => s.advice.map((a) => a.advice)))),
        worthRemembering: Array.from(new Set(sums.flatMap((s) => s.relationship_insights))),
        openItems: open.filter((t) => t.kind === "action_item" || t.kind === "intro_response").map((t) => t.title),
        reconnect: postTask
          ? {
              when: (postTask.due_date ? formatDate(postTask.due_date) : postTask.timing_note || "After you return").replace(/[.\s]+$/, ""),
              angle: postTask.message_angle,
            }
          : {
              when: done.length ? "After you return, once you're settled" : "When you're ready to reach out",
              angle: lastDone
                ? `Remind them of your conversation on ${formatDate(dateOf(lastDone, tz))}${topTopic ? ` about ${topTopic}` : ""}, share what you're focused on now, and ask one thoughtful question.`
                : "Introduce yourself and explain specifically why their path interests you.",
            },
      } satisfies PlaybookPerson;
    })
    .sort((a, b) => b.conversations.length - a.conversations.length || a.name.localeCompare(b.name));

  const themes = new Map<string, { insight: string; by: string }[]>();
  for (const i of insights) {
    if (!name.has(i.contact_id)) continue;
    const k = (i.topic || "general").toLowerCase();
    themes.set(k, [...(themes.get(k) ?? []), { insight: i.insight, by: name.get(i.contact_id)! }]);
  }

  const horizon = departure ?? null;
  const beforeYouLeave = tasks
    .filter((t) => isOpen(t) && name.has(t.contact_id) && t.kind !== "post_mission_reconnect")
    .filter((t) => (horizon ? !t.due_date || t.due_date < horizon : !t.due_date || diffDays(t.due_date, today) <= 30))
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
    .map((t) => ({ title: t.title, who: name.get(t.contact_id)!, due: t.due_date, reason: t.reason }));

  return {
    title: departure ? "My Pre-Mission Networking Playbook" : "My Networking Playbook",
    generatedOn: today,
    owner: profile.full_name || profile.preferred_name,
    departure,
    returnDate,
    stats: {
      people: contacts.length,
      conversations: meetings.filter((m) => m.status === "completed").length,
      thankYous: drafts.filter((d) => d.kind === "thank_you" && d.sent_at).length,
      insights: insights.length,
    },
    people,
    themes: Array.from(themes.entries())
      .map(([topic, items]) => ({ topic, items }))
      .sort((a, b) => b.items.length - a.items.length),
    recruitingAdvice: insights
      .filter((i) => name.has(i.contact_id) && RECRUITING.test(`${i.topic} ${i.insight}`))
      .map((i) => ({ insight: i.insight, by: name.get(i.contact_id)! })),
    beforeYouLeave,
    afterYouReturn: people
      .filter((p) => p.conversations.length > 0)
      .sort((a, b) => strengthRank(b.strength) - strengthRank(a.strength))
      .map((p) => ({ who: `${p.name}${p.company ? ` (${p.company})` : ""}`, when: p.reconnect.when, angle: p.reconnect.angle })),
  };
}

export function statsLine(p: Playbook, sep: string): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  return [
    n(p.stats.people, "person", "people"),
    n(p.stats.conversations, "conversation", "conversations"),
    n(p.stats.thankYous, "thank-you note sent", "thank-you notes sent"),
    n(p.stats.insights, "piece of advice", "pieces of advice"),
  ].join(sep);
}

function strengthRank(s: RelationshipStrength) {
  return s === "warm" ? 2 : s === "developing" ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

export function playbookToMarkdown(p: Playbook): string {
  const L: string[] = [];
  const list = (items: string[]) => items.forEach((i) => L.push(`- ${i}`));
  L.push(`# ${p.title}`, "");
  L.push(
    `${p.owner ? `**${p.owner}** · ` : ""}Generated ${formatDate(p.generatedOn)}${p.departure ? ` · Departure ${formatDate(p.departure)}` : ""}${p.returnDate ? ` · Return ${formatDate(p.returnDate)}` : ""}`,
    "",
  );
  L.push(statsLine(p, " · "), "");

  L.push("## Before you leave", "");
  if (p.beforeYouLeave.length) list(p.beforeYouLeave.map((t) => `[ ] ${t.title} — ${t.who}${t.due ? ` (by ${formatDate(t.due)})` : ""}`));
  else L.push("Nothing outstanding.");
  L.push("");

  L.push("## Reconnect after you return", "");
  if (p.afterYouReturn.length) list(p.afterYouReturn.map((r) => `**${r.who}** — ${r.when}. ${r.angle}`));
  else L.push("No conversations recorded yet.");
  L.push("");

  L.push("## Recruiting advice", "");
  if (p.recruitingAdvice.length) list(p.recruitingAdvice.map((a) => `${a.insight} — *${a.by}*`));
  else L.push("None recorded yet.");
  L.push("");

  L.push("## Career insights by theme", "");
  for (const t of p.themes) {
    L.push(`### ${capitalize(t.topic)}`, "");
    list(t.items.map((i) => `${i.insight} — *${i.by}*`));
    L.push("");
  }

  L.push("## People", "");
  for (const person of p.people) {
    L.push(`### ${person.name}`, "");
    L.push(`${[person.role, person.company].filter(Boolean).join(" at ") || "Role not recorded"}${person.howConnected ? ` · Connected via ${person.howConnected}` : ""}`, "");
    if (person.conversations.length) {
      L.push("**Conversations**", "");
      list(person.conversations.map((c) => `${formatDate(c.date)}: ${c.summary}`));
      L.push("");
    }
    if (person.advice.length) {
      L.push("**Their advice**", "");
      list(person.advice);
      L.push("");
    }
    if (person.worthRemembering.length) {
      L.push("**Worth remembering**", "");
      list(person.worthRemembering);
      L.push("");
    }
    if (person.openItems.length) {
      L.push("**Open items**", "");
      list(person.openItems);
      L.push("");
    }
    L.push(`**Reconnect:** ${person.reconnect.when}. ${person.reconnect.angle}`, "");
  }
  L.push("---", "*Compiled from your saved notes by CoffeeChat AI. Nothing in this document was generated beyond what you recorded.*");
  return L.join("\n");
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
