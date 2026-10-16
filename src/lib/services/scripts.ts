import { z } from "zod";
import { groundQuestion, groundScript, type SourceText } from "@/lib/ai/grounding";
import type { GenerateScriptInput } from "@/lib/ai/tasks";
import { dateOf } from "@/lib/domain/dates";
import { type Contact, type MeetingQuestion, type MeetingScript, SCRIPT_TEXT_FIELDS, type UUID } from "@/lib/domain/types";
import { composeIntroduction, spokenTextIssues } from "@/lib/profile/introduction";
import { normalizeProfile } from "@/lib/profile/normalize";
import { NotFoundError } from "@/lib/data/repository";
import { type AppContext, loadProfile, nowOf, runAI, todayFor } from "./context";

function sourcesOf(contact: Contact): SourceText {
  return {
    linkedin: [contact.linkedin_profile_text, contact.linkedin_experience_text, contact.linkedin_education_text].join("\n"),
    email: contact.email_thread_text,
    notes: contact.personal_notes,
  };
}

async function scriptInput(ctx: AppContext, meetingId: UUID, focus = ""): Promise<GenerateScriptInput & { contactRow: Contact }> {
  const meeting = await ctx.repo.getMeeting(meetingId);
  if (!meeting) throw new NotFoundError("Meeting");
  const contact = await ctx.repo.getContact(meeting.contact_id);
  if (!contact) throw new NotFoundError("Contact");
  const profile = await loadProfile(ctx);
  const [experiences, summaries, meetings] = await Promise.all([
    ctx.repo.listExperiences(contact.id),
    ctx.repo.listSummaries({ contactId: contact.id }),
    ctx.repo.listMeetings({ contactId: contact.id }),
  ]);
  const dateById = new Map(meetings.map((m) => [m.id, m.completed_at ?? m.scheduled_at ?? m.created_at]));
  const priorMeetings = summaries
    .filter((s) => s.meeting_id !== meetingId)
    .map((s) => ({ date: dateOf(dateById.get(s.meeting_id) ?? s.created_at, profile.timezone), summary: s.summary }));
  return {
    profile,
    today: todayFor(ctx, profile),
    contact,
    contactRow: contact,
    experiences,
    durationMinutes: meeting.duration_minutes,
    priorMeetings,
    focus,
  };
}

/**
 * Generates (or regenerates) the interview script.
 * - Your own spoken introduction (Profile → "My spoken introduction") always wins.
 * - Whatever the provider wrote (Claude or offline templates) is validated; an
 *   introduction with pasted-profile artifacts, or one that copies your
 *   Background verbatim, is replaced by one composed from verified facts.
 * - Text you edited and questions you edited/added are kept unless
 *   `replaceEdited` is set.
 */
export async function generateScript(ctx: AppContext, meetingId: UUID, opts: { focus?: string; replaceEdited?: boolean } = {}) {
  const input = await scriptInput(ctx, meetingId, opts.focus ?? "");
  const ai = await runAI(ctx, "generate_script", input);
  const grounded = groundScript(ai, sourcesOf(input.contactRow));
  const { profile, contactRow: contact } = input;

  const composed = composeIntroduction(
    normalizeProfile(profile),
    profile,
    { company: contact.current_company, title: contact.current_position, industry: contact.industry, text: sourcesOf(contact).linkedin },
    input.today,
  );
  const review = [...composed.warnings];
  let selfIntro = grounded.self_intro;
  let introOrigin: MeetingScript["intro_origin"] = "generated";
  if (composed.origin === "yours") {
    selfIntro = composed.text;
    introOrigin = "yours";
  } else {
    const issues = spokenTextIssues(selfIntro, [profile.background], 80);
    if (issues.length) {
      selfIntro = composed.text;
      introOrigin = "fallback";
      if (!ctx.ai.offline) review.push(`The AI's introduction ${issues[0]}, so one built from your verified profile facts was used instead.`);
    }
  }
  for (const q of grounded.questions) {
    const issues = spokenTextIssues(q.question, [profile.background], 60);
    if (issues.length) review.push(`Check this question — it ${issues[0]}: “${q.question.slice(0, 80)}”`);
  }

  const fresh: MeetingScript = {
    objectives: grounded.objectives,
    greeting: grounded.greeting,
    why_connect: grounded.why_connect,
    self_intro: selfIntro,
    transition_to_questions: grounded.transition_to_questions,
    closing_thanks: grounded.closing_thanks,
    referral_question: grounded.referral_question,
    closing_reminder: grounded.closing_reminder,
    generated_by: ctx.ai.label,
    intro_origin: introOrigin,
    review_notes: Array.from(new Set(review)),
    edited_fields: [],
  };

  // Keep what you edited by hand.
  const previous = (await ctx.repo.getMeeting(meetingId))?.script;
  const keep = opts.replaceEdited ? [] : (previous?.edited_fields ?? []);
  const script: MeetingScript = { ...fresh };
  for (const field of keep) {
    (script as unknown as Record<string, unknown>)[field] = previous![field];
  }
  script.edited_fields = keep;
  if (keep.includes("self_intro")) script.intro_origin = previous?.intro_origin ?? "generated";

  await ctx.repo.updateMeeting(meetingId, { script, script_generated_at: nowOf(ctx).toISOString() });

  const order = { career_journey: 0, deep_dive: 1, career_advice: 2, closing: 3 } as const;
  const questions = [...grounded.questions].sort(
    (a, b) => Number(a.is_alternate) - Number(b.is_alternate) || order[a.section] - order[b.section],
  );
  return ctx.repo.replaceGeneratedQuestions(
    meetingId,
    questions.map((q) => ({ ...q, priority: q.priority as 1 | 2 | 3 })),
    { includeEdited: !!opts.replaceEdited },
  );
}

/** Asks the AI for a better version of a single question. */
export async function regenerateQuestion(ctx: AppContext, questionId: UUID, instruction: string) {
  const all = await findQuestion(ctx, questionId);
  const { question, siblings, meetingId } = all;
  const input = await scriptInput(ctx, meetingId);
  const ai = await runAI(ctx, "regenerate_question", {
    ...input,
    current: {
      section: question.section,
      question: question.question,
      short_version: question.short_version,
      why_relevant: question.why_relevant,
      follow_up: question.follow_up,
      priority: question.priority,
      evidence: question.evidence,
      include_in_short_call: question.include_in_short_call,
      is_alternate: question.is_alternate,
    },
    instruction: z.string().max(500).parse(instruction ?? ""),
    otherQuestions: siblings.filter((q) => q.id !== questionId).map((q) => q.question),
  });
  const g = groundQuestion(ai, sourcesOf(input.contactRow));
  return ctx.repo.updateQuestion(questionId, {
    question: g.question,
    short_version: g.short_version,
    why_relevant: g.why_relevant,
    follow_up: g.follow_up,
    evidence: g.evidence,
    section: question.section,
    edited: false,
  });
}

async function findQuestion(ctx: AppContext, questionId: UUID) {
  const question = await ctx.repo.getQuestion(questionId);
  if (!question) throw new NotFoundError("Question");
  const siblings = await ctx.repo.listQuestions(question.meeting_id);
  return { question, siblings, meetingId: question.meeting_id };
}

export const QuestionEditSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  short_version: z.string().trim().max(200).default(""),
  follow_up: z.string().trim().max(1000).default(""),
  why_relevant: z.string().trim().max(1000).default(""),
  priority: z.coerce.number().int().min(1).max(3),
  section: z.enum(["career_journey", "deep_dive", "career_advice", "closing"]),
  include_in_short_call: z.boolean().default(false),
  is_alternate: z.boolean().default(false),
});

/** Saves a user edit. Edited questions are marked so regeneration won't replace them. */
export async function editQuestion(ctx: AppContext, questionId: UUID, raw: z.input<typeof QuestionEditSchema>) {
  const input = QuestionEditSchema.parse(raw);
  const q = await ctx.repo.updateQuestion(questionId, { ...input, priority: input.priority as 1 | 2 | 3, edited: true });
  if (!q) throw new NotFoundError("Question");
  return q;
}

export async function addCustomQuestion(ctx: AppContext, meetingId: UUID, raw: z.input<typeof QuestionEditSchema>) {
  const input = QuestionEditSchema.parse(raw);
  const q = await ctx.repo.addQuestion(meetingId, {
    ...input,
    short_version: input.short_version || input.question.split(" ").slice(0, 8).join(" "),
    priority: input.priority as 1 | 2 | 3,
    evidence: [],
  });
  if (!q) throw new NotFoundError("Meeting");
  return q;
}

export async function setQuestionAsked(ctx: AppContext, questionId: UUID, asked: boolean): Promise<MeetingQuestion> {
  const q = await ctx.repo.updateQuestion(questionId, { asked });
  if (!q) throw new NotFoundError("Question");
  return q;
}

export async function deleteQuestion(ctx: AppContext, questionId: UUID) {
  return ctx.repo.deleteQuestion(questionId);
}

export const ScriptEditSchema = z.object({
  greeting: z.string().trim().max(2000),
  why_connect: z.string().trim().max(2000),
  self_intro: z.string().trim().max(3000),
  transition_to_questions: z.string().trim().max(1000),
  closing_thanks: z.string().trim().max(2000),
  referral_question: z.string().trim().max(1000).nullable(),
  closing_reminder: z.string().trim().max(1000),
  objectives: z.array(z.string().trim().max(300)).max(5),
});

export async function editScript(ctx: AppContext, meetingId: UUID, raw: z.input<typeof ScriptEditSchema>) {
  const input = ScriptEditSchema.parse(raw);
  const meeting = await ctx.repo.getMeeting(meetingId);
  if (!meeting?.script) throw new NotFoundError("Script");
  const next = { ...input, referral_question: input.referral_question || null };
  // Remember which fields you changed so regeneration won't overwrite them.
  const changed = SCRIPT_TEXT_FIELDS.filter(
    (f) => JSON.stringify(next[f] ?? null) !== JSON.stringify(meeting.script![f] ?? null),
  );
  const edited = Array.from(new Set([...(meeting.script.edited_fields ?? []), ...changed]));
  return ctx.repo.updateMeeting(meetingId, {
    script: {
      ...meeting.script,
      ...next,
      edited_fields: edited,
    },
  });
}
