/**
 * Profile normalization: turns what you pasted (source material) into small,
 * verified facts that are safe to use in spoken language.
 *
 * Shared by every script provider (offline templates and Claude). It never
 * modifies stored data — it only reads it.
 *
 * Design rules:
 *  - Conservative: when a passage can't be interpreted confidently, it is left
 *    out and a warning explains what to fill in, instead of guessing.
 *  - Targeted: only well-known platform artifacts are removed (e.g. a line that
 *    is exactly "Show all", " · Part-time", "· 3 mos"); ordinary words are never
 *    blanket-replaced.
 *  - Traceable: every fact keeps the source text it came from.
 */

import type { Profile } from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Platform artifacts (LinkedIn copy-paste)
// ---------------------------------------------------------------------------

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE_POINT = `(?:${MONTH}\\s+)?\\d{4}`;
/** "Aug 2026 - Present", "Jun 2019 – Dec 2021", "2014 - 2018" */
export const DATE_RANGE = new RegExp(`(${DATE_POINT})\\s*[-–—]\\s*(present|${DATE_POINT})`, "i");
/** " · 3 mos", " · 1 yr 2 mos", " · 2 yrs" (platform-generated tenure) */
const TENURE = /\s*·\s*(?:\d+\s*(?:yrs?|years?)\s*)?(?:\d+\s*(?:mos?|months?))?\s*$/i;
const EMPLOYMENT_TYPE =
  /\s*·\s*(full-time|part-time|internship|contract|freelance|self-employed|seasonal|apprenticeship|temporary)\s*$/i;
const WORK_MODE = /\s*·\s*(hybrid|remote|on-site|onsite)\s*$/i;
/** Whole lines that are UI controls, never content. */
const UI_LINE =
  /^(?:show all(?: \d+ \w+)?|show more|show less|see more|see less|…\s*see more|\.\.\.\s*see more|show credential|endorse|message|follow|following|connect|more|logo|activity|\d+\s+(?:endorsements?|connections?|followers?|comments?|reposts?))\s*[→>]?$/i;
const BULLET = /^\s*(?:[-–—•*·▪●◦]|\d+[.)])\s+/;

export function stripBullet(s: string): string {
  return s.replace(BULLET, "").trim();
}

export interface CleanLine {
  text: string;
  /** The untouched original line, for traceability. */
  source: string;
  employmentType?: string;
  workMode?: string;
}

/** Removes known artifacts from one line; returns null for UI-only lines. */
export function cleanLine(raw: string): CleanLine | null {
  const source = raw.trim();
  let text = stripBullet(source);
  if (!text || UI_LINE.test(text)) return null;
  let employmentType: string | undefined;
  let workMode: string | undefined;
  // Order matters: tenure comes last on date lines, type/mode last on org/location lines.
  for (let i = 0; i < 3; i++) {
    const before = text;
    text = text.replace(TENURE, (m) => (/\d/.test(m) ? "" : m));
    const et = text.match(EMPLOYMENT_TYPE);
    if (et) {
      employmentType = et[1].toLowerCase();
      text = text.slice(0, et.index).trim();
    }
    const wm = text.match(WORK_MODE);
    if (wm) {
      workMode = wm[1].toLowerCase();
      text = text.slice(0, wm.index).trim();
    }
    if (text === before) break;
  }
  text = text.replace(/\s{2,}/g, " ").trim();
  if (!text) return null;
  return { text, source, employmentType, workMode };
}

/** "Brigham Young University logo" → the organization name, else null. */
export function logoHeading(line: string): string | null {
  const m = line.trim().match(/^(.+?)\s+logo$/i);
  return m ? m[1].trim() : null;
}

/**
 * Splits pasted text into logical lines. Handles normal multi-line pastes and
 * "flattened" pastes where line breaks were lost, by breaking only at
 * unambiguous LinkedIn boundaries (logo headings, date ranges, " · " labels).
 */
export function splitSegments(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    const looksFlattened = line.length > 120 && (/\blogo\b/i.test(line) || / · /.test(line) || DATE_RANGE.test(line));
    if (!looksFlattened) {
      out.push(line);
      continue;
    }
    const broken = line
      // after "X logo"
      .replace(/(\S)\s+logo\s+/gi, "$1 logo\n")
      // before and after a date range (+ optional tenure)
      .replace(new RegExp(`\\s+(${DATE_POINT}\\s*[-–—]\\s*(?:present|${DATE_POINT})(?:\\s*·\\s*(?:\\d+\\s*(?:yrs?|mos?)\\s*)+)?)\\s*`, "gi"), "\n$1\n")
      // after an employment-type or work-mode label
      .replace(/(·\s*(?:full-time|part-time|internship|contract|freelance|self-employed|seasonal|hybrid|remote|on-site))\s+/gi, "$1\n");
    out.push(...broken.split("\n").map((l) => l.trim()).filter(Boolean));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Organizations, schools, degrees
// ---------------------------------------------------------------------------

const LEGAL_SUFFIX = /,?\s+(?:inc\.?|incorporated|llc|l\.l\.c\.|ltd\.?|limited|corp\.?|corporation|co\.|plc|gmbh|s\.a\.)$/i;

/** "Caterpillar Inc." → "Caterpillar"; "Caterpillar's China R&D Center" → "Caterpillar". */
export function spokenOrg(org: string): string {
  let s = org.trim().replace(/\s+logo$/i, "");
  const possessive = s.match(/^([A-Z][\w&.-]*(?:\s[A-Z][\w&.-]*){0,3})['’]s\s+\S/);
  if (possessive) s = possessive[1];
  for (let i = 0; i < 2; i++) s = s.replace(LEGAL_SUFFIX, "").trim();
  return s;
}

export function sameOrg(a: string, b: string): boolean {
  const n = (s: string) => spokenOrg(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const x = n(a);
  const y = n(b);
  return !!x && !!y && (x === y || (x.length >= 5 && y.startsWith(`${x} `)) || (y.length >= 5 && x.startsWith(`${y} `)));
}

/**
 * "Brigham Young University Marriott School of Business" →
 *   { name: "Brigham Young University", spoken: "BYU" }
 * Only drops a trailing sub-unit ("X School of …", "College of …") and only
 * abbreviates multi-word "<Name> <Name> University" forms, which are
 * conventionally spoken as initials. Everything else is kept as written.
 */
export function normalizeSchool(raw: string): { name: string; spoken: string } | null {
  const s = raw.replace(/\s+logo$/i, "").replace(/\s{2,}/g, " ").trim();
  if (!s) return null;
  const m = s.match(/^(.+?\b(?:University|College|Institute of Technology|Polytechnic))\b\s+(.+)$/);
  const name = m && /\b(?:School|College|Faculty|Department|Academy)\s+(?:of|for)\b|\bSchool$/i.test(m[2]) ? m[1].trim() : s;
  const words = name.split(" ");
  const abbreviate =
    words.length >= 3 &&
    words.length <= 4 &&
    words.at(-1) === "University" &&
    words.slice(0, -1).every((w) => /^[A-Z][a-z]+$/.test(w));
  const spoken = abbreviate ? `${words.slice(0, -1).map((w) => w[0]).join("")}U` : name;
  return { name, spoken };
}

const DEGREE_PREFIX =
  /^(?:(?:BS|B\.S\.|BSc|BA|B\.A\.|BBA|MS|M\.S\.|MSc|MA|MBA|PhD|Ph\.D\.)\b\.?|(?:bachelor|master)(?:['’]s)?(?:\s+degree)?(?:\s+of\s+(?:science|arts|business administration))?)\s*(?:,|:|-|in\b)?\s*/i;
const DEGREE_SUFFIX = /,\s*(?:BS|B\.S\.|BA|B\.A\.|BBA|MS|MBA|bachelor['’]?s?(?: degree)?)\.?$/i;

/** "BS Global Supply Chain Management" → { degree: "BS", field: "Global Supply Chain Management" } */
export function normalizeMajor(raw: string): { field: string; degree: string | null } | null {
  let s = stripBullet(raw).trim();
  if (!s) return null;
  let degree: string | null = null;
  const pre = s.match(DEGREE_PREFIX);
  if (pre && pre[0].trim()) {
    degree = pre[0].replace(/[,:-]|\bin\b/gi, "").trim() || null;
    s = s.slice(pre[0].length).trim();
  }
  const suf = s.match(DEGREE_SUFFIX);
  if (suf) {
    degree = degree ?? suf[0].replace(/^,\s*/, "").trim();
    s = s.slice(0, suf.index).trim();
  }
  return s ? { field: s, degree } : null;
}

// ---------------------------------------------------------------------------
// Experiences
// ---------------------------------------------------------------------------

export type ExperienceKind = "internship" | "job" | "research" | "volunteer" | "other";

export interface ProfileExperience {
  title: string;
  org: string;
  orgSpoken: string;
  location: string;
  period: string;
  kind: ExperienceKind;
  /** e.g. "procurement" from "Procurement Intern" or "a procurement internship" */
  field: string;
  current: boolean;
  season: string | null;
  year: number | null;
  /** The exact pasted text this experience was read from. */
  source: string;
}

const SEASON = /\b(spring|summer|fall|autumn|winter)\b(?:\s+(?:of\s+)?(\d{4}))?/i;
const ROLE_WORD =
  /\b(intern(?:ship)?|assistant|analyst|associate|consultant|manager|engineer|specialist|coordinator|director|lead|officer|representative|researcher|buyer|planner|developer|designer|accountant|advisor|president|founder|teaching|tutor|volunteer|fellow)\b/i;
const NON_FIELD = new Set(["summer", "research", "student", "the", "a", "an", "global", "senior", "junior"]);

function kindOf(title: string, employmentType?: string): ExperienceKind {
  const t = `${title} ${employmentType ?? ""}`.toLowerCase();
  if (/\bintern(ship)?\b/.test(t)) return "internship";
  if (/\bresearch\b/.test(t)) return "research";
  if (/\bvolunteer\b/.test(t)) return "volunteer";
  return title ? "job" : "other";
}

function fieldOf(title: string): string {
  const words = title
    .replace(/\b(intern(?:ship)?|assistant|analyst|associate|specialist|coordinator|manager|lead|senior|junior|student)\b/gi, " ")
    .replace(/[^A-Za-z&\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !NON_FIELD.has(w.toLowerCase()));
  return words.slice(0, 3).join(" ").toLowerCase();
}

function seasonFromPeriod(period: string): { season: string | null; year: number | null; current: boolean } {
  const current = /present/i.test(period);
  const s = period.match(SEASON);
  if (s) return { season: s[1].toLowerCase(), year: s[2] ? Number(s[2]) : null, current };
  const m = period.match(DATE_RANGE);
  if (!m) {
    const y = period.match(/\b(20\d{2})\b/);
    return { season: null, year: y ? Number(y[1]) : null, current };
  }
  const monthIdx = (txt: string) => {
    const mm = txt.match(new RegExp(`^(${MONTH})`, "i"));
    return mm ? ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(mm[1].slice(0, 3).toLowerCase()) : -1;
  };
  const start = monthIdx(m[1]);
  const end = /present/i.test(m[2]) ? -1 : monthIdx(m[2]);
  const year = Number((m[2].match(/\d{4}/) ?? m[1].match(/\d{4}/))![0]);
  const summer = start >= 4 && start <= 7 && end >= 6 && end <= 8;
  return { season: summer ? "summer" : null, year, current };
}

/** Reads LinkedIn-style blocks: [logo] / Title / Org · Type / Dates · tenure / Location · Mode. */
export function parseLinkedInExperiences(text: string): ProfileExperience[] {
  const segs = splitSegments(text);
  const knownOrgs = segs.map(logoHeading).filter((x): x is string => !!x);
  const lines = segs
    .map((raw) => ({ raw, logo: logoHeading(raw), clean: cleanLine(raw) }))
    .filter((l) => l.logo || l.clean);
  const out: ProfileExperience[] = [];

  lines.forEach((l, idx) => {
    if (!l.clean || l.logo) return;
    const dm = l.clean.text.match(DATE_RANGE);
    if (!dm || dm.index !== 0) return;
    const period = dm[0];
    // Walk back over the org line and the title line.
    const prev1 = lines[idx - 1];
    const prev2 = lines[idx - 2];
    let title = "";
    let org = "";
    let employmentType: string | undefined;
    if (prev1?.clean && !prev1.logo && !DATE_RANGE.test(prev1.clean.text)) {
      employmentType = prev1.clean.employmentType;
      const known = knownOrgs.find((o) => prev1.clean!.text.endsWith(o) && prev1.clean!.text !== o);
      if (known) {
        // Flattened "Research Assistant Brigham Young University …"
        title = prev1.clean.text.slice(0, -known.length).trim();
        org = known;
      } else if (prev2?.clean && !prev2.logo && !DATE_RANGE.test(prev2.clean.text)) {
        org = prev1.clean.text;
        title = prev2.clean.text;
      } else if (prev2?.logo) {
        // "X logo" / Title / dates (org given only by the logo heading)
        org = prev2.logo;
        title = prev1.clean.text;
      }
    }
    if (!org || !title || title.length > 80 || !/[A-Za-z]/.test(org)) return;
    // Location line right after the dates.
    const next = lines[idx + 1];
    const location =
      next?.clean && !next.logo && (next.clean.workMode || /^[A-Z][\w .'-]+,\s*[A-Z][\w .'-]+(?:,\s*[A-Z][\w .'-]+)?$/.test(next.clean.text))
        ? next.clean.text
        : "";
    const s = seasonFromPeriod(period);
    out.push({
      title,
      org,
      orgSpoken: spokenOrg(org),
      location,
      period,
      kind: kindOf(title, employmentType),
      field: fieldOf(title),
      current: s.current,
      season: s.season,
      year: s.year,
      source: [prev2?.raw, prev1?.raw, l.raw, location ? next?.raw : ""].filter(Boolean).join("\n"),
    });
  });
  return out;
}

/**
 * Reads plain sentences like "Completed a procurement internship at
 * Caterpillar's China Research and Development Center in Wuxi in summer 2026."
 */
export function parseSentenceExperiences(text: string): ProfileExperience[] {
  const out: ProfileExperience[] = [];
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => stripBullet(s).trim())
    .filter((s) => s.length > 10 && s.length < 300);
  for (const s of sentences) {
    if (!ROLE_WORD.test(s) || !/\bat\s+[A-Z]/.test(s) || DATE_RANGE.test(s) || / · /.test(s)) continue;
    const orgM = s.match(/\bat\s+((?:[A-Z][\w&.'’-]*)(?:\s+(?:[A-Z][\w&.'’-]*|and|of|for|&))*)/);
    if (!orgM) continue;
    const org = orgM[1].replace(/\s+(?:and|of|for|&)$/, "").replace(/[.,]$/, "").trim();
    const after = s.slice(orgM.index! + orgM[0].length);
    const locM = after.match(/^\s+in\s+([A-Z][A-Za-z]+(?:,?\s+[A-Z][A-Za-z]+){0,2})/);
    const location = locM && !SEASON.test(locM[1]) && !/^\d/.test(locM[1]) ? locM[1] : "";
    const before = s.slice(0, orgM.index);
    const internM = before.match(/\b([a-z][a-z&-]*(?:\s+[a-z][a-z&-]*)?)\s+internship\b/i);
    const asM = before.match(/\bas\s+an?\s+([A-Za-z][\w &-]+?)\s*$/i);
    const roleWord = before.match(ROLE_WORD);
    const kind: ExperienceKind = /intern/i.test(before) ? "internship" : /research/i.test(before) ? "research" : "job";
    const title = asM ? asM[1] : internM ? `${internM[1]} intern` : roleWord ? roleWord[1] : "";
    const field = internM ? internM[1].toLowerCase().split(/\s+/).filter((w) => !NON_FIELD.has(w)).join(" ") : fieldOf(title);
    const sm = s.match(SEASON);
    out.push({
      title,
      org,
      orgSpoken: spokenOrg(org),
      location,
      period: sm ? sm[0] : (s.match(/\b20\d{2}\b/)?.[0] ?? ""),
      kind,
      field,
      current: /\b(currently|now)\b/i.test(s),
      season: sm ? sm[1].toLowerCase() : null,
      year: sm?.[2] ? Number(sm[2]) : s.match(/\b(20\d{2})\b/) ? Number(s.match(/\b(20\d{2})\b/)![1]) : null,
      source: s,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Interests
// ---------------------------------------------------------------------------

/** Canonical spoken topics. An item can map to several ("strategy consulting"). */
const TOPICS: [RegExp, string][] = [
  [/\bconsult/i, "consulting"],
  [/\bstrateg/i, "strategy"],
  [/\bsupply[\s-]chain|\blogistics\b/i, "supply chain"],
  [/\bprocurement|\bsourcing|\bpurchasing\b/i, "procurement"],
  [/\boperations\b/i, "operations"],
  [/\binternational business\b|\bglobal business\b|\bus-china\b|\bcross-border\b/i, "international business"],
  [/\bfinance\b|\binvestment\b|\bbanking\b/i, "finance"],
  [/\bmarketing\b|\bbrand\b/i, "marketing"],
  [/\bproduct management\b/i, "product management"],
  [/\bdata\b|\banalytics\b/i, "analytics"],
  [/\baccounting\b|\baudit\b/i, "accounting"],
  [/\bleadership\b/i, "leadership"],
];

export function normalizeInterests(items: string[]): { value: string; source: string }[] {
  const out: { value: string; source: string }[] = [];
  const add = (value: string, source: string) => {
    if (!out.some((o) => o.value === value)) out.push({ value, source });
  };
  for (const raw of items.flatMap((i) => i.split(/\r?\n/))) {
    const item = stripBullet(raw).replace(/[.;]+$/, "").trim();
    if (!item) continue;
    const hits = TOPICS.filter(([re]) => re.test(item)).map(([, v]) => v);
    if (hits.length) hits.forEach((h) => add(h, raw.trim()));
    else if (item.split(/\s+/).length <= 4) add(item.toLowerCase(), raw.trim());
  }
  return out;
}

/** "a", "a and b", "a, b, and c" */
export function naturalList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

// ---------------------------------------------------------------------------
// The normalized profile
// ---------------------------------------------------------------------------

export interface Fact {
  value: string;
  source: string;
}

export interface NormalizedProfile {
  name: Fact | null;
  hometown: Fact | null;
  school: (Fact & { spoken: string }) | null;
  degree: string | null;
  major: Fact | null;
  experiences: ProfileExperience[];
  interests: Fact[];
  /** Things we couldn't read safely — shown to the user for review. */
  warnings: string[];
}

export function normalizeProfile(p: Pick<Profile, "full_name" | "preferred_name" | "hometown" | "school" | "major" | "background" | "interests">): NormalizedProfile {
  const warnings: string[] = [];
  const first = (p.full_name || "").trim().split(/\s+/)[0] ?? "";
  const nameVal = (p.preferred_name || first).trim();
  const home = stripBullet(p.hometown.split(/\r?\n/)[0] ?? "").trim();
  const school = normalizeSchool(p.school.split(/\r?\n/)[0] ?? "");
  const major = normalizeMajor(p.major.split(/\r?\n/)[0] ?? "");

  const background = p.background ?? "";
  const fromBlocks = parseLinkedInExperiences(background);
  const fromSentences = parseSentenceExperiences(background);
  const experiences = [...fromBlocks];
  for (const e of fromSentences) if (!experiences.some((x) => sameOrg(x.org, e.org))) experiences.push(e);

  if (!nameVal) warnings.push("Add your name or preferred name.");
  if (!school) warnings.push("Add your school so your introduction can say where you study.");
  if (!major) warnings.push("Add your major so your introduction can say what you study.");
  if (background.trim() && experiences.length === 0) {
    warnings.push(
      "Couldn't read a specific experience from your Background. Add one sentence like “I did a procurement internship at Caterpillar in Wuxi in summer 2026,” or write your own spoken introduction.",
    );
  }
  return {
    name: nameVal ? { value: nameVal, source: p.preferred_name ? p.preferred_name : p.full_name } : null,
    hometown: home ? { value: home, source: p.hometown } : null,
    school: school ? { value: school.name, spoken: school.spoken, source: p.school } : null,
    degree: major?.degree ?? null,
    major: major ? { value: major.field, source: p.major } : null,
    experiences,
    interests: normalizeInterests(p.interests),
    warnings,
  };
}
