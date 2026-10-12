import { z } from "zod";

/**
 * Zod schemas for every structured AI output.
 *
 * They serve two purposes:
 *  1. They are converted to JSON Schema and sent to Claude as the required
 *     output format (structured outputs), so responses are always well-formed.
 *  2. Every response — from Claude *or* the offline mock — is re-validated
 *     against them before anything is stored.
 *
 * Fields use `.nullable()` instead of `.optional()` because structured outputs
 * require every property to be present.
 */

const text = z.string();

// --- Contact analysis -------------------------------------------------------

export const ExperienceAI = z.object({
  organization: text.describe("Company or school name, exactly as written in the profile"),
  title: text.describe("Role title, or degree and field for education"),
  start_label: text.describe("Start as written, e.g. 'Jun 2019'. Empty string if unknown."),
  end_label: text.describe("End as written, e.g. 'Present'. Empty string if unknown."),
  description: text.describe("One short sentence, only from the profile. Empty string if none."),
});

const PointWithEvidence = z.object({
  point: text,
  evidence: text.describe("Short verbatim quote from the provided material that supports the point"),
});

export const ContactAnalysisAI = z.object({
  extracted: z.object({
    current_company: text.describe("Empty string if not stated"),
    current_position: text.describe("Empty string if not stated"),
    location: text.describe("Empty string if not stated"),
    industry: text.describe("Short industry label inferred only from the profile, or empty"),
    experiences: z.array(ExperienceAI).describe("Work history, most recent first"),
    education: z.array(ExperienceAI),
  }),
  headline_summary: text.describe("One or two sentences: who this person is professionally"),
  career_progression: text.describe("A short narrative of how their career developed"),
  career_transitions: z.array(text).describe("Notable moves between companies, industries, or functions"),
  shared_interests: z.array(PointWithEvidence),
  connections_to_me: z
    .array(PointWithEvidence)
    .describe("Specific overlaps with the student's background, school, employers, or goals"),
  topics_to_explore: z.array(text),
  recruiting_insights_to_ask: z.array(text).describe("Recruiting-related things this person could speak to"),
  missing_information: z.array(text).describe("Useful details not present in the material"),
});
export type ContactAnalysisAI = z.infer<typeof ContactAnalysisAI>;

// --- Interview script -------------------------------------------------------

export const SectionEnum = z.enum(["career_journey", "deep_dive", "career_advice", "closing"]);

export const EvidenceAI = z.object({
  quote: text.describe("Verbatim fragment (under 20 words) from the LinkedIn profile, email, or notes"),
  source: z.enum(["linkedin", "email", "notes"]),
});

export const QuestionAI = z.object({
  section: SectionEnum,
  question: text.describe("Natural, spoken-style question the student will read aloud"),
  short_version: text.describe("Under 10 words, for the cheat sheet"),
  why_relevant: text.describe("One sentence: why this question matters for this person and the student"),
  follow_up: text.describe("One optional follow-up question"),
  priority: z.number().int().describe("1 = must ask, 2 = ask if time, 3 = nice to have"),
  evidence: z.array(EvidenceAI).describe("Supporting quotes. Empty array for general questions."),
  include_in_short_call: z.boolean().describe("True if this belongs in a 15-minute version of the call"),
  is_alternate: z.boolean().describe("True for backup questions that only appear in the question bank"),
});
export type QuestionAI = z.infer<typeof QuestionAI>;

export const ScriptAI = z.object({
  objectives: z.array(text).describe("Exactly three conversation objectives"),
  greeting: text,
  why_connect: text.describe("Personalized reason for reaching out to this specific person"),
  self_intro: text.describe("A natural 20–30 second introduction (55–80 words)"),
  transition_to_questions: text,
  questions: z.array(QuestionAI),
  closing_thanks: text,
  referral_question: text
    .nullable()
    .describe("Optional 'anyone else I should talk to' question, or null if it would feel forced"),
  closing_reminder: text.describe("A short reminder for the student about how to end the call well"),
});
export type ScriptAI = z.infer<typeof ScriptAI>;

// --- Meeting notes → insights ---------------------------------------------

export const NotesAI = z.object({
  summary: text.describe("3–5 sentence summary of the conversation"),
  key_points: z.array(text),
  advice: z.array(
    z.object({
      advice: text,
      topic: text.describe("Short topic label, e.g. 'case interviews', 'recruiting timeline'"),
      source_quote: text.describe("Verbatim fragment from the notes"),
    }),
  ),
  action_items: z.array(
    z.object({
      owner: z.enum(["me", "them"]).describe("'me' = the student; 'them' = the contact"),
      description: text,
      due_hint: text.nullable().describe("Timing words from the notes, e.g. 'next week', or null"),
    }),
  ),
  relationship_insights: z
    .array(text)
    .describe("Personal details the contact voluntarily shared that are worth remembering"),
  resources: z.array(
    z.object({
      name: text,
      kind: z.enum(["book", "course", "article", "podcast", "skill", "event", "other"]),
      note: text,
    }),
  ),
  introductions_offered: z.array(z.object({ person_or_role: text, note: text })),
  reconnect_signals: z.array(
    z.object({
      phrase: text.describe("Verbatim fragment from the notes"),
      timeframe: z.enum(["after_mission", "after_recruiting", "after_resource", "specific_date", "general"]),
      date: text.nullable().describe("YYYY-MM-DD if a specific date can be resolved, otherwise null"),
    }),
  ),
  offered_further_help: z.boolean(),
  topics: z.array(text),
});
export type NotesAI = z.infer<typeof NotesAI>;

// --- Message drafts ---------------------------------------------------------

export const DraftAI = z.object({
  subject: text.describe("Email subject line. Empty string for LinkedIn messages."),
  body: text,
  details_used: z.array(text).describe("The specific conversation details referenced in the message"),
});
export type DraftAI = z.infer<typeof DraftAI>;

// --- Knowledge base ---------------------------------------------------------

export const KnowledgeAI = z.object({
  answer: text.describe("Answer built only from the provided notes. Say plainly when notes don't cover it."),
  cited_source_ids: z.array(text).describe("IDs of the sources the answer relies on"),
  found_relevant_notes: z.boolean(),
});
export type KnowledgeAI = z.infer<typeof KnowledgeAI>;
