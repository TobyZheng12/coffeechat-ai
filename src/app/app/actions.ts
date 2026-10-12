"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import { AIError } from "@/lib/ai/provider";
import { NotFoundError } from "@/lib/data/repository";
import type { MessageKind, MessageTone } from "@/lib/domain/types";
import {
  analyzeContact,
  logInteraction,
  prepareCoffeeChat,
  saveExperiences,
  updateContactDetails,
} from "@/lib/services/contacts";
import { discardDraft, generateDraft, markDraftSent, saveDraftEdits } from "@/lib/services/drafts";
import {
  acceptFollowUp,
  completeFollowUp,
  createManualFollowUp,
  dismissFollowUp,
  reopenFollowUp,
  rescheduleFollowUp,
  snoozeFollowUp,
} from "@/lib/services/followups";
import {
  cancelMeeting,
  markMeetingCompleted,
  processMeetingNotes,
  rescheduleMeeting,
  saveMeetingNotes,
  scheduleMeeting,
} from "@/lib/services/meetings";
import { saveProfile } from "@/lib/services/profile";
import {
  addCustomQuestion,
  deleteQuestion,
  editQuestion,
  editScript,
  generateScript,
  regenerateQuestion,
  setQuestionAsked,
} from "@/lib/services/scripts";
import { requireWorkspace, type Workspace } from "@/lib/workspace";

/**
 * Server Actions are public HTTP endpoints. Every action here:
 *   1. authenticates via requireWorkspace() (redirects if signed out),
 *   2. validates input with Zod inside the service,
 *   3. only touches data through the user-bound repository,
 *   4. returns a small, UI-safe result (never raw errors or other users' data).
 */

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

function messageFor(err: unknown): string {
  if (err instanceof AIError) return err.message;
  if (err instanceof ZodError) return err.issues[0]?.message ?? "Please check the form and try again.";
  if (err instanceof NotFoundError) return "This item no longer exists or you don't have access to it.";
  console.error("[action] unexpected error", err);
  return "Something went wrong. Please try again.";
}

async function run<T>(fn: (ws: Workspace) => Promise<T>): Promise<ActionResult<T>> {
  const ws = await requireWorkspace();
  try {
    const data = await fn(ws);
    revalidatePath("/app", "layout");
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
}

const id = z.string().uuid();
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function saveProfileAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return run(async (ws) => {
    await saveProfile(ws, {
      full_name: str(form, "full_name"),
      preferred_name: str(form, "preferred_name"),
      hometown: str(form, "hometown"),
      school: str(form, "school"),
      major: str(form, "major"),
      background: str(form, "background"),
      interests: str(form, "interests"),
      target_companies: str(form, "target_companies"),
      career_goals: str(form, "career_goals"),
      intro_pitch: str(form, "intro_pitch"),
      native_language: str(form, "native_language"),
      english_second_language: form.get("english_second_language") === "on",
      timezone: str(form, "timezone") || "America/Denver",
      mission_start: str(form, "mission_start"),
      mission_end: str(form, "mission_end"),
      mission_location: str(form, "mission_location"),
      mission_disclosure: str(form, "mission_disclosure") === "never" ? "never" : "when_relevant",
    });
    return null;
  });
}

// ---------------------------------------------------------------------------
// Prepare a coffee chat (primary workflow)
// ---------------------------------------------------------------------------

export async function prepareCoffeeChatAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await run((ws) =>
    prepareCoffeeChat(ws, {
      full_name: str(form, "full_name"),
      linkedin_url: str(form, "linkedin_url"),
      current_company: str(form, "current_company"),
      current_position: str(form, "current_position"),
      how_connected: str(form, "how_connected"),
      linkedin_profile_text: str(form, "linkedin_profile_text"),
      linkedin_experience_text: str(form, "linkedin_experience_text"),
      linkedin_education_text: str(form, "linkedin_education_text"),
      email_thread_text: str(form, "email_thread_text"),
      personal_notes: str(form, "personal_notes"),
      scheduled_at: str(form, "scheduled_at"),
      duration_minutes: str(form, "duration_minutes") || "30",
      medium: (str(form, "medium") || "zoom") as "zoom",
      focus: str(form, "focus"),
      generate: true,
    }),
  );
  if (!result.ok) return result;
  const q = result.data.aiError ? `?aiError=${encodeURIComponent(result.data.aiError)}` : "";
  redirect(`/app/meetings/${result.data.meetingId}${q}`);
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function updateContactAction(contactId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await run(async (ws) => {
    await updateContactDetails(ws, id.parse(contactId), {
      full_name: str(form, "full_name"),
      linkedin_url: str(form, "linkedin_url"),
      current_company: str(form, "current_company"),
      current_position: str(form, "current_position"),
      location: str(form, "location"),
      industry: str(form, "industry"),
      how_connected: str(form, "how_connected"),
      linkedin_profile_text: str(form, "linkedin_profile_text"),
      linkedin_experience_text: str(form, "linkedin_experience_text"),
      linkedin_education_text: str(form, "linkedin_education_text"),
      email_thread_text: str(form, "email_thread_text"),
      personal_notes: str(form, "personal_notes"),
      tags: str(form, "tags")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
    return null;
  });
  if (!result.ok) return result;
  redirect(`/app/contacts/${contactId}`);
}

export async function reanalyzeContactAction(contactId: string): Promise<ActionResult> {
  return run(async (ws) => {
    await analyzeContact(ws, id.parse(contactId));
    return null;
  });
}

export async function saveExperiencesAction(
  contactId: string,
  items: { kind: "work" | "education"; organization: string; title: string; start_label: string; end_label: string; description: string }[],
): Promise<ActionResult> {
  return run(async (ws) => {
    await saveExperiences(ws, id.parse(contactId), items);
    return null;
  });
}

export async function deleteContactAction(contactId: string): Promise<ActionResult> {
  const result = await run(async (ws) => {
    const ok = await ws.repo.deleteContact(id.parse(contactId));
    if (!ok) throw new NotFoundError("Contact");
    return null;
  });
  if (!result.ok) return result;
  redirect("/app/contacts");
}

export async function logInteractionAction(contactId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return run(async (ws) => {
    await logInteraction(ws, id.parse(contactId), {
      kind: str(form, "kind") as "note",
      occurred_at: str(form, "occurred_at") || new Date().toISOString(),
      summary: str(form, "summary"),
    });
    return null;
  });
}

// ---------------------------------------------------------------------------
// Meetings & scripts
// ---------------------------------------------------------------------------

export async function scheduleMeetingAction(contactId: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await run((ws) =>
    scheduleMeeting(ws, id.parse(contactId), {
      scheduled_at: str(form, "scheduled_at"),
      duration_minutes: str(form, "duration_minutes") || "30",
      medium: (str(form, "medium") || "zoom") as "zoom",
      focus: str(form, "focus"),
      generate: true,
    }),
  );
  if (!result.ok) return result;
  redirect(`/app/meetings/${result.data.id}`);
}

export async function generateScriptAction(meetingId: string, focus: string): Promise<ActionResult> {
  return run(async (ws) => {
    await generateScript(ws, id.parse(meetingId), { focus: z.string().max(2000).parse(focus ?? "") });
    return null;
  });
}

export async function regenerateQuestionAction(questionId: string, instruction: string): Promise<ActionResult> {
  return run(async (ws) => {
    await regenerateQuestion(ws, id.parse(questionId), instruction);
    return null;
  });
}

type QuestionForm = {
  question: string;
  short_version: string;
  follow_up: string;
  why_relevant: string;
  priority: number;
  section: "career_journey" | "deep_dive" | "career_advice" | "closing";
  include_in_short_call: boolean;
  is_alternate: boolean;
};

export async function editQuestionAction(questionId: string, input: QuestionForm): Promise<ActionResult> {
  return run(async (ws) => {
    await editQuestion(ws, id.parse(questionId), input);
    return null;
  });
}

export async function addQuestionAction(meetingId: string, input: QuestionForm): Promise<ActionResult> {
  return run(async (ws) => {
    await addCustomQuestion(ws, id.parse(meetingId), input);
    return null;
  });
}

export async function deleteQuestionAction(questionId: string): Promise<ActionResult> {
  return run(async (ws) => {
    await deleteQuestion(ws, id.parse(questionId));
    return null;
  });
}

export async function setAskedAction(questionId: string, asked: boolean): Promise<ActionResult> {
  return run(async (ws) => {
    await setQuestionAsked(ws, id.parse(questionId), z.boolean().parse(asked));
    return null;
  });
}

export async function editScriptAction(
  meetingId: string,
  input: {
    greeting: string;
    why_connect: string;
    self_intro: string;
    transition_to_questions: string;
    closing_thanks: string;
    referral_question: string | null;
    closing_reminder: string;
    objectives: string[];
  },
): Promise<ActionResult> {
  return run(async (ws) => {
    await editScript(ws, id.parse(meetingId), input);
    return null;
  });
}

export async function saveNotesAction(
  meetingId: string,
  _prev: ActionResult<{ created: number; notes: string[] }> | null,
  form: FormData,
): Promise<ActionResult<{ created: number; notes: string[] }>> {
  return run(async (ws) => {
    const r = await saveMeetingNotes(ws, id.parse(meetingId), {
      body: str(form, "body"),
      kind: str(form, "kind") === "live" ? "live" : "post_meeting",
      process: form.get("process") !== "off",
    });
    return { created: r.createdFollowUps.length, notes: r.planNotes };
  });
}

export async function reprocessNotesAction(meetingId: string): Promise<ActionResult<{ created: number }>> {
  return run(async (ws) => {
    const r = await processMeetingNotes(ws, id.parse(meetingId));
    return { created: r.createdFollowUps.length };
  });
}

export async function markMeetingCompletedAction(meetingId: string): Promise<ActionResult> {
  return run(async (ws) => {
    await markMeetingCompleted(ws, id.parse(meetingId));
    return null;
  });
}

export async function cancelMeetingAction(meetingId: string): Promise<ActionResult> {
  return run(async (ws) => {
    await cancelMeeting(ws, id.parse(meetingId));
    return null;
  });
}

export async function rescheduleMeetingAction(meetingId: string, scheduledAt: string, duration: number): Promise<ActionResult> {
  return run(async (ws) => {
    await rescheduleMeeting(ws, id.parse(meetingId), { scheduled_at: scheduledAt, duration_minutes: duration });
    return null;
  });
}

// ---------------------------------------------------------------------------
// Message drafts
// ---------------------------------------------------------------------------

export async function generateDraftAction(input: {
  contact_id: string;
  meeting_id: string | null;
  follow_up_task_id?: string | null;
  kind: MessageKind;
  tone: MessageTone;
  user_context?: string;
}): Promise<ActionResult<{ draftId: string; unverified: string[] }>> {
  return run(async (ws) => {
    const r = await generateDraft(ws, input);
    return { draftId: r.draft.id, unverified: r.unverifiedDetails };
  });
}

export async function saveDraftAction(draftId: string, subject: string, body: string): Promise<ActionResult> {
  return run(async (ws) => {
    await saveDraftEdits(ws, id.parse(draftId), { subject, body });
    return null;
  });
}

export async function markDraftSentAction(draftId: string): Promise<ActionResult> {
  return run(async (ws) => {
    await markDraftSent(ws, id.parse(draftId));
    return null;
  });
}

export async function discardDraftAction(draftId: string): Promise<ActionResult> {
  return run(async (ws) => {
    await discardDraft(ws, id.parse(draftId));
    return null;
  });
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

export type FollowUpOp =
  | { op: "accept" }
  | { op: "complete" }
  | { op: "dismiss" }
  | { op: "reopen" }
  | { op: "snooze"; days: number }
  | { op: "reschedule"; date: string };

export async function followUpAction(taskId: string, action: FollowUpOp): Promise<ActionResult> {
  return run(async (ws) => {
    const tid = id.parse(taskId);
    switch (action.op) {
      case "accept":
        await acceptFollowUp(ws, tid);
        break;
      case "complete":
        await completeFollowUp(ws, tid);
        break;
      case "dismiss":
        await dismissFollowUp(ws, tid);
        break;
      case "reopen":
        await reopenFollowUp(ws, tid);
        break;
      case "snooze":
        await snoozeFollowUp(ws, tid, action.days);
        break;
      case "reschedule":
        await rescheduleFollowUp(ws, tid, action.date);
        break;
    }
    return null;
  });
}

export async function createFollowUpAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return run(async (ws) => {
    await createManualFollowUp(ws, {
      contact_id: str(form, "contact_id"),
      title: str(form, "title"),
      reason: str(form, "reason"),
      due_date: str(form, "due_date"),
      priority: (str(form, "priority") || "medium") as "medium",
    });
    return null;
  });
}
