import type {
  CareerInsight,
  CareerInsightInput,
  CompanyResearch,
  Contact,
  ContactExperience,
  ContactExperienceInput,
  ContactInput,
  FollowUpInput,
  FollowUpTask,
  Interaction,
  InteractionInput,
  Meeting,
  MeetingInput,
  MeetingNote,
  MeetingQuestion,
  MeetingQuestionInput,
  MeetingSummary,
  MeetingSummaryInput,
  MessageDraft,
  MessageDraftInput,
  Profile,
  ProfileInput,
  UUID,
} from "@/lib/domain/types";

/**
 * The single contract between the app and its storage.
 *
 * A Repository is always bound to ONE user when it is created. No method takes
 * a user id, so it's impossible for calling code to accidentally read or write
 * another user's data. Implementations:
 *   - SupabaseRepository: production (plus Postgres Row Level Security)
 *   - MemoryRepository:   local development, the public demo, and tests
 *
 * Methods return `null` (or an empty list) for records that don't exist *or*
 * belong to someone else — callers can't tell the difference, by design.
 */
export interface Repository {
  readonly userId: UUID;

  // Profile
  getProfile(): Promise<Profile | null>;
  saveProfile(input: Partial<ProfileInput>): Promise<Profile>;

  // Contacts
  listContacts(opts?: { query?: string; includeArchived?: boolean }): Promise<Contact[]>;
  getContact(id: UUID): Promise<Contact | null>;
  createContact(input: ContactInput): Promise<Contact>;
  updateContact(id: UUID, patch: Partial<Omit<Contact, "id" | "user_id" | "created_at">>): Promise<Contact | null>;
  deleteContact(id: UUID): Promise<boolean>;

  listExperiences(contactId: UUID): Promise<ContactExperience[]>;
  replaceExperiences(contactId: UUID, items: ContactExperienceInput[]): Promise<ContactExperience[]>;

  // Meetings
  listMeetings(opts?: { contactId?: UUID }): Promise<Meeting[]>;
  getMeeting(id: UUID): Promise<Meeting | null>;
  createMeeting(input: MeetingInput): Promise<Meeting>;
  updateMeeting(id: UUID, patch: Partial<Omit<Meeting, "id" | "user_id" | "contact_id" | "created_at">>): Promise<Meeting | null>;

  listQuestions(meetingId: UUID): Promise<MeetingQuestion[]>;
  getQuestion(id: UUID): Promise<MeetingQuestion | null>;
  /** Replaces generated questions; questions the user edited or added are kept unless `includeEdited`. */
  replaceGeneratedQuestions(meetingId: UUID, items: MeetingQuestionInput[], opts?: { includeEdited?: boolean }): Promise<MeetingQuestion[]>;
  addQuestion(meetingId: UUID, item: MeetingQuestionInput): Promise<MeetingQuestion | null>;
  updateQuestion(id: UUID, patch: Partial<Omit<MeetingQuestion, "id" | "user_id" | "meeting_id" | "created_at">>): Promise<MeetingQuestion | null>;
  deleteQuestion(id: UUID): Promise<boolean>;

  /** Notes are append-only: history is never overwritten. */
  listNotes(meetingId: UUID): Promise<MeetingNote[]>;
  addNote(meetingId: UUID, body: string, kind: MeetingNote["kind"]): Promise<MeetingNote | null>;

  listSummaries(opts: { meetingId?: UUID; contactId?: UUID }): Promise<MeetingSummary[]>;
  addSummary(input: MeetingSummaryInput): Promise<MeetingSummary>;

  // Follow-ups
  listFollowUps(opts?: { contactId?: UUID; meetingId?: UUID }): Promise<FollowUpTask[]>;
  getFollowUp(id: UUID): Promise<FollowUpTask | null>;
  createFollowUps(items: FollowUpInput[]): Promise<FollowUpTask[]>;
  updateFollowUp(id: UUID, patch: Partial<Omit<FollowUpTask, "id" | "user_id" | "contact_id" | "created_at">>): Promise<FollowUpTask | null>;

  // Drafts
  listDrafts(opts?: { contactId?: UUID; meetingId?: UUID }): Promise<MessageDraft[]>;
  getDraft(id: UUID): Promise<MessageDraft | null>;
  createDraft(input: MessageDraftInput): Promise<MessageDraft>;
  updateDraft(id: UUID, patch: Partial<Pick<MessageDraft, "subject" | "body" | "status" | "sent_at">>): Promise<MessageDraft | null>;

  // History
  listInteractions(opts?: { contactId?: UUID }): Promise<Interaction[]>;
  addInteraction(input: InteractionInput): Promise<Interaction>;

  // Knowledge
  listInsights(opts?: { contactId?: UUID }): Promise<CareerInsight[]>;
  addInsights(items: CareerInsightInput[]): Promise<CareerInsight[]>;

  // Company research (your own notes about a company)
  getCompanyResearch(companyName: string): Promise<CompanyResearch | null>;
  saveCompanyResearch(companyName: string, notes: string): Promise<CompanyResearch>;

  /** Atomically increments today's AI usage counter and returns the new count. */
  incrementAiUsage(day: string): Promise<number>;
}

/** Thrown when a write references a parent record the user doesn't own. */
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}
