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
  ProfileInput,
  UUID,
} from "@/lib/domain/types";
import { NotFoundError, type Repository } from "./repository";

/**
 * In-memory implementation of the Repository.
 *
 * One MemoryStore can hold many users' data (that's how ownership tests work);
 * each MemoryRepository only ever sees rows whose user_id matches its own.
 */

export interface MemoryData {
  profiles: Profile[];
  contacts: Contact[];
  contact_experiences: ContactExperience[];
  meetings: Meeting[];
  meeting_questions: MeetingQuestion[];
  meeting_notes: MeetingNote[];
  meeting_summaries: MeetingSummary[];
  follow_up_tasks: FollowUpTask[];
  message_drafts: MessageDraft[];
  interaction_history: Interaction[];
  career_insights: CareerInsight[];
  company_research: CompanyResearch[];
  ai_usage: { user_id: UUID; day: string; count: number }[];
}

export function emptyData(): MemoryData {
  return {
    profiles: [],
    contacts: [],
    contact_experiences: [],
    meetings: [],
    meeting_questions: [],
    meeting_notes: [],
    meeting_summaries: [],
    follow_up_tasks: [],
    message_drafts: [],
    interaction_history: [],
    career_insights: [],
    company_research: [],
    ai_usage: [],
  };
}

export class MemoryStore {
  constructor(
    public data: MemoryData = emptyData(),
    private readonly onChange?: (data: MemoryData) => void,
  ) {}
  changed() {
    this.onChange?.(this.data);
  }
}

export const DEFAULT_PROFILE: Omit<Profile, "id" | "created_at" | "updated_at"> = {
  full_name: "",
  preferred_name: "",
  hometown: "",
  school: "",
  major: "",
  background: "",
  interests: [],
  target_companies: [],
  career_goals: "",
  intro_pitch: "",
  native_language: "",
  english_second_language: false,
  timezone: "America/Denver",
  mission_start: null,
  mission_end: null,
  mission_location: "",
  mission_disclosure: "when_relevant",
};

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const clone = <T>(v: T): T => structuredClone(v);

/** Columns the client may never change through an update. */
const IMMUTABLE = new Set(["id", "user_id", "created_at"]);

function applyPatch<T extends object>(row: T, patch: object): T {
  for (const [k, v] of Object.entries(patch)) {
    if (IMMUTABLE.has(k) || v === undefined) continue;
    (row as Record<string, unknown>)[k] = v;
  }
  if ("updated_at" in row) (row as Record<string, unknown>).updated_at = now();
  return row;
}

export class MemoryRepository implements Repository {
  constructor(
    private readonly store: MemoryStore,
    readonly userId: UUID,
  ) {}

  private get d() {
    return this.store.data;
  }
  private mine<T extends { user_id: UUID }>(rows: T[]): T[] {
    return rows.filter((r) => r.user_id === this.userId);
  }
  private save() {
    this.store.changed();
  }

  // --- Profile --------------------------------------------------------------

  async getProfile() {
    const p = this.d.profiles.find((x) => x.id === this.userId);
    return p ? clone(p) : null;
  }

  async saveProfile(input: Partial<ProfileInput>) {
    let p = this.d.profiles.find((x) => x.id === this.userId);
    if (!p) {
      p = { ...DEFAULT_PROFILE, id: this.userId, created_at: now(), updated_at: now() };
      this.d.profiles.push(p);
    }
    applyPatch(p, input);
    this.save();
    return clone(p);
  }

  // --- Contacts ---------------------------------------------------------------

  async listContacts(opts: { query?: string; includeArchived?: boolean } = {}) {
    let rows = this.mine(this.d.contacts);
    if (!opts.includeArchived) rows = rows.filter((c) => !c.archived_at);
    const q = opts.query?.trim().toLowerCase();
    if (q) {
      const noteText = (contactId: UUID) =>
        this.mine(this.d.meeting_notes)
          .filter((n) => n.contact_id === contactId)
          .map((n) => n.body)
          .join(" ");
      rows = rows.filter((c) =>
        [c.full_name, c.current_company, c.current_position, c.industry, c.how_connected, c.personal_notes, c.tags.join(" "), noteText(c.id)]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return clone(rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
  }

  async getContact(id: UUID) {
    const c = this.mine(this.d.contacts).find((x) => x.id === id);
    return c ? clone(c) : null;
  }

  async createContact(input: Parameters<Repository["createContact"]>[0]) {
    const c: Contact = {
      ...input,
      id: uuid(),
      user_id: this.userId,
      analysis: null,
      analysis_generated_at: null,
      archived_at: null,
      created_at: now(),
      updated_at: now(),
    };
    this.d.contacts.push(c);
    this.save();
    return clone(c);
  }

  async updateContact(id: UUID, patch: Parameters<Repository["updateContact"]>[1]) {
    const c = this.mine(this.d.contacts).find((x) => x.id === id);
    if (!c) return null;
    applyPatch(c, patch);
    this.save();
    return clone(c);
  }

  async deleteContact(id: UUID) {
    const c = this.mine(this.d.contacts).find((x) => x.id === id);
    if (!c) return false;
    // Mirrors ON DELETE CASCADE in Postgres.
    const meetingIds = new Set(this.d.meetings.filter((m) => m.contact_id === id).map((m) => m.id));
    const d = this.d;
    d.contacts = d.contacts.filter((x) => x.id !== id);
    d.contact_experiences = d.contact_experiences.filter((x) => x.contact_id !== id);
    d.meetings = d.meetings.filter((x) => x.contact_id !== id);
    d.meeting_questions = d.meeting_questions.filter((x) => !meetingIds.has(x.meeting_id));
    d.meeting_notes = d.meeting_notes.filter((x) => x.contact_id !== id);
    d.meeting_summaries = d.meeting_summaries.filter((x) => x.contact_id !== id);
    d.follow_up_tasks = d.follow_up_tasks.filter((x) => x.contact_id !== id);
    d.message_drafts = d.message_drafts.filter((x) => x.contact_id !== id);
    d.interaction_history = d.interaction_history.filter((x) => x.contact_id !== id);
    d.career_insights = d.career_insights.filter((x) => x.contact_id !== id);
    this.save();
    return true;
  }

  async listExperiences(contactId: UUID) {
    return clone(
      this.mine(this.d.contact_experiences)
        .filter((e) => e.contact_id === contactId)
        .sort((a, b) => a.position - b.position),
    );
  }

  async replaceExperiences(contactId: UUID, items: Parameters<Repository["replaceExperiences"]>[1]) {
    await this.requireContact(contactId);
    this.d.contact_experiences = this.d.contact_experiences.filter(
      (e) => !(e.contact_id === contactId && e.user_id === this.userId),
    );
    const rows = items.map((it, i) => ({
      ...it,
      id: uuid(),
      user_id: this.userId,
      contact_id: contactId,
      position: i,
      created_at: now(),
    }));
    this.d.contact_experiences.push(...rows);
    this.save();
    return clone(rows);
  }

  // --- Meetings ---------------------------------------------------------------

  async listMeetings(opts: { contactId?: UUID } = {}) {
    let rows = this.mine(this.d.meetings);
    if (opts.contactId) rows = rows.filter((m) => m.contact_id === opts.contactId);
    return clone(rows.sort((a, b) => (b.scheduled_at ?? b.created_at).localeCompare(a.scheduled_at ?? a.created_at)));
  }

  async getMeeting(id: UUID) {
    const m = this.mine(this.d.meetings).find((x) => x.id === id);
    return m ? clone(m) : null;
  }

  async createMeeting(input: Parameters<Repository["createMeeting"]>[0]) {
    await this.requireContact(input.contact_id);
    const m: Meeting = {
      ...input,
      id: uuid(),
      user_id: this.userId,
      status: "planned",
      script: null,
      script_generated_at: null,
      completed_at: null,
      created_at: now(),
      updated_at: now(),
    };
    this.d.meetings.push(m);
    this.save();
    return clone(m);
  }

  async updateMeeting(id: UUID, patch: Parameters<Repository["updateMeeting"]>[1]) {
    const m = this.mine(this.d.meetings).find((x) => x.id === id);
    if (!m) return null;
    applyPatch(m, patch);
    this.save();
    return clone(m);
  }

  async listQuestions(meetingId: UUID) {
    return clone(
      this.mine(this.d.meeting_questions)
        .filter((q) => q.meeting_id === meetingId)
        .sort((a, b) => a.position - b.position),
    );
  }

  async getQuestion(id: UUID) {
    const q = this.mine(this.d.meeting_questions).find((x) => x.id === id);
    return q ? clone(q) : null;
  }

  async replaceGeneratedQuestions(
    meetingId: UUID,
    items: Parameters<Repository["replaceGeneratedQuestions"]>[1],
    opts: { includeEdited?: boolean } = {},
  ) {
    await this.requireMeeting(meetingId);
    const replace = (q: MeetingQuestion) => opts.includeEdited || !q.edited;
    const kept = this.mine(this.d.meeting_questions).filter((q) => q.meeting_id === meetingId && !replace(q));
    this.d.meeting_questions = this.d.meeting_questions.filter(
      (q) => !(q.meeting_id === meetingId && q.user_id === this.userId && replace(q)),
    );
    const start = kept.reduce((max, q) => Math.max(max, q.position + 1), 0);
    const rows: MeetingQuestion[] = items.map((it, i) => ({
      ...it,
      id: uuid(),
      user_id: this.userId,
      meeting_id: meetingId,
      asked: false,
      edited: false,
      position: start + i,
      created_at: now(),
      updated_at: now(),
    }));
    this.d.meeting_questions.push(...rows);
    this.save();
    return this.listQuestions(meetingId);
  }

  async addQuestion(meetingId: UUID, item: Parameters<Repository["addQuestion"]>[1]) {
    if (!this.mine(this.d.meetings).some((m) => m.id === meetingId)) return null;
    const max = this.mine(this.d.meeting_questions)
      .filter((q) => q.meeting_id === meetingId)
      .reduce((m, q) => Math.max(m, q.position), -1);
    const row: MeetingQuestion = {
      ...item,
      id: uuid(),
      user_id: this.userId,
      meeting_id: meetingId,
      asked: false,
      edited: true,
      position: max + 1,
      created_at: now(),
      updated_at: now(),
    };
    this.d.meeting_questions.push(row);
    this.save();
    return clone(row);
  }

  async updateQuestion(id: UUID, patch: Parameters<Repository["updateQuestion"]>[1]) {
    const q = this.mine(this.d.meeting_questions).find((x) => x.id === id);
    if (!q) return null;
    applyPatch(q, patch);
    this.save();
    return clone(q);
  }

  async deleteQuestion(id: UUID) {
    const before = this.d.meeting_questions.length;
    this.d.meeting_questions = this.d.meeting_questions.filter((q) => !(q.id === id && q.user_id === this.userId));
    this.save();
    return this.d.meeting_questions.length < before;
  }

  async listNotes(meetingId: UUID) {
    return clone(
      this.mine(this.d.meeting_notes)
        .filter((n) => n.meeting_id === meetingId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    );
  }

  async addNote(meetingId: UUID, body: string, kind: MeetingNote["kind"]) {
    const m = this.mine(this.d.meetings).find((x) => x.id === meetingId);
    if (!m) return null;
    const n: MeetingNote = {
      id: uuid(),
      user_id: this.userId,
      meeting_id: meetingId,
      contact_id: m.contact_id,
      body,
      kind,
      created_at: now(),
    };
    this.d.meeting_notes.push(n);
    this.save();
    return clone(n);
  }

  async listSummaries(opts: { meetingId?: UUID; contactId?: UUID }) {
    let rows = this.mine(this.d.meeting_summaries);
    if (opts.meetingId) rows = rows.filter((s) => s.meeting_id === opts.meetingId);
    if (opts.contactId) rows = rows.filter((s) => s.contact_id === opts.contactId);
    return clone(rows.sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }

  async addSummary(input: Parameters<Repository["addSummary"]>[0]) {
    const m = await this.requireMeeting(input.meeting_id);
    const s: MeetingSummary = { ...input, contact_id: m.contact_id, id: uuid(), user_id: this.userId, created_at: now() };
    this.d.meeting_summaries.push(s);
    this.save();
    return clone(s);
  }

  // --- Follow-ups -------------------------------------------------------------

  async listFollowUps(opts: { contactId?: UUID; meetingId?: UUID } = {}) {
    let rows = this.mine(this.d.follow_up_tasks);
    if (opts.contactId) rows = rows.filter((t) => t.contact_id === opts.contactId);
    if (opts.meetingId) rows = rows.filter((t) => t.meeting_id === opts.meetingId);
    return clone(rows.sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")));
  }

  async getFollowUp(id: UUID) {
    const t = this.mine(this.d.follow_up_tasks).find((x) => x.id === id);
    return t ? clone(t) : null;
  }

  async createFollowUps(items: Parameters<Repository["createFollowUps"]>[0]) {
    const rows: FollowUpTask[] = [];
    for (const it of items) {
      await this.requireContact(it.contact_id);
      // Mirrors the unique (user_id, rule_key) index.
      if (it.rule_key && this.mine(this.d.follow_up_tasks).some((t) => t.rule_key === it.rule_key)) continue;
      rows.push({ ...it, id: uuid(), user_id: this.userId, completed_at: null, created_at: now(), updated_at: now() });
    }
    this.d.follow_up_tasks.push(...rows);
    this.save();
    return clone(rows);
  }

  async updateFollowUp(id: UUID, patch: Parameters<Repository["updateFollowUp"]>[1]) {
    const t = this.mine(this.d.follow_up_tasks).find((x) => x.id === id);
    if (!t) return null;
    applyPatch(t, patch);
    this.save();
    return clone(t);
  }

  // --- Drafts -----------------------------------------------------------------

  async listDrafts(opts: { contactId?: UUID; meetingId?: UUID } = {}) {
    let rows = this.mine(this.d.message_drafts);
    if (opts.contactId) rows = rows.filter((x) => x.contact_id === opts.contactId);
    if (opts.meetingId) rows = rows.filter((x) => x.meeting_id === opts.meetingId);
    return clone(rows.sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }

  async getDraft(id: UUID) {
    const x = this.mine(this.d.message_drafts).find((r) => r.id === id);
    return x ? clone(x) : null;
  }

  async createDraft(input: Parameters<Repository["createDraft"]>[0]) {
    await this.requireContact(input.contact_id);
    const row: MessageDraft = {
      ...input,
      id: uuid(),
      user_id: this.userId,
      status: "draft",
      sent_at: null,
      created_at: now(),
      updated_at: now(),
    };
    this.d.message_drafts.push(row);
    this.save();
    return clone(row);
  }

  async updateDraft(id: UUID, patch: Parameters<Repository["updateDraft"]>[1]) {
    const x = this.mine(this.d.message_drafts).find((r) => r.id === id);
    if (!x) return null;
    applyPatch(x, patch);
    this.save();
    return clone(x);
  }

  // --- History & knowledge -----------------------------------------------------

  async listInteractions(opts: { contactId?: UUID } = {}) {
    let rows = this.mine(this.d.interaction_history);
    if (opts.contactId) rows = rows.filter((x) => x.contact_id === opts.contactId);
    return clone(rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)));
  }

  async addInteraction(input: Parameters<Repository["addInteraction"]>[0]) {
    await this.requireContact(input.contact_id);
    const row: Interaction = { ...input, id: uuid(), user_id: this.userId, created_at: now() };
    this.d.interaction_history.push(row);
    this.save();
    return clone(row);
  }

  async listInsights(opts: { contactId?: UUID } = {}) {
    let rows = this.mine(this.d.career_insights);
    if (opts.contactId) rows = rows.filter((x) => x.contact_id === opts.contactId);
    return clone(rows.sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }

  async addInsights(items: Parameters<Repository["addInsights"]>[0]) {
    const rows: CareerInsight[] = [];
    for (const it of items) {
      await this.requireContact(it.contact_id);
      rows.push({ ...it, id: uuid(), user_id: this.userId, created_at: now() });
    }
    this.d.career_insights.push(...rows);
    this.save();
    return clone(rows);
  }

  async getCompanyResearch(companyName: string) {
    const key = companyName.trim().toLowerCase();
    const r = this.mine(this.d.company_research).find((x) => x.company_name.toLowerCase() === key);
    return r ? clone(r) : null;
  }

  async saveCompanyResearch(companyName: string, notes: string) {
    const key = companyName.trim().toLowerCase();
    let r = this.mine(this.d.company_research).find((x) => x.company_name.toLowerCase() === key);
    if (!r) {
      r = { id: uuid(), user_id: this.userId, company_name: companyName.trim(), notes: "", summary: "", created_at: now(), updated_at: now() };
      this.d.company_research.push(r);
    }
    applyPatch(r, { notes });
    this.save();
    return clone(r);
  }

  async incrementAiUsage(day: string) {
    let row = this.d.ai_usage.find((u) => u.user_id === this.userId && u.day === day);
    if (!row) {
      row = { user_id: this.userId, day, count: 0 };
      this.d.ai_usage.push(row);
    }
    row.count += 1;
    this.save();
    return row.count;
  }

  // --- Ownership guards (mirror the composite foreign keys in Postgres) -------

  private async requireContact(id: UUID) {
    const c = this.mine(this.d.contacts).find((x) => x.id === id);
    if (!c) throw new NotFoundError("Contact");
    return c;
  }
  private async requireMeeting(id: UUID) {
    const m = this.mine(this.d.meetings).find((x) => x.id === id);
    if (!m) throw new NotFoundError("Meeting");
    return m;
  }
}
