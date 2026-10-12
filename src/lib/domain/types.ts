/**
 * Domain types shared by every layer (UI, services, repositories, AI).
 *
 * Field names are snake_case on purpose: they match the Postgres columns
 * one-to-one, so the Supabase repository needs no mapping code.
 */

export type UUID = string;
/** Calendar date, `YYYY-MM-DD`. */
export type ISODate = string;
/** Full timestamp, ISO 8601. */
export type ISODateTime = string;

export type Priority = "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";

// ---------------------------------------------------------------------------
// Profile (the signed-in user)
// ---------------------------------------------------------------------------

export type MissionDisclosure = "when_relevant" | "never";

export interface Profile {
  id: UUID;
  full_name: string;
  preferred_name: string;
  hometown: string;
  school: string;
  major: string;
  /** Free text: experience, internships, coursework. */
  background: string;
  interests: string[];
  target_companies: string[];
  career_goals: string;
  /** Optional hand-written 20–30 second intro. Empty = AI writes one per contact. */
  intro_pitch: string;
  native_language: string;
  english_second_language: boolean;
  timezone: string;
  /** "Big upcoming commitment" timeline — used for an LDS mission, but generic. */
  mission_start: ISODate | null;
  mission_end: ISODate | null;
  mission_location: string;
  mission_disclosure: MissionDisclosure;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type ProfileInput = Omit<Profile, "id" | "created_at" | "updated_at">;

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export interface Contact {
  id: UUID;
  user_id: UUID;
  full_name: string;
  linkedin_url: string;
  current_company: string;
  current_position: string;
  location: string;
  industry: string;
  how_connected: string;
  linkedin_profile_text: string;
  linkedin_experience_text: string;
  linkedin_education_text: string;
  email_thread_text: string;
  personal_notes: string;
  analysis: ContactAnalysisRecord | null;
  analysis_generated_at: ISODateTime | null;
  tags: string[];
  archived_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type ContactInput = Pick<
  Contact,
  | "full_name"
  | "linkedin_url"
  | "current_company"
  | "current_position"
  | "location"
  | "industry"
  | "how_connected"
  | "linkedin_profile_text"
  | "linkedin_experience_text"
  | "linkedin_education_text"
  | "email_thread_text"
  | "personal_notes"
  | "tags"
>;

export interface ContactExperience {
  id: UUID;
  user_id: UUID;
  contact_id: UUID;
  kind: "work" | "education";
  organization: string;
  title: string;
  start_label: string;
  end_label: string;
  description: string;
  position: number;
  source: "ai" | "manual";
  created_at: ISODateTime;
}

export type ContactExperienceInput = Pick<
  ContactExperience,
  "kind" | "organization" | "title" | "start_label" | "end_label" | "description" | "source"
>;

/** What we persist from the AI contact analysis (validated before storage). */
export interface ContactAnalysisRecord {
  headline_summary: string;
  career_progression: string;
  career_transitions: string[];
  shared_interests: { point: string; evidence: string }[];
  connections_to_me: { point: string; evidence: string }[];
  topics_to_explore: string[];
  recruiting_insights_to_ask: string[];
  missing_information: string[];
  generated_by: string;
}

// ---------------------------------------------------------------------------
// Meetings & interview scripts
// ---------------------------------------------------------------------------

export type MeetingStatus = "planned" | "completed" | "cancelled";
export type MeetingMedium = "zoom" | "phone" | "in_person" | "other";

export interface MeetingScript {
  objectives: string[];
  greeting: string;
  why_connect: string;
  self_intro: string;
  transition_to_questions: string;
  closing_thanks: string;
  /** Null when the AI judged that asking for referrals would feel forced. */
  referral_question: string | null;
  closing_reminder: string;
  generated_by: string;
}

export interface Meeting {
  id: UUID;
  user_id: UUID;
  contact_id: UUID;
  title: string;
  scheduled_at: ISODateTime | null;
  duration_minutes: number;
  medium: MeetingMedium;
  status: MeetingStatus;
  script: MeetingScript | null;
  script_generated_at: ISODateTime | null;
  completed_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type MeetingInput = Pick<
  Meeting,
  "contact_id" | "title" | "scheduled_at" | "duration_minutes" | "medium"
>;

export type QuestionSection = "career_journey" | "deep_dive" | "career_advice" | "closing";

export interface Evidence {
  quote: string;
  source: "linkedin" | "email" | "notes";
}

export interface MeetingQuestion {
  id: UUID;
  user_id: UUID;
  meeting_id: UUID;
  section: QuestionSection;
  question: string;
  short_version: string;
  why_relevant: string;
  follow_up: string;
  priority: 1 | 2 | 3;
  evidence: Evidence[];
  include_in_short_call: boolean;
  is_alternate: boolean;
  asked: boolean;
  edited: boolean;
  position: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type MeetingQuestionInput = Pick<
  MeetingQuestion,
  | "section"
  | "question"
  | "short_version"
  | "why_relevant"
  | "follow_up"
  | "priority"
  | "evidence"
  | "include_in_short_call"
  | "is_alternate"
>;

export interface MeetingNote {
  id: UUID;
  user_id: UUID;
  meeting_id: UUID;
  contact_id: UUID;
  body: string;
  kind: "post_meeting" | "live";
  created_at: ISODateTime;
}

// ---------------------------------------------------------------------------
// Meeting summaries (AI-extracted from notes)
// ---------------------------------------------------------------------------

export interface AdviceItem {
  advice: string;
  topic: string;
  /** Verbatim fragment from the user's notes supporting this advice. */
  source_quote: string;
}

export interface ActionItem {
  owner: "me" | "them";
  description: string;
  due_hint: string | null;
}

export interface ResourceItem {
  name: string;
  kind: "book" | "course" | "article" | "podcast" | "skill" | "event" | "other";
  note: string;
}

export interface IntroOffer {
  person_or_role: string;
  note: string;
}

export type ReconnectTimeframe =
  | "after_mission"
  | "after_recruiting"
  | "after_resource"
  | "specific_date"
  | "general";

export interface ReconnectSignal {
  phrase: string;
  timeframe: ReconnectTimeframe;
  date: ISODate | null;
}

export interface MeetingSummary {
  id: UUID;
  user_id: UUID;
  meeting_id: UUID;
  contact_id: UUID;
  source_note_ids: UUID[];
  summary: string;
  key_points: string[];
  advice: AdviceItem[];
  action_items: ActionItem[];
  relationship_insights: string[];
  resources: ResourceItem[];
  introductions_offered: IntroOffer[];
  reconnect_signals: ReconnectSignal[];
  offered_further_help: boolean;
  topics: string[];
  generated_by: string;
  created_at: ISODateTime;
}

export type MeetingSummaryInput = Omit<MeetingSummary, "id" | "user_id" | "created_at">;

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

export type FollowUpKind =
  | "thank_you"
  | "intro_response"
  | "action_item"
  | "resource_followup"
  | "reconnect"
  | "pre_mission_update"
  | "post_mission_reconnect"
  | "custom";

export type FollowUpStatus = "suggested" | "accepted" | "snoozed" | "dismissed" | "completed";

export interface FollowUpTask {
  id: UUID;
  user_id: UUID;
  contact_id: UUID;
  meeting_id: UUID | null;
  kind: FollowUpKind;
  title: string;
  reason: string;
  message_angle: string;
  /** Null = "no date yet" (e.g. after a mission whose end date is unknown). */
  due_date: ISODate | null;
  timing_note: string;
  priority: Priority;
  confidence: Confidence;
  status: FollowUpStatus;
  /** Stable key so the engine never creates the same recommendation twice. */
  rule_key: string | null;
  source: "engine" | "manual";
  completed_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type FollowUpInput = Pick<
  FollowUpTask,
  | "contact_id"
  | "meeting_id"
  | "kind"
  | "title"
  | "reason"
  | "message_angle"
  | "due_date"
  | "timing_note"
  | "priority"
  | "confidence"
  | "status"
  | "rule_key"
  | "source"
>;

// ---------------------------------------------------------------------------
// Message drafts
// ---------------------------------------------------------------------------

export type MessageKind =
  | "thank_you"
  | "linkedin_message"
  | "reconnection"
  | "advice_update"
  | "post_mission_reconnection"
  | "action_followup";

export type MessageTone = "professional" | "friendly" | "brief";

export interface MessageDraft {
  id: UUID;
  user_id: UUID;
  contact_id: UUID;
  meeting_id: UUID | null;
  follow_up_task_id: UUID | null;
  kind: MessageKind;
  tone: MessageTone;
  channel: "email" | "linkedin";
  subject: string;
  body: string;
  /** Draft lifecycle only. Whether it was sent lives in `sent_at`. */
  status: "draft" | "discarded";
  sent_at: ISODateTime | null;
  generated_by: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type MessageDraftInput = Pick<
  MessageDraft,
  | "contact_id"
  | "meeting_id"
  | "follow_up_task_id"
  | "kind"
  | "tone"
  | "channel"
  | "subject"
  | "body"
  | "generated_by"
>;

// ---------------------------------------------------------------------------
// Relationship history, insights, research
// ---------------------------------------------------------------------------

export type InteractionKind =
  | "contact_created"
  | "outreach_sent"
  | "reply_received"
  | "meeting_scheduled"
  | "meeting_completed"
  | "message_sent"
  | "follow_up_completed"
  | "note";

export interface Interaction {
  id: UUID;
  user_id: UUID;
  contact_id: UUID;
  meeting_id: UUID | null;
  kind: InteractionKind;
  occurred_at: ISODateTime;
  summary: string;
  created_at: ISODateTime;
}

export type InteractionInput = Pick<
  Interaction,
  "contact_id" | "meeting_id" | "kind" | "occurred_at" | "summary"
>;

export interface CareerInsight {
  id: UUID;
  user_id: UUID;
  contact_id: UUID;
  meeting_id: UUID | null;
  summary_id: UUID | null;
  insight: string;
  topic: string;
  source_quote: string;
  created_at: ISODateTime;
}

export type CareerInsightInput = Pick<
  CareerInsight,
  "contact_id" | "meeting_id" | "summary_id" | "insight" | "topic" | "source_quote"
>;

export interface CompanyResearch {
  id: UUID;
  user_id: UUID;
  company_name: string;
  notes: string;
  summary: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}
