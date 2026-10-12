import { z } from "zod";
import { groundAnalysis } from "@/lib/ai/grounding";
import { AIError } from "@/lib/ai/provider";
import type { Contact, ContactExperienceInput, ContactInput, MeetingMedium, UUID } from "@/lib/domain/types";
import { NotFoundError } from "@/lib/data/repository";
import { type AppContext, loadProfile, nowOf, runAI } from "./context";
import { generateScript } from "./scripts";

const longText = (max: number) => z.string().trim().max(max).default("");

/** Validation for the "Prepare New Coffee Chat" form. All pasted text is untrusted. */
export const PrepareSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(200),
  linkedin_url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\//i.test(v), "Must be a linkedin.com URL")
    .default(""),
  current_company: longText(200),
  current_position: longText(200),
  how_connected: longText(500),
  linkedin_profile_text: longText(60000),
  linkedin_experience_text: longText(60000),
  linkedin_education_text: longText(20000),
  email_thread_text: longText(60000),
  personal_notes: longText(20000),
  scheduled_at: z
    .string()
    .trim()
    .default("")
    .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "Invalid date"),
  duration_minutes: z.coerce.number().int().min(5).max(240).default(30),
  medium: z.enum(["zoom", "phone", "in_person", "other"]).default("zoom"),
  focus: longText(2000),
  generate: z.boolean().default(true),
});
export type PrepareInput = z.input<typeof PrepareSchema>;

export interface PrepareResult {
  contactId: UUID;
  meetingId: UUID;
  /** User-safe message when AI generation failed; records are still saved. */
  aiError: string | null;
}

/**
 * The primary workflow: create contact → (optional) meeting → AI analysis →
 * personalized script. Data is saved first, so an AI failure never loses
 * what the user pasted; they can retry generation from the meeting page.
 */
export async function prepareCoffeeChat(ctx: AppContext, raw: PrepareInput): Promise<PrepareResult> {
  const input = PrepareSchema.parse(raw);
  const contactInput: ContactInput = {
    full_name: input.full_name,
    linkedin_url: input.linkedin_url,
    current_company: input.current_company,
    current_position: input.current_position,
    location: "",
    industry: "",
    how_connected: input.how_connected,
    linkedin_profile_text: input.linkedin_profile_text,
    linkedin_experience_text: input.linkedin_experience_text,
    linkedin_education_text: input.linkedin_education_text,
    email_thread_text: input.email_thread_text,
    personal_notes: input.personal_notes,
    tags: [],
  };
  const contact = await ctx.repo.createContact(contactInput);
  const now = nowOf(ctx).toISOString();
  await ctx.repo.addInteraction({
    contact_id: contact.id,
    meeting_id: null,
    kind: "contact_created",
    occurred_at: now,
    summary: input.how_connected ? `Added to network (${input.how_connected})` : "Added to network",
  });

  const scheduledAt = input.scheduled_at ? new Date(input.scheduled_at).toISOString() : null;
  const meeting = await ctx.repo.createMeeting({
    contact_id: contact.id,
    title: `Coffee chat with ${input.full_name}`,
    scheduled_at: scheduledAt,
    duration_minutes: input.duration_minutes,
    medium: input.medium as MeetingMedium,
  });
  if (scheduledAt) {
    await ctx.repo.addInteraction({
      contact_id: contact.id,
      meeting_id: meeting.id,
      kind: "meeting_scheduled",
      occurred_at: now,
      summary: `${input.duration_minutes}-minute ${input.medium === "in_person" ? "meeting" : "call"} scheduled`,
    });
  }

  let aiError: string | null = null;
  if (input.generate) {
    try {
      await analyzeContact(ctx, contact.id);
      await generateScript(ctx, meeting.id, { focus: input.focus });
    } catch (err) {
      if (!(err instanceof AIError)) throw err;
      aiError = err.message;
    }
  }
  return { contactId: contact.id, meetingId: meeting.id, aiError };
}

/** Runs AI analysis and stores grounded results in editable fields. */
export async function analyzeContact(ctx: AppContext, contactId: UUID): Promise<Contact> {
  const contact = await ctx.repo.getContact(contactId);
  if (!contact) throw new NotFoundError("Contact");
  const profile = await loadProfile(ctx);

  const ai = await runAI(ctx, "analyze_contact", { profile, contact });
  const { value } = groundAnalysis(ai, {
    linkedin: [contact.linkedin_profile_text, contact.linkedin_experience_text, contact.linkedin_education_text].join("\n"),
    email: contact.email_thread_text,
    notes: contact.personal_notes,
  });

  // Never overwrite details the user typed; only fill blanks.
  const patch: Partial<Contact> = {
    analysis: {
      headline_summary: value.headline_summary,
      career_progression: value.career_progression,
      career_transitions: value.career_transitions,
      shared_interests: value.shared_interests,
      connections_to_me: value.connections_to_me,
      topics_to_explore: value.topics_to_explore,
      recruiting_insights_to_ask: value.recruiting_insights_to_ask,
      missing_information: value.missing_information,
      generated_by: ctx.ai.label,
    },
    analysis_generated_at: nowOf(ctx).toISOString(),
  };
  if (!contact.current_company && value.extracted.current_company) patch.current_company = value.extracted.current_company;
  if (!contact.current_position && value.extracted.current_position) patch.current_position = value.extracted.current_position;
  if (!contact.location && value.extracted.location) patch.location = value.extracted.location;
  if (!contact.industry && value.extracted.industry) patch.industry = value.extracted.industry;

  const existing = await ctx.repo.listExperiences(contactId);
  const manual: ContactExperienceInput[] = existing
    .filter((e) => e.source === "manual")
    .map(({ kind, organization, title, start_label, end_label, description, source }) => ({
      kind,
      organization,
      title,
      start_label,
      end_label,
      description,
      source,
    }));
  const generated: ContactExperienceInput[] = [
    ...value.extracted.experiences.map((e) => ({ ...e, kind: "work" as const, source: "ai" as const })),
    ...value.extracted.education.map((e) => ({ ...e, kind: "education" as const, source: "ai" as const })),
  ];
  await ctx.repo.replaceExperiences(contactId, [...manual, ...generated]);

  const updated = await ctx.repo.updateContact(contactId, patch);
  if (!updated) throw new NotFoundError("Contact");
  return updated;
}

export const ContactUpdateSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  linkedin_url: PrepareSchema.shape.linkedin_url,
  current_company: longText(200),
  current_position: longText(200),
  location: longText(200),
  industry: longText(200),
  how_connected: longText(500),
  linkedin_profile_text: longText(60000),
  linkedin_experience_text: longText(60000),
  linkedin_education_text: longText(20000),
  email_thread_text: longText(60000),
  personal_notes: longText(20000),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export async function updateContactDetails(ctx: AppContext, contactId: UUID, raw: z.input<typeof ContactUpdateSchema>) {
  const input = ContactUpdateSchema.parse(raw);
  const updated = await ctx.repo.updateContact(contactId, input);
  if (!updated) throw new NotFoundError("Contact");
  return updated;
}

export const ExperienceSchema = z.object({
  kind: z.enum(["work", "education"]),
  organization: z.string().trim().max(200),
  title: z.string().trim().max(200),
  start_label: z.string().trim().max(40).default(""),
  end_label: z.string().trim().max(40).default(""),
  description: z.string().trim().max(1000).default(""),
});

/** Saves the user's edited experience list; edited rows become "manual" and survive re-analysis. */
export async function saveExperiences(ctx: AppContext, contactId: UUID, raw: z.input<typeof ExperienceSchema>[]) {
  const items = z.array(ExperienceSchema).max(40).parse(raw);
  return ctx.repo.replaceExperiences(
    contactId,
    items.filter((i) => i.organization || i.title).map((i) => ({ ...i, source: "manual" as const })),
  );
}

/** Records a manual relationship event, e.g. "They replied to my email". */
export const InteractionSchema = z.object({
  kind: z.enum(["outreach_sent", "reply_received", "message_sent", "note"]),
  occurred_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date"),
  summary: z.string().trim().min(1).max(1000),
});

export async function logInteraction(ctx: AppContext, contactId: UUID, raw: z.input<typeof InteractionSchema>) {
  const input = InteractionSchema.parse(raw);
  return ctx.repo.addInteraction({
    contact_id: contactId,
    meeting_id: null,
    kind: input.kind,
    occurred_at: new Date(input.occurred_at).toISOString(),
    summary: input.summary,
  });
}
