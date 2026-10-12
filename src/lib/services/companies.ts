import { isOpen } from "@/lib/domain/followups";
import { type AppContext, loadProfile, todayFor } from "./context";

/** Companies are derived from your contacts — no separate data entry. */
export async function listCompanies(ctx: AppContext) {
  const [contacts, meetings, insights] = await Promise.all([
    ctx.repo.listContacts(),
    ctx.repo.listMeetings(),
    ctx.repo.listInsights(),
  ]);
  const map = new Map<string, { name: string; contacts: number; conversations: number; insights: number; industry: string }>();
  for (const c of contacts) {
    if (!c.current_company.trim()) continue;
    const key = c.current_company.trim().toLowerCase();
    const e = map.get(key) ?? { name: c.current_company.trim(), contacts: 0, conversations: 0, insights: 0, industry: c.industry };
    e.contacts++;
    e.conversations += meetings.filter((m) => m.contact_id === c.id && m.status === "completed").length;
    e.insights += insights.filter((i) => i.contact_id === c.id).length;
    map.set(key, e);
  }
  return Array.from(map.values()).sort((a, b) => b.contacts - a.contacts || a.name.localeCompare(b.name));
}

export async function getCompanyView(ctx: AppContext, companyName: string) {
  const key = companyName.trim().toLowerCase();
  const profile = await loadProfile(ctx);
  const [all, meetings, insights, tasks, summaries, research] = await Promise.all([
    ctx.repo.listContacts(),
    ctx.repo.listMeetings(),
    ctx.repo.listInsights(),
    ctx.repo.listFollowUps(),
    ctx.repo.listSummaries({}),
    ctx.repo.getCompanyResearch(companyName),
  ]);
  const contacts = all.filter((c) => c.current_company.trim().toLowerCase() === key);
  // Also people who USED to work there, from their extracted experience.
  const alumni = [];
  for (const c of all) {
    if (contacts.includes(c)) continue;
    const exp = await ctx.repo.listExperiences(c.id);
    const past = exp.find((e) => e.kind === "work" && e.organization.trim().toLowerCase() === key);
    if (past) alumni.push({ contact: c, role: past.title, period: [past.start_label, past.end_label].filter(Boolean).join(" – ") });
  }
  const ids = new Set(contacts.map((c) => c.id));
  const name = new Map(all.map((c) => [c.id, c.full_name]));
  return {
    name: contacts[0]?.current_company.trim() ?? research?.company_name ?? alumni[0]?.contact.current_company ?? companyName,
    today: todayFor(ctx, profile),
    contacts,
    alumni,
    conversations: meetings
      .filter((m) => ids.has(m.contact_id) && m.status === "completed")
      .map((m) => ({ meeting: m, contactName: name.get(m.contact_id)!, summary: summaries.find((s) => s.meeting_id === m.id)?.summary ?? "" })),
    advice: insights.filter((i) => ids.has(i.contact_id)).map((i) => ({ ...i, contactName: name.get(i.contact_id)! })),
    openTasks: tasks.filter((t) => ids.has(t.contact_id) && isOpen(t)).map((t) => ({ ...t, contact_name: name.get(t.contact_id)!, contact_company: "" })),
    research,
  };
}
