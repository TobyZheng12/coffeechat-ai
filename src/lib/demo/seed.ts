import { MockProvider } from "@/lib/ai/mock";
import type { Repository } from "@/lib/data/repository";
import { addDays, todayIn } from "@/lib/domain/dates";
import type { AppContext } from "@/lib/services/context";
import { prepareCoffeeChat } from "@/lib/services/contacts";
import { generateDraft, markDraftSent } from "@/lib/services/drafts";
import { saveMeetingNotes } from "@/lib/services/meetings";
import { saveProfile } from "@/lib/services/profile";

/**
 * Seeds a demo workspace with ENTIRELY FICTIONAL people, companies, and
 * conversations. Nothing here comes from real networking data.
 *
 * It replays the real workflow (services + offline AI) with backdated clocks,
 * so the demo shows exactly what the product produces.
 */

const DAY = 24 * 60 * 60 * 1000;

export const DEMO_PROFILE = {
  full_name: "Jordan Lin",
  preferred_name: "Jordan",
  hometown: "Hangzhou, China",
  school: "Westbrook University",
  major: "Global Supply Chain Management",
  background:
    "I completed a procurement internship at Granite Machinery this summer, where I worked on supplier cost analysis.",
  interests: ["Management consulting", "Supply chain", "Corporate strategy", "US-China business"],
  target_companies: ["Northwind Consulting", "Harborview Advisory", "Brightline Retail", "Summit Apparel"],
  career_goals:
    "Understand which careers fit my strengths and build relationships that last beyond the next recruiting cycle.",
  intro_pitch: "",
  native_language: "Mandarin Chinese",
  english_second_language: true,
  timezone: "America/Denver",
  mission_start: "",
  mission_end: "",
  mission_location: "",
  mission_disclosure: "when_relevant" as const,
};

const MAYA = {
  full_name: "Maya Patel",
  linkedin_url: "https://www.linkedin.com/in/example-maya-patel",
  how_connected: "Westbrook alumni group on LinkedIn",
  linkedin_profile_text: `Maya Patel
Senior Consultant, Supply Chain & Operations at Northwind Consulting
Chicago, Illinois

About
I help industrial companies redesign how they source, make, and move products. Westbrook University alum and proud first-generation college graduate.

Experience
Senior Consultant
Northwind Consulting · Full-time
Jan 2022 - Present
Lead supplier strategy and network design projects for manufacturing clients.
Procurement Analyst
Granite Machinery · Full-time
Jun 2018 - Dec 2021
Managed supplier negotiations and should-cost models for engine components.

Education
Westbrook University
Bachelor of Science, Global Supply Chain Management
2014 - 2018`,
  email_thread_text: `Hi Jordan — always happy to talk with a fellow Westbrook supply chain student. I made the jump from procurement to consulting, so I know how confusing it can feel. Does next Tuesday at 10am MT work? — Maya`,
};

const MAYA_NOTES = `Maya walked me through her move from procurement at Granite Machinery into consulting.
Said the key is learning to structure problems before jumping into analysis.
Recommended practicing case interviews with a partner twice a week.
She suggested reading "The Pyramid Principle" to improve my written communication.
Offered to introduce me to Daniel Okafor on the strategy team at Brightline Retail.
She has two kids and still runs the Westbrook alumni 5K every fall.
I'll send her my resume this week.
Suggested I reconnect after my mission to talk about recruiting timelines.`;

const DANIEL = {
  full_name: "Daniel Okafor",
  linkedin_url: "https://www.linkedin.com/in/example-daniel-okafor",
  how_connected: "Introduced by Maya Patel",
  linkedin_profile_text: `Daniel Okafor
Manager, Corporate Strategy at Brightline Retail
Minneapolis, Minnesota

Experience
Manager, Corporate Strategy
Brightline Retail · Full-time
Aug 2023 - Present
Own the long-range plan for private-label growth and supplier partnerships.
Associate
Summit Advisory · Full-time
Jul 2019 - Jul 2023
Strategy and operations projects for retail and consumer goods clients, including two years based in Singapore.

Education
Lakeshore University
MBA
2017 - 2019
Westbrook University
Bachelor of Arts, Economics
2011 - 2015`,
  email_thread_text: `Jordan, Maya speaks highly of you. Happy to share what it's like moving from consulting into a corporate strategy team. 30 minutes on Thursday works. — Daniel`,
};

const ELENA = {
  full_name: "Elena Rossi",
  linkedin_url: "https://www.linkedin.com/in/example-elena-rossi",
  how_connected: "Met at the Westbrook supply chain career fair",
  linkedin_profile_text: `Elena Rossi
Director of Global Sourcing at Summit Apparel
Portland, Oregon

Experience
Director of Global Sourcing
Summit Apparel · Full-time
Mar 2021 - Present
Lead a sourcing team across Vietnam, China, and Mexico.
Supplier Development Manager
Summit Apparel · Full-time
Jan 2015 - Feb 2021
Based in Shanghai. Built supplier quality and capacity programs with factories across East China.

Education
Westbrook University
Master of Science, Supply Chain Management
2012 - 2014`,
  email_thread_text: `Hi Jordan, it was nice meeting you at the career fair. I have 15 minutes on Monday if you'd like to chat about sourcing careers. — Elena`,
};

const ELENA_NOTES = `Elena spent six years running supplier development in Shanghai before moving to Portland.
Said Mandarin is a real advantage in sourcing roles, but only with strong analytical skills.
Recommended I learn SQL and get comfortable with landed cost models.
She loves hiking with her dog on weekends.
Happy to help review my resume when recruiting starts.`;

const KENJI = {
  full_name: "Kenji Watanabe",
  linkedin_url: "https://www.linkedin.com/in/example-kenji-watanabe",
  how_connected: "Cold outreach on LinkedIn",
  linkedin_profile_text: `Kenji Watanabe
Associate, Supply Chain Risk Advisory at Harborview Advisory
Denver, Colorado

Experience
Associate, Risk Advisory
Harborview Advisory · Full-time
Sep 2024 - Present
Help clients map supplier risk and build resilience plans.

Education
Westbrook University
Bachelor of Science, Global Supply Chain Management
2020 - 2024`,
  email_thread_text: "",
};

export async function seedDemoWorkspace(repo: Repository, now = new Date()): Promise<void> {
  const ai = new MockProvider();
  const at = (offsetDays: number, hourUtc = 18) => {
    const d = new Date(now.getTime() + offsetDays * DAY);
    d.setUTCHours(hourUtc, 0, 0, 0);
    return d;
  };
  const ctxAt = (d: Date): AppContext => ({ repo, ai, aiDailyLimit: 1000, now: () => d });
  const today = todayIn(DEMO_PROFILE.timezone, now);

  await saveProfile(ctxAt(now), {
    ...DEMO_PROFILE,
    // Showcases mission-aware planning with a fictional upcoming commitment.
    mission_start: addDays(today, 79),

  });

  // 1. Maya — completed chat, thank-you sent, follow-ups in progress.
  const maya = await prepareCoffeeChat(ctxAt(at(-21)), {
    ...MAYA,
    scheduled_at: at(-9, 16).toISOString(),
    duration_minutes: 30,
  });
  await repo.addInteraction({ contact_id: maya.contactId, meeting_id: null, kind: "outreach_sent", occurred_at: at(-21).toISOString(), summary: "Initial outreach sent on LinkedIn" });
  await repo.addInteraction({ contact_id: maya.contactId, meeting_id: null, kind: "reply_received", occurred_at: at(-18).toISOString(), summary: "Maya replied and offered times" });
  await saveMeetingNotes(ctxAt(at(-9, 17)), maya.meetingId, { body: MAYA_NOTES });
  const mayaThanks = await generateDraft(ctxAt(at(-9, 20)), { contact_id: maya.contactId, meeting_id: maya.meetingId, kind: "thank_you", tone: "friendly" });
  await markDraftSent(ctxAt(at(-8, 15)), mayaThanks.draft.id);

  // 2. Daniel — introduced by Maya, chat in two days with a full script.
  const daniel = await prepareCoffeeChat(ctxAt(at(-6)), {
    ...DANIEL,
    scheduled_at: at(2, 16).toISOString(),
    duration_minutes: 30,
    focus: "How he decided to move from consulting into corporate strategy",
  });
  await repo.addInteraction({ contact_id: daniel.contactId, meeting_id: null, kind: "reply_received", occurred_at: at(-5).toISOString(), summary: "Daniel replied to Maya's introduction" });

  // 3. Elena — chat yesterday, thank-you drafted but not yet sent.
  const elena = await prepareCoffeeChat(ctxAt(at(-12)), {
    ...ELENA,
    scheduled_at: at(-1, 17).toISOString(),
    duration_minutes: 15,
  });
  await saveMeetingNotes(ctxAt(at(-1, 18)), elena.meetingId, { body: ELENA_NOTES });
  await generateDraft(ctxAt(at(-1, 19)), { contact_id: elena.contactId, meeting_id: elena.meetingId, kind: "thank_you", tone: "professional" });

  // 4. Kenji — just added, analysis ready, no time set yet.
  await prepareCoffeeChat(ctxAt(at(-2)), { ...KENJI, duration_minutes: 15 });
}
