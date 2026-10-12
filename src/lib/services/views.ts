import { dateOf, diffDays } from "@/lib/domain/dates";
import { bucketFollowUps, isOpen } from "@/lib/domain/followups";
import { lastContactDate, relationshipStrength, type RelationshipStrength } from "@/lib/domain/relationship";
import type {
  Contact,
  FollowUpTask,
  ISODate,
  Meeting,
  MeetingSummary,
  Profile,
  UUID,
} from "@/lib/domain/types";
import { NotFoundError } from "@/lib/data/repository";
import { type AppContext, loadProfile, nowOf, todayFor } from "./context";

/**
 * Read-only "view models" that pages render. Keeping aggregation here (not in
 * React components) keeps pages simple and lets tests check what users see.
 */

export type TaskWithContact = FollowUpTask & { contact_name: string; contact_company: string };

export interface ContactListItem {
  contact: Contact;
  strength: RelationshipStrength;
  lastContact: string | null;
  meetingsCompleted: number;
  nextFollowUp: FollowUpTask | null;
}

export async function listContactsView(ctx: AppContext, query?: string): Promise<ContactListItem[]> {
  const [contacts, meetings, interactions, tasks] = await Promise.all([
    ctx.repo.listContacts({ query }),
    ctx.repo.listMeetings(),
    ctx.repo.listInteractions(),
    ctx.repo.listFollowUps(),
  ]);
  return contacts.map((contact) => {
    const ms = meetings.filter((m) => m.contact_id === contact.id);
    const ins = interactions.filter((i) => i.contact_id === contact.id);
    const open = tasks.filter((t) => t.contact_id === contact.id && isOpen(t));
    return {
      contact,
      strength: relationshipStrength({ meetings: ms, interactions: ins }),
      lastContact: lastContactDate(ins),
      meetingsCompleted: ms.filter((m) => m.status === "completed").length,
      nextFollowUp: open.sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))[0] ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardView {
  profile: Profile;
  today: ISODate;
  upcoming: { meeting: Meeting; contact: Contact }[];
  followUps: ReturnType<typeof bucketFollowUps<TaskWithContact>>;
  recent: { meeting: Meeting; contact: Contact; summary: MeetingSummary | null }[];
  byCompany: { company: string; count: number; contacts: { id: UUID; name: string }[] }[];
  byIndustry: { industry: string; count: number }[];
  themes: { topic: string; count: number; example: string; contactName: string }[];
  progress: {
    missionStart: ISODate | null;
    daysUntilMission: number | null;
    contacts: number;
    chatsCompleted: number;
    chatsPlanned: number;
    thankYousSent: number;
    openFollowUps: number;
  };
  totals: { contacts: number; insights: number };
}

export async function getDashboard(ctx: AppContext): Promise<DashboardView> {
  const profile = await loadProfile(ctx);
  const today = todayFor(ctx, profile);
  const [contacts, meetings, tasks, summaries, drafts, insights] = await Promise.all([
    ctx.repo.listContacts(),
    ctx.repo.listMeetings(),
    ctx.repo.listFollowUps(),
    ctx.repo.listSummaries({}),
    ctx.repo.listDrafts(),
    ctx.repo.listInsights(),
  ]);
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const nowMs = nowOf(ctx).getTime();

  const upcoming = meetings
    .filter((m) => m.status === "planned" && byId.has(m.contact_id))
    .filter((m) => !m.scheduled_at || new Date(m.scheduled_at).getTime() > nowMs - 2 * 3600_000)
    .sort((a, b) => (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999"))
    .slice(0, 6)
    .map((m) => ({ meeting: m, contact: byId.get(m.contact_id)! }));

  const withContact: TaskWithContact[] = tasks
    .filter((t) => byId.has(t.contact_id))
    .map((t) => ({
      ...t,
      contact_name: byId.get(t.contact_id)!.full_name,
      contact_company: byId.get(t.contact_id)!.current_company,
    }));

  const latestSummary = new Map<string, MeetingSummary>();
  for (const s of summaries) if (!latestSummary.has(s.meeting_id)) latestSummary.set(s.meeting_id, s);

  const recent = meetings
    .filter((m) => m.status === "completed" && byId.has(m.contact_id))
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, 5)
    .map((m) => ({ meeting: m, contact: byId.get(m.contact_id)!, summary: latestSummary.get(m.id) ?? null }));

  const companies = new Map<string, { company: string; contacts: { id: UUID; name: string }[] }>();
  for (const c of contacts) {
    const key = (c.current_company || "Unknown company").trim();
    const entry = companies.get(key.toLowerCase()) ?? { company: key, contacts: [] };
    entry.contacts.push({ id: c.id, name: c.full_name });
    companies.set(key.toLowerCase(), entry);
  }
  const industries = new Map<string, number>();
  for (const c of contacts) {
    const k = c.industry || "Unspecified";
    industries.set(k, (industries.get(k) ?? 0) + 1);
  }

  const topicMap = new Map<string, { count: number; example: string; contactName: string }>();
  for (const i of insights) {
    const k = i.topic.toLowerCase() || "general";
    const e = topicMap.get(k);
    if (e) e.count++;
    else topicMap.set(k, { count: 1, example: i.insight, contactName: byId.get(i.contact_id)?.full_name ?? "" });
  }

  const ms = profile.mission_start;
  return {
    profile,
    today,
    upcoming,
    followUps: bucketFollowUps(withContact, today),
    recent,
    byCompany: Array.from(companies.values())
      .map((c) => ({ ...c, count: c.contacts.length }))
      .sort((a, b) => b.count - a.count || a.company.localeCompare(b.company)),
    byIndustry: Array.from(industries.entries())
      .map(([industry, count]) => ({ industry, count }))
      .sort((a, b) => b.count - a.count),
    themes: Array.from(topicMap.entries())
      .map(([topic, v]) => ({ topic, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    progress: {
      missionStart: ms,
      daysUntilMission: ms ? diffDays(ms, today) : null,
      contacts: contacts.length,
      chatsCompleted: meetings.filter((m) => m.status === "completed").length,
      chatsPlanned: meetings.filter((m) => m.status === "planned").length,
      thankYousSent: drafts.filter((d) => d.kind === "thank_you" && d.sent_at).length,
      openFollowUps: tasks.filter(isOpen).length,
    },
    totals: { contacts: contacts.length, insights: insights.length },
  };
}

// ---------------------------------------------------------------------------
// Contact profile + relationship timeline
// ---------------------------------------------------------------------------

export interface TimelineEvent {
  id: string;
  date: string;
  kind: string;
  title: string;
  detail: string;
  future: boolean;
  overdue?: boolean;
  href?: string;
}

export async function getContactView(ctx: AppContext, contactId: UUID) {
  const contact = await ctx.repo.getContact(contactId);
  if (!contact) throw new NotFoundError("Contact");
  const profile = await loadProfile(ctx);
  const today = todayFor(ctx, profile);
  const [experiences, meetings, interactions, tasks, drafts, summaries, insights] = await Promise.all([
    ctx.repo.listExperiences(contactId),
    ctx.repo.listMeetings({ contactId }),
    ctx.repo.listInteractions({ contactId }),
    ctx.repo.listFollowUps({ contactId }),
    ctx.repo.listDrafts({ contactId }),
    ctx.repo.listSummaries({ contactId }),
    ctx.repo.listInsights({ contactId }),
  ]);

  const timeline: TimelineEvent[] = [
    ...interactions.map((i) => ({
      id: i.id,
      date: i.occurred_at,
      kind: i.kind,
      title: i.summary,
      detail: "",
      future: false,
      href: i.meeting_id ? `/app/meetings/${i.meeting_id}` : undefined,
    })),
    ...meetings
      .filter((m) => m.status === "planned" && m.scheduled_at && dateOf(m.scheduled_at, profile.timezone) >= today)
      .map((m) => ({
        id: `m-${m.id}`,
        date: m.scheduled_at!,
        kind: "meeting_upcoming",
        title: `Upcoming: ${m.duration_minutes}-minute conversation`,
        detail: "",
        future: true,
        href: `/app/meetings/${m.id}`,
      })),
    ...tasks
      .filter((t) => isOpen(t) && t.due_date)
      .map((t) => ({
        id: `t-${t.id}`,
        date: `${t.due_date}T12:00:00Z`,
        kind: "follow_up_suggested",
        title: `${t.due_date! < today ? "Overdue follow-up" : "Suggested follow-up"}: ${t.title}`,
        detail: t.reason,
        future: true,
        overdue: t.due_date! < today,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return {
    contact,
    profile,
    today,
    experiences,
    meetings,
    tasks,
    drafts: drafts.filter((d) => d.status !== "discarded"),
    summaries,
    insights,
    timeline,
    strength: relationshipStrength({ meetings, interactions }),
    lastContact: lastContactDate(interactions),
  };
}

// ---------------------------------------------------------------------------
// Meeting page
// ---------------------------------------------------------------------------

export async function getMeetingView(ctx: AppContext, meetingId: UUID) {
  const meeting = await ctx.repo.getMeeting(meetingId);
  if (!meeting) throw new NotFoundError("Meeting");
  const contact = await ctx.repo.getContact(meeting.contact_id);
  if (!contact) throw new NotFoundError("Contact");
  const profile = await loadProfile(ctx);
  const [questions, notes, summaries, drafts, tasks] = await Promise.all([
    ctx.repo.listQuestions(meetingId),
    ctx.repo.listNotes(meetingId),
    ctx.repo.listSummaries({ meetingId }),
    ctx.repo.listDrafts({ meetingId }),
    ctx.repo.listFollowUps({ meetingId }),
  ]);
  return {
    meeting,
    contact,
    profile,
    today: todayFor(ctx, profile),
    questions,
    notes,
    summary: summaries[0] ?? null,
    summaryVersions: summaries.length,
    drafts: drafts.filter((d) => d.status !== "discarded"),
    tasks,
  };
}

// ---------------------------------------------------------------------------
// Follow-up dashboard
// ---------------------------------------------------------------------------

export async function getFollowUpBoard(ctx: AppContext) {
  const profile = await loadProfile(ctx);
  const today = todayFor(ctx, profile);
  const [tasks, contacts] = await Promise.all([ctx.repo.listFollowUps(), ctx.repo.listContacts({ includeArchived: true })]);
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const rows: TaskWithContact[] = tasks
    .filter((t) => byId.has(t.contact_id))
    .map((t) => ({ ...t, contact_name: byId.get(t.contact_id)!.full_name, contact_company: byId.get(t.contact_id)!.current_company }));
  return { today, profile, buckets: bucketFollowUps(rows, today), all: rows };
}
