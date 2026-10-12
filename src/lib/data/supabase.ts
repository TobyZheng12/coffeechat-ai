import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CareerInsight,
  CompanyResearch,
  Contact,
  ContactExperience,
  FollowUpTask,
  Interaction,
  Meeting,
  MeetingNote,
  MeetingQuestion,
  MeetingSummary,
  MessageDraft,
  Profile,
  UUID,
} from "@/lib/domain/types";
import { NotFoundError, type Repository } from "./repository";

/**
 * Production repository backed by Supabase Postgres.
 *
 * The client is created with the signed-in user's session, so every query is
 * filtered by Row Level Security in the database. We ALSO filter by user_id in
 * every query (defense in depth): if a policy were ever misconfigured, the app
 * still wouldn't request other users' rows.
 */
export class SupabaseRepository implements Repository {
  constructor(
    private readonly sb: SupabaseClient,
    readonly userId: UUID,
  ) {}

  private table(name: string) {
    return this.sb.from(name);
  }

  private fail(error: { message: string; code?: string } | null, what: string): never | void {
    if (!error) return;
    // 23503 = foreign key violation: the parent doesn't exist for this user.
    if (error.code === "23503") throw new NotFoundError(what);
    throw new Error(`${what}: ${error.message}`);
  }

  // --- Profile --------------------------------------------------------------

  async getProfile() {
    const { data, error } = await this.table("profiles").select("*").eq("id", this.userId).maybeSingle();
    this.fail(error, "Profile");
    return (data as Profile) ?? null;
  }

  async saveProfile(input: Parameters<Repository["saveProfile"]>[0]) {
    const { data, error } = await this.table("profiles")
      .upsert({ ...input, id: this.userId })
      .select("*")
      .single();
    this.fail(error, "Profile");
    return data as Profile;
  }

  // --- Contacts ---------------------------------------------------------------

  async listContacts(opts: { query?: string; includeArchived?: boolean } = {}) {
    let q = this.table("contacts").select("*").eq("user_id", this.userId);
    if (!opts.includeArchived) q = q.is("archived_at", null);
    const term = opts.query?.trim();
    if (term) {
      // Matches contact fields, plus any contact whose meeting notes mention the term.
      const safe = term.replace(/[%_,()]/g, " ");
      const { data: noteHits } = await this.table("meeting_notes")
        .select("contact_id")
        .eq("user_id", this.userId)
        .ilike("body", `%${safe}%`)
        .limit(200);
      const ids = Array.from(new Set((noteHits ?? []).map((n: { contact_id: string }) => n.contact_id)));
      const fields = ["full_name", "current_company", "current_position", "industry", "how_connected", "personal_notes"]
        .map((f) => `${f}.ilike.%${safe}%`)
        .join(",");
      q = q.or(ids.length ? `${fields},id.in.(${ids.join(",")})` : fields);
    }
    const { data, error } = await q.order("updated_at", { ascending: false });
    this.fail(error, "Contacts");
    return (data ?? []) as Contact[];
  }

  async getContact(id: UUID) {
    const { data, error } = await this.table("contacts").select("*").eq("user_id", this.userId).eq("id", id).maybeSingle();
    this.fail(error, "Contact");
    return (data as Contact) ?? null;
  }

  async createContact(input: Parameters<Repository["createContact"]>[0]) {
    const { data, error } = await this.table("contacts")
      .insert({ ...input, user_id: this.userId })
      .select("*")
      .single();
    this.fail(error, "Contact");
    return data as Contact;
  }

  async updateContact(id: UUID, patch: Parameters<Repository["updateContact"]>[1]) {
    const { data, error } = await this.table("contacts")
      .update(stripImmutable(patch))
      .eq("user_id", this.userId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    this.fail(error, "Contact");
    return (data as Contact) ?? null;
  }

  async deleteContact(id: UUID) {
    const { data, error } = await this.table("contacts").delete().eq("user_id", this.userId).eq("id", id).select("id");
    this.fail(error, "Contact");
    return (data ?? []).length > 0;
  }

  async listExperiences(contactId: UUID) {
    const { data, error } = await this.table("contact_experiences")
      .select("*")
      .eq("user_id", this.userId)
      .eq("contact_id", contactId)
      .order("position");
    this.fail(error, "Experiences");
    return (data ?? []) as ContactExperience[];
  }

  async replaceExperiences(contactId: UUID, items: Parameters<Repository["replaceExperiences"]>[1]) {
    if (!(await this.getContact(contactId))) throw new NotFoundError("Contact");
    const del = await this.table("contact_experiences").delete().eq("user_id", this.userId).eq("contact_id", contactId);
    this.fail(del.error, "Experiences");
    if (items.length === 0) return [];
    const { data, error } = await this.table("contact_experiences")
      .insert(items.map((it, i) => ({ ...it, contact_id: contactId, user_id: this.userId, position: i })))
      .select("*");
    this.fail(error, "Experiences");
    return ((data ?? []) as ContactExperience[]).sort((a, b) => a.position - b.position);
  }

  // --- Meetings ---------------------------------------------------------------

  async listMeetings(opts: { contactId?: UUID } = {}) {
    let q = this.table("meetings").select("*").eq("user_id", this.userId);
    if (opts.contactId) q = q.eq("contact_id", opts.contactId);
    const { data, error } = await q.order("scheduled_at", { ascending: false, nullsFirst: false });
    this.fail(error, "Meetings");
    return (data ?? []) as Meeting[];
  }

  async getMeeting(id: UUID) {
    const { data, error } = await this.table("meetings").select("*").eq("user_id", this.userId).eq("id", id).maybeSingle();
    this.fail(error, "Meeting");
    return (data as Meeting) ?? null;
  }

  async createMeeting(input: Parameters<Repository["createMeeting"]>[0]) {
    const { data, error } = await this.table("meetings")
      .insert({ ...input, user_id: this.userId })
      .select("*")
      .single();
    this.fail(error, "Contact");
    return data as Meeting;
  }

  async updateMeeting(id: UUID, patch: Parameters<Repository["updateMeeting"]>[1]) {
    const { data, error } = await this.table("meetings")
      .update(stripImmutable(patch))
      .eq("user_id", this.userId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    this.fail(error, "Meeting");
    return (data as Meeting) ?? null;
  }

  async listQuestions(meetingId: UUID) {
    const { data, error } = await this.table("meeting_questions")
      .select("*")
      .eq("user_id", this.userId)
      .eq("meeting_id", meetingId)
      .order("position");
    this.fail(error, "Questions");
    return (data ?? []) as MeetingQuestion[];
  }

  async getQuestion(id: UUID) {
    const { data, error } = await this.table("meeting_questions").select("*").eq("user_id", this.userId).eq("id", id).maybeSingle();
    this.fail(error, "Question");
    return (data as MeetingQuestion) ?? null;
  }

  async replaceGeneratedQuestions(meetingId: UUID, items: Parameters<Repository["replaceGeneratedQuestions"]>[1]) {
    if (!(await this.getMeeting(meetingId))) throw new NotFoundError("Meeting");
    const existing = await this.listQuestions(meetingId);
    const del = await this.table("meeting_questions")
      .delete()
      .eq("user_id", this.userId)
      .eq("meeting_id", meetingId)
      .eq("edited", false);
    this.fail(del.error, "Questions");
    const start = existing.filter((q) => q.edited).reduce((m, q) => Math.max(m, q.position + 1), 0);
    if (items.length) {
      const { error } = await this.table("meeting_questions").insert(
        items.map((it, i) => ({ ...it, meeting_id: meetingId, user_id: this.userId, position: start + i })),
      );
      this.fail(error, "Questions");
    }
    return this.listQuestions(meetingId);
  }

  async addQuestion(meetingId: UUID, item: Parameters<Repository["addQuestion"]>[1]) {
    const existing = await this.listQuestions(meetingId);
    if (!(await this.getMeeting(meetingId))) return null;
    const { data, error } = await this.table("meeting_questions")
      .insert({
        ...item,
        meeting_id: meetingId,
        user_id: this.userId,
        edited: true,
        position: existing.reduce((m, q) => Math.max(m, q.position + 1), 0),
      })
      .select("*")
      .single();
    this.fail(error, "Question");
    return data as MeetingQuestion;
  }

  async updateQuestion(id: UUID, patch: Parameters<Repository["updateQuestion"]>[1]) {
    const { data, error } = await this.table("meeting_questions")
      .update(stripImmutable(patch))
      .eq("user_id", this.userId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    this.fail(error, "Question");
    return (data as MeetingQuestion) ?? null;
  }

  async deleteQuestion(id: UUID) {
    const { data, error } = await this.table("meeting_questions").delete().eq("user_id", this.userId).eq("id", id).select("id");
    this.fail(error, "Question");
    return (data ?? []).length > 0;
  }

  async listNotes(meetingId: UUID) {
    const { data, error } = await this.table("meeting_notes")
      .select("*")
      .eq("user_id", this.userId)
      .eq("meeting_id", meetingId)
      .order("created_at");
    this.fail(error, "Notes");
    return (data ?? []) as MeetingNote[];
  }

  async addNote(meetingId: UUID, body: string, kind: MeetingNote["kind"]) {
    const meeting = await this.getMeeting(meetingId);
    if (!meeting) return null;
    const { data, error } = await this.table("meeting_notes")
      .insert({ meeting_id: meetingId, contact_id: meeting.contact_id, user_id: this.userId, body, kind })
      .select("*")
      .single();
    this.fail(error, "Note");
    return data as MeetingNote;
  }

  async listSummaries(opts: { meetingId?: UUID; contactId?: UUID }) {
    let q = this.table("meeting_summaries").select("*").eq("user_id", this.userId);
    if (opts.meetingId) q = q.eq("meeting_id", opts.meetingId);
    if (opts.contactId) q = q.eq("contact_id", opts.contactId);
    const { data, error } = await q.order("created_at", { ascending: false });
    this.fail(error, "Summaries");
    return (data ?? []) as MeetingSummary[];
  }

  async addSummary(input: Parameters<Repository["addSummary"]>[0]) {
    const meeting = await this.getMeeting(input.meeting_id);
    if (!meeting) throw new NotFoundError("Meeting");
    const { data, error } = await this.table("meeting_summaries")
      .insert({ ...input, contact_id: meeting.contact_id, user_id: this.userId })
      .select("*")
      .single();
    this.fail(error, "Summary");
    return data as MeetingSummary;
  }

  // --- Follow-ups -------------------------------------------------------------

  async listFollowUps(opts: { contactId?: UUID; meetingId?: UUID } = {}) {
    let q = this.table("follow_up_tasks").select("*").eq("user_id", this.userId);
    if (opts.contactId) q = q.eq("contact_id", opts.contactId);
    if (opts.meetingId) q = q.eq("meeting_id", opts.meetingId);
    const { data, error } = await q.order("due_date", { ascending: true, nullsFirst: false });
    this.fail(error, "Follow-ups");
    return (data ?? []) as FollowUpTask[];
  }

  async getFollowUp(id: UUID) {
    const { data, error } = await this.table("follow_up_tasks").select("*").eq("user_id", this.userId).eq("id", id).maybeSingle();
    this.fail(error, "Follow-up");
    return (data as FollowUpTask) ?? null;
  }

  async createFollowUps(items: Parameters<Repository["createFollowUps"]>[0]) {
    if (items.length === 0) return [];
    const { data, error } = await this.table("follow_up_tasks")
      .upsert(
        items.map((it) => ({ ...it, user_id: this.userId })),
        { onConflict: "user_id,rule_key", ignoreDuplicates: true },
      )
      .select("*");
    this.fail(error, "Contact");
    return (data ?? []) as FollowUpTask[];
  }

  async updateFollowUp(id: UUID, patch: Parameters<Repository["updateFollowUp"]>[1]) {
    const { data, error } = await this.table("follow_up_tasks")
      .update(stripImmutable(patch))
      .eq("user_id", this.userId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    this.fail(error, "Follow-up");
    return (data as FollowUpTask) ?? null;
  }

  // --- Drafts -----------------------------------------------------------------

  async listDrafts(opts: { contactId?: UUID; meetingId?: UUID } = {}) {
    let q = this.table("message_drafts").select("*").eq("user_id", this.userId);
    if (opts.contactId) q = q.eq("contact_id", opts.contactId);
    if (opts.meetingId) q = q.eq("meeting_id", opts.meetingId);
    const { data, error } = await q.order("created_at", { ascending: false });
    this.fail(error, "Drafts");
    return (data ?? []) as MessageDraft[];
  }

  async getDraft(id: UUID) {
    const { data, error } = await this.table("message_drafts").select("*").eq("user_id", this.userId).eq("id", id).maybeSingle();
    this.fail(error, "Draft");
    return (data as MessageDraft) ?? null;
  }

  async createDraft(input: Parameters<Repository["createDraft"]>[0]) {
    const { data, error } = await this.table("message_drafts")
      .insert({ ...input, user_id: this.userId })
      .select("*")
      .single();
    this.fail(error, "Contact");
    return data as MessageDraft;
  }

  async updateDraft(id: UUID, patch: Parameters<Repository["updateDraft"]>[1]) {
    const { data, error } = await this.table("message_drafts")
      .update(patch)
      .eq("user_id", this.userId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    this.fail(error, "Draft");
    return (data as MessageDraft) ?? null;
  }

  // --- History & knowledge -----------------------------------------------------

  async listInteractions(opts: { contactId?: UUID } = {}) {
    let q = this.table("interaction_history").select("*").eq("user_id", this.userId);
    if (opts.contactId) q = q.eq("contact_id", opts.contactId);
    const { data, error } = await q.order("occurred_at", { ascending: false });
    this.fail(error, "History");
    return (data ?? []) as Interaction[];
  }

  async addInteraction(input: Parameters<Repository["addInteraction"]>[0]) {
    const { data, error } = await this.table("interaction_history")
      .insert({ ...input, user_id: this.userId })
      .select("*")
      .single();
    this.fail(error, "Contact");
    return data as Interaction;
  }

  async listInsights(opts: { contactId?: UUID } = {}) {
    let q = this.table("career_insights").select("*").eq("user_id", this.userId);
    if (opts.contactId) q = q.eq("contact_id", opts.contactId);
    const { data, error } = await q.order("created_at", { ascending: false });
    this.fail(error, "Insights");
    return (data ?? []) as CareerInsight[];
  }

  async addInsights(items: Parameters<Repository["addInsights"]>[0]) {
    if (items.length === 0) return [];
    const { data, error } = await this.table("career_insights")
      .insert(items.map((it) => ({ ...it, user_id: this.userId })))
      .select("*");
    this.fail(error, "Contact");
    return (data ?? []) as CareerInsight[];
  }

  async getCompanyResearch(companyName: string) {
    const safe = companyName.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data, error } = await this.table("company_research")
      .select("*")
      .eq("user_id", this.userId)
      .ilike("company_name", safe)
      .maybeSingle();
    this.fail(error, "Company research");
    return (data as CompanyResearch) ?? null;
  }

  async saveCompanyResearch(companyName: string, notes: string) {
    const existing = await this.getCompanyResearch(companyName);
    const q = existing
      ? this.table("company_research").update({ notes }).eq("user_id", this.userId).eq("id", existing.id)
      : this.table("company_research").insert({ company_name: companyName.trim(), notes, user_id: this.userId });
    const { data, error } = await q.select("*").single();
    this.fail(error, "Company research");
    return data as CompanyResearch;
  }

  async incrementAiUsage(day: string) {
    const { data, error } = await this.sb.rpc("increment_ai_usage", { p_day: day });
    this.fail(error, "AI usage");
    return Number(data);
  }
}

function stripImmutable<T extends object>(patch: T): T {
  const copy = { ...patch } as Record<string, unknown>;
  delete copy.id;
  delete copy.user_id;
  delete copy.created_at;
  delete copy.updated_at;
  return copy as T;
}
