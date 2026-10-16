import type { ISODate, Profile } from "@/lib/domain/types";
import { DATE_RANGE, type NormalizedProfile, naturalList, type ProfileExperience, sameOrg, spokenOrg } from "./normalize";

/**
 * Builds a 20–30 second spoken introduction (about 45–65 words) from verified
 * profile facts, tailored to the person you're meeting. Used by the offline
 * templates directly and as the safety fallback for any AI provider.
 */

export interface IntroContact {
  company?: string;
  title?: string;
  industry?: string;
  /** The contact's pasted profile text, used only to rank which of your details are most relevant. */
  text?: string;
}

export interface ComposedIntro {
  text: string;
  words: number;
  origin: "yours" | "generated";
  experience: ProfileExperience | null;
  interests: string[];
  warnings: string[];
}

export const INTRO_MAX_WORDS = 65;

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function article(word: string) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Lowercases ordinary role words but keeps acronyms ("SAP Analyst" → "SAP analyst"). */
function roleWords(title: string) {
  return title
    .split(/\s+/)
    .map((w) => (/^[A-Z0-9&]{2,}$/.test(w) ? w : w.toLowerCase()))
    .join(" ");
}

function whenPhrase(e: ProfileExperience, today: ISODate): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (e.current) return "Right now";
  if (e.season === "summer" && !e.year && /\b(?:this|this past|last)\s+summer\b/i.test(e.source)) {
    return /\blast summer\b/i.test(e.source) ? "Last summer" : "This past summer";
  }
  if (e.season === "summer" && e.year === year && month >= 8) return "This past summer";
  if (e.season === "summer" && e.year === year - 1) return "Last summer";
  if (e.season && e.year) return `In ${cap(e.season)} ${e.year}`;
  return "";
}

function relevance(e: ProfileExperience, contactText: string, today: ISODate): number {
  const t = contactText.toLowerCase();
  let score = 0;
  for (const w of `${e.field} ${e.title}`.toLowerCase().split(/\W+/)) if (w.length > 3 && t.includes(w)) score += 3;
  if (e.orgSpoken && t.includes(e.orgSpoken.toLowerCase())) score += 4;
  if (e.kind === "internship") score += 2;
  if (e.kind === "job") score += 1;
  if (e.year && Number(today.slice(0, 4)) - e.year <= 1) score += 1;
  return score;
}

function experienceSentence(e: ProfileExperience, np: NormalizedProfile, today: ISODate, withCity: boolean): string {
  const org = np.school && sameOrg(e.org, np.school.value) ? np.school.spoken : e.orgSpoken;
  const city = withCity && e.location ? ` in ${e.location.split(",")[0].trim()}` : "";
  const when = whenPhrase(e, today);
  if (e.kind === "internship") {
    const what = e.field ? `${article(e.field)} ${e.field} internship` : "an internship";
    return when && when !== "Right now" ? `${when}, I did ${what} at ${org}${city}.` : `I did ${what} at ${org}${city}.`;
  }
  const role = e.title ? roleWords(e.title) : "";
  if (e.current) return role ? `Right now, I'm also ${article(role)} ${role} at ${org}.` : `Right now, I'm also working at ${org}.`;
  return role ? `I worked as ${article(role)} ${role} at ${org}${city}.` : `I worked at ${org}${city}.`;
}

/** Orders interests so the ones related to this contact come first. */
function rankInterests(interests: string[], contactText: string): string[] {
  const t = contactText.toLowerCase();
  const key = (i: string) => i.split(" ")[0].slice(0, 6);
  return [...interests].sort((a, b) => Number(t.includes(key(b))) - Number(t.includes(key(a))));
}

export function composeIntroduction(
  np: NormalizedProfile,
  profile: Pick<Profile, "intro_pitch">,
  contact: IntroContact,
  today: ISODate,
): ComposedIntro {
  const warnings = [...np.warnings];
  if (profile.intro_pitch.trim()) {
    const text = profile.intro_pitch.trim();
    return { text, words: wordCount(text), origin: "yours", experience: null, interests: [], warnings: [] };
  }

  const contactText = [contact.company, contact.title, contact.industry, contact.text].filter(Boolean).join(" \n");
  const name = np.name?.value;
  const study =
    np.major && np.school
      ? `I study ${np.major.value} at ${np.school.spoken}`
      : np.school
        ? `I'm a student at ${np.school.spoken}`
        : np.major
          ? `I study ${np.major.value}`
          : "I'm a student";

  const exp = [...np.experiences].sort((a, b) => relevance(b, contactText, today) - relevance(a, contactText, today))[0] ?? null;
  const interests = rankInterests(np.interests.map((i) => i.value), contactText).slice(0, 3);
  const atCo = contact.company ? ` at ${spokenOrg(contact.company)}` : "";
  const learn = (withCo: boolean) => `I'd love to learn from your experience${withCo ? atCo : ""}`;
  const interestSentence = (withCo: boolean) =>
    interests.length
      ? exp && (exp.kind === "internship" || exp.kind === "job") && exp.field
        ? `That experience made me curious about ${naturalList(interests)}, and ${learn(withCo)}.`
        : `Right now I'm exploring ${naturalList(interests)}, and ${learn(withCo)}.`
      : `I'm exploring different career paths, and ${learn(withCo)}.`;

  const build = (opts: { hometown: boolean; city: boolean; company: boolean }) => {
    const s1 = name
      ? `I'm ${name}${opts.hometown && np.hometown ? `, originally from ${np.hometown.value},` : ""} and ${study}.`
      : `${cap(study)}.`;
    const s2 = exp ? experienceSentence(exp, np, today, opts.city) : "";
    return [s1, s2, interestSentence(opts.company)].filter(Boolean).join(" ").replace(/\s{2,}/g, " ");
  };

  // Shorten step by step until it fits a ~25 second read.
  const attempts = [
    { hometown: true, city: true, company: true },
    { hometown: true, city: false, company: true },
    { hometown: false, city: false, company: true },
    { hometown: false, city: false, company: false },
  ];
  let text = build(attempts[0]);
  for (const a of attempts) {
    text = build(a);
    if (wordCount(text) <= INTRO_MAX_WORDS) break;
  }
  if (!exp && !np.warnings.some((w) => w.startsWith("Couldn't read"))) {
    warnings.push("Add one experience (for example an internship) to your Background so your introduction can mention it.");
  }
  if (!interests.length) warnings.push("Add a few career interests so your introduction says what you're exploring.");
  return { text, words: wordCount(text), origin: "generated", experience: exp, interests, warnings };
}

// ---------------------------------------------------------------------------
// Validation shared by every provider
// ---------------------------------------------------------------------------

const ARTIFACTS: [RegExp, string][] = [
  [/\blogo\b/i, "contains “logo” from a pasted profile"],
  [/\b(?:show all|see more|show more|see less)\b/i, "contains a LinkedIn button label"],
  [/\s·\s|·/, "contains a “·” separator from pasted text"],
  [/\b\d+\s*(?:mos|yrs?)\b/i, "contains LinkedIn tenure like “3 mos”"],
  [/\b(?:Full-time|Part-time|On-site)\b/, "contains employment-type metadata"],
  [/\bHybrid\b/, "contains work-mode metadata"],
  [/(?:^|[\s,:])[-–•]\s+[a-z]/, "contains bullet-list dashes"],
  [DATE_RANGE, "contains a raw date range"],
];

/**
 * Returns human-readable problems with a piece of spoken text; empty = OK.
 * `rawSources` are long pasted fields (e.g. your Background) that must never be
 * read aloud verbatim.
 */
export function spokenTextIssues(text: string, rawSources: string[] = [], maxWords = 90): string[] {
  const issues = ARTIFACTS.filter(([re]) => re.test(text)).map(([, why]) => why);
  if (wordCount(text) > maxWords) issues.push(`is too long to say in about 30 seconds (${wordCount(text)} words)`);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const t = ` ${norm(text)} `;
  for (const src of rawSources) {
    const words = norm(src).split(" ");
    if (words.length < 12) continue;
    for (let i = 0; i + 8 <= words.length; i++) {
      if (t.includes(` ${words.slice(i, i + 8).join(" ")} `)) {
        issues.push("copies your pasted Background word for word");
        return issues;
      }
    }
  }
  return issues;
}
