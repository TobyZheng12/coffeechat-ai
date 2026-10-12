import { isISODate } from "@/lib/domain/dates";
import { isGrounded, mentions, normalizeForMatch } from "./safety";
import type { ContactAnalysisAI, NotesAI, QuestionAI, ScriptAI } from "./schemas";

/**
 * Post-processing that runs on EVERY AI response before it's saved.
 * The rule is simple: anything presented as a fact about a real person must be
 * traceable to text the user actually pasted. Unsupported claims are removed.
 */

export interface SourceText {
  linkedin: string;
  email: string;
  notes: string;
}

const STOPWORDS = new Set(
  "about after again also because been before being from have into just like more most much need only other really said should some than that their them then there these they this very want were what when where which while will with would your".split(
    " ",
  ),
);

/** At least half of the meaningful words of `text` appear in the sources. */
export function looselySupported(text: string, sources: string): boolean {
  const words = normalizeForMatch(text)
    .split(" ")
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  if (words.length === 0) return true;
  const hay = ` ${normalizeForMatch(sources)} `;
  const hits = words.filter((w) => hay.includes(w.slice(0, Math.max(4, w.length - 2)))).length;
  return hits / words.length >= 0.5;
}

export function groundAnalysis(ai: ContactAnalysisAI, src: SourceText): { value: ContactAnalysisAI; removed: number } {
  const all = [src.linkedin, src.email, src.notes];
  let removed = 0;
  const keep = <T>(items: T[], ok: (t: T) => boolean) =>
    items.filter((t) => {
      const pass = ok(t);
      if (!pass) removed++;
      return pass;
    });
  const value: ContactAnalysisAI = {
    ...ai,
    extracted: {
      ...ai.extracted,
      current_company: ai.extracted.current_company && mentions(ai.extracted.current_company, all) ? ai.extracted.current_company : "",
      experiences: keep(ai.extracted.experiences, (e) => mentions(e.organization, all)),
      education: keep(ai.extracted.education, (e) => mentions(e.organization, all)),
    },
    shared_interests: keep(ai.shared_interests, (p) => isGrounded(p.evidence, all)),
    connections_to_me: keep(ai.connections_to_me, (p) => isGrounded(p.evidence, all)),
  };
  return { value, removed };
}

export function groundQuestion(q: QuestionAI, src: SourceText): QuestionAI {
  const bySource = { linkedin: src.linkedin, email: src.email, notes: src.notes };
  const evidence = q.evidence.filter((e) => isGrounded(e.quote, bySource[e.source] || "") || isGrounded(e.quote, Object.values(bySource)));
  return {
    ...q,
    priority: Math.min(3, Math.max(1, Math.round(q.priority))) as 1 | 2 | 3,
    evidence,
  };
}

export function groundScript(ai: ScriptAI, src: SourceText): ScriptAI {
  // Drop exact-duplicate questions (case/punctuation-insensitive).
  const seen = new Set<string>();
  const questions = ai.questions
    .map((q) => groundQuestion(q, src))
    .filter((q) => {
      const k = normalizeForMatch(q.question);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const objectives = ai.objectives.filter(Boolean).slice(0, 3);
  return { ...ai, objectives, questions };
}

export function groundNotes(ai: NotesAI, notes: string): { value: NotesAI; removed: number } {
  let removed = 0;
  const keep = <T>(items: T[], ok: (t: T) => boolean) =>
    items.filter((t) => {
      const pass = ok(t);
      if (!pass) removed++;
      return pass;
    });
  const value: NotesAI = {
    ...ai,
    advice: keep(ai.advice, (a) => isGrounded(a.source_quote, notes) || looselySupported(a.advice, notes)),
    resources: keep(ai.resources, (r) => looselySupported(r.name, notes)),
    introductions_offered: keep(ai.introductions_offered, (i) => looselySupported(i.person_or_role, notes) || /introduc|connect/i.test(notes)),
    action_items: keep(ai.action_items, (a) => looselySupported(a.description, notes)),
    reconnect_signals: keep(ai.reconnect_signals, (r) => isGrounded(r.phrase, notes) || looselySupported(r.phrase, notes)).map(
      (r) => ({ ...r, date: r.date && isISODate(r.date) ? r.date : null }),
    ),
    relationship_insights: keep(ai.relationship_insights, (i) => looselySupported(i, notes)),
  };
  return { value, removed };
}
