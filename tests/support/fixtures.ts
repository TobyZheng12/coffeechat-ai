import { MockProvider } from "@/lib/ai/mock";
import { MemoryRepository, MemoryStore } from "@/lib/data/memory";
import type { AppContext } from "@/lib/services/context";
import type { AIProvider } from "@/lib/ai/provider";

export const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** A fixed "now" so date-based rules are deterministic: Oct 22 2026, 2pm Mountain. */
export const NOW = new Date("2026-10-22T20:00:00Z");

export function makeCtx(opts: { store?: MemoryStore; userId?: string; ai?: AIProvider; now?: Date } = {}): AppContext {
  const store = opts.store ?? new MemoryStore();
  return {
    repo: new MemoryRepository(store, opts.userId ?? USER_A),
    ai: opts.ai ?? new MockProvider(),
    aiDailyLimit: 50,
    now: () => opts.now ?? NOW,
  };
}

/** Fictional student profile used in tests (not a real person). */
export const STUDENT_PROFILE = {
  full_name: "Jordan Lin",
  preferred_name: "Jordan",
  hometown: "Hangzhou, China",
  school: "Westbrook University",
  major: "Global Supply Chain Management",
  background: "Completed a procurement internship at Granite Machinery in Summer 2026.",
  interests: ["Management consulting", "Supply chain", "Corporate strategy"],
  target_companies: ["Northwind Consulting", "Granite Machinery"],
  career_goals: "Explore which careers fit my strengths and build lasting relationships.",
  intro_pitch: "",
  native_language: "Mandarin Chinese",
  english_second_language: true,
  timezone: "America/Denver",
  mission_start: "2026-12-30",
  mission_end: "",
  mission_location: "",
  mission_disclosure: "when_relevant" as const,
};

export const SARAH_LINKEDIN = `Sarah Mitchell
Senior Consultant at Northwind Consulting | Supply Chain & Operations
Chicago, Illinois

About
I help manufacturers redesign their sourcing and supply chain strategy. Westbrook University alum.

Experience
Senior Consultant
Northwind Consulting · Full-time
Jan 2022 - Present
Lead supply chain strategy projects for industrial clients across North America.
Procurement Analyst
Granite Machinery · Full-time
Jun 2018 - Dec 2021
Managed supplier negotiations and cost analysis for heavy equipment components.

Education
Westbrook University
Bachelor of Science, Supply Chain Management
2014 - 2018`;

export const SARAH_EMAIL = `Hi Jordan, happy to chat! I remember being a student trying to figure out consulting. Does Thursday at 10am work? — Sarah`;

export const SARAH_NOTES = `Talked with Sarah at Northwind Consulting.
She started at Granite Machinery before consulting.
Said communication is important.
Recommended learning case interviews.
Mentioned she enjoyed Westbrook University.
Suggested I reconnect after my mission.`;
