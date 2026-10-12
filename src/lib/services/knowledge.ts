import { z } from "zod";
import { dateOf } from "@/lib/domain/dates";
import type { UUID } from "@/lib/domain/types";
import { type AppContext, loadProfile, runAI } from "./context";

/**
 * Personal networking knowledge base.
 *
 * Retrieval is a small keyword ranker (BM25-style) over everything you've
 * saved: advice, raw notes, conversation summaries, and contact details.
 * It runs over the user's own records only (through the user-bound
 * repository), needs no embedding service, and is plenty for a personal
 * network of hundreds of conversations. The AI then answers ONLY from the
 * retrieved snippets and must cite them.
 */

export type SourceKind = "advice" | "notes" | "summary" | "contact";

export interface KnowledgeSource {
  id: string;
  kind: SourceKind;
  contactId: UUID;
  contactName: string;
  company: string;
  meetingId: UUID | null;
  date: string | null;
  text: string;
}

export interface Citation {
  id: string;
  kind: SourceKind;
  contactId: UUID;
  contactName: string;
  company: string;
  meetingId: UUID | null;
  date: string | null;
  snippet: string;
}

export interface KnowledgeAnswer {
  question: string;
  answer: string;
  found: boolean;
  citations: Citation[];
  /** Relevant snippets the answer didn't cite, for further reading. */
  related: Citation[];
  generatedBy: string;
}

// ---------------------------------------------------------------------------
// Text processing
// ---------------------------------------------------------------------------

const STOP = new Set(
  (
    "a an and are as at be been but by can could did do does for from had has have how i i've in into is it its me my of on or our " +
    "should so than that the their them there these they this to told tell us was we were what when where which who whom why will " +
    "with would you your about any anyone anything people person contacts contact spoken talked talk say said learn learned " +
    "remember know someone something employees employee recommend recommended advice give gave"
  ).split(" "),
);

const SUFFIXES = ["ments", "ment", "ings", "ing", "ants", "ant", "ers", "er", "ies", "ed", "s"];

export function stem(word: string): string {
  for (const suf of SUFFIXES) {
    if (word.endsWith(suf) && word.length - suf.length >= 4) {
      return suf === "ies" ? `${word.slice(0, -3)}y` : word.slice(0, -suf.length);
    }
  }
  return word;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}&]+/gu, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export async function collectSources(ctx: AppContext): Promise<KnowledgeSource[]> {
  const profile = await loadProfile(ctx);
  const [contacts, meetings, insights, summaries] = await Promise.all([
    ctx.repo.listContacts({ includeArchived: true }),
    ctx.repo.listMeetings(),
    ctx.repo.listInsights(),
    ctx.repo.listSummaries({}),
  ]);
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const meetingDate = new Map(
    meetings.map((m) => [m.id, dateOf(m.completed_at ?? m.scheduled_at ?? m.created_at, profile.timezone)]),
  );
  const out: KnowledgeSource[] = [];
  const base = (contactId: UUID) => {
    const c = byId.get(contactId);
    return { contactId, contactName: c?.full_name ?? "Unknown", company: c?.current_company ?? "" };
  };

  for (const c of contacts) {
    out.push({
      id: `contact:${c.id}`,
      kind: "contact",
      ...base(c.id),
      meetingId: null,
      date: null,
      text: [
        `${c.full_name}${c.current_position ? `, ${c.current_position}` : ""}${c.current_company ? ` at ${c.current_company}` : ""}.`,
        c.industry && `Industry: ${c.industry}.`,
        c.how_connected && `Connected via ${c.how_connected}.`,
        c.analysis?.headline_summary,
      ]
        .filter(Boolean)
        .join(" "),
    });
  }
  for (const i of insights) {
    if (!byId.has(i.contact_id)) continue;
    out.push({
      id: `advice:${i.id}`,
      kind: "advice",
      ...base(i.contact_id),
      meetingId: i.meeting_id,
      date: i.meeting_id ? (meetingDate.get(i.meeting_id) ?? null) : null,
      text: `${i.insight} (topic: ${i.topic})`,
    });
  }
  // Only the latest summary per meeting.
  const seen = new Set<string>();
  for (const s of summaries) {
    if (seen.has(s.meeting_id) || !byId.has(s.contact_id)) continue;
    seen.add(s.meeting_id);
    out.push({
      id: `summary:${s.id}`,
      kind: "summary",
      ...base(s.contact_id),
      meetingId: s.meeting_id,
      date: meetingDate.get(s.meeting_id) ?? null,
      text: [
        s.summary,
        ...s.key_points.filter((k) => !s.summary.includes(k)),
        ...s.resources.map((r) => `Recommended ${r.kind}: ${r.name}`),
      ].join(" "),
    });
  }
  for (const m of meetings) {
    if (!byId.has(m.contact_id)) continue;
    const notes = await ctx.repo.listNotes(m.id);
    for (const n of notes) {
      out.push({
        id: `notes:${n.id}`,
        kind: "notes",
        ...base(m.contact_id),
        meetingId: m.id,
        date: meetingDate.get(m.id) ?? null,
        text: n.body,
      });
    }
  }
  return out;
}

/** BM25-style ranking with a boost for matching a contact's name or company. */
export function rankSources(sources: KnowledgeSource[], query: string, limit = 8): KnowledgeSource[] {
  const q = Array.from(new Set(tokenize(query)));
  if (q.length === 0) return [];
  const docs = sources.map((s) => {
    const tokens = tokenize(`${s.text} ${s.company}`);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { s, tf, len: tokens.length, who: new Set(tokenize(`${s.contactName} ${s.company}`)) };
  });
  const avg = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
  const df = new Map<string, number>();
  for (const t of q) df.set(t, docs.filter((d) => d.tf.has(t)).length);

  const k1 = 1.2;
  const b = 0.75;
  const scored = docs
    .map((d) => {
      let score = 0;
      for (const t of q) {
        const f = d.tf.get(t) ?? 0;
        if (f) {
          const idf = Math.log(1 + (docs.length - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
          score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / Math.max(1, avg))));
        }
        if (d.who.has(t)) score += 1.5;
      }
      // Prefer substantive sources (advice and notes) when scores tie.
      if (score > 0 && (d.s.kind === "advice" || d.s.kind === "notes")) score += 0.1;
      return { s: d.s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  // Keep variety: at most 3 sources per person.
  const perContact = new Map<string, number>();
  const result: KnowledgeSource[] = [];
  for (const { s } of scored) {
    const n = perContact.get(s.contactId) ?? 0;
    if (n >= 3) continue;
    perContact.set(s.contactId, n + 1);
    result.push(s);
    if (result.length >= limit) break;
  }
  return result;
}

function toCitation(s: KnowledgeSource): Citation {
  return {
    id: s.id,
    kind: s.kind,
    contactId: s.contactId,
    contactName: s.contactName,
    company: s.company,
    meetingId: s.meetingId,
    date: s.date,
    snippet: s.text.length > 280 ? `${s.text.slice(0, 279)}…` : s.text,
  };
}

export const QuestionSchema = z.string().trim().min(3, "Ask a slightly longer question").max(300);

export async function askKnowledge(ctx: AppContext, rawQuestion: string): Promise<KnowledgeAnswer> {
  const question = QuestionSchema.parse(rawQuestion);
  const hits = rankSources(await collectSources(ctx), question);
  if (hits.length === 0) {
    return {
      question,
      answer: "I couldn't find anything about that in your saved notes yet. Try different words, or add notes after your next conversation.",
      found: false,
      citations: [],
      related: [],
      generatedBy: "Search",
    };
  }
  // Short ids keep the prompt compact; we map them back afterwards.
  const short = hits.map((h, i) => ({ id: `S${i + 1}`, h }));
  const ai = await runAI(ctx, "answer_from_notes", {
    question,
    sources: short.map(({ id, h }) => ({
      id,
      label: `${h.contactName}${h.company ? ` (${h.company})` : ""} · ${h.kind}${h.date ? ` · ${h.date}` : ""}`,
      text: h.text,
    })),
  });
  const cited = new Set(ai.cited_source_ids.filter((id) => short.some((s) => s.id === id)));
  const citations = short.filter((s) => cited.has(s.id)).map((s) => toCitation(s.h));
  const related = short.filter((s) => !cited.has(s.id)).map((s) => toCitation(s.h));
  return {
    question,
    answer: ai.answer,
    found: ai.found_relevant_notes && citations.length > 0,
    citations,
    related,
    generatedBy: ctx.ai.label,
  };
}

/** Advice grouped by topic, for browsing. */
export async function insightsByTopic(ctx: AppContext) {
  const [insights, contacts] = await Promise.all([ctx.repo.listInsights(), ctx.repo.listContacts({ includeArchived: true })]);
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const groups = new Map<string, { topic: string; items: { id: string; insight: string; contactId: string; contactName: string; meetingId: string | null }[] }>();
  for (const i of insights) {
    const c = byId.get(i.contact_id);
    if (!c) continue;
    const key = (i.topic || "general").toLowerCase();
    const g = groups.get(key) ?? { topic: key, items: [] };
    g.items.push({ id: i.id, insight: i.insight, contactId: c.id, contactName: c.full_name, meetingId: i.meeting_id });
    groups.set(key, g);
  }
  return Array.from(groups.values()).sort((a, b) => b.items.length - a.items.length || a.topic.localeCompare(b.topic));
}
