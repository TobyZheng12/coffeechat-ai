import { addDays } from "@/lib/domain/dates";
import type { Profile } from "@/lib/domain/types";
import type { AIProvider } from "./provider";
import type {
  ContactAnalysisAI,
  DraftAI,
  KnowledgeAI,
  NotesAI,
  QuestionAI,
  ScriptAI,
} from "./schemas";
import { composeIntroduction } from "@/lib/profile/introduction";
import { cleanLine, DATE_RANGE, logoHeading, normalizeMajor, normalizeProfile, normalizeSchool, sameOrg, splitSegments, spokenOrg } from "@/lib/profile/normalize";
import { TASKS, type AITaskKind, type AITaskMap, type DraftMessageInput, type GenerateScriptInput } from "./tasks";

/**
 * Offline, deterministic "AI" built from templates and simple text heuristics.
 *
 * Used for: automated tests, the public demo (no API cost, no key exposure),
 * and local development before an Anthropic key is configured. It only ever
 * quotes text that exists in the input, so grounding checks pass honestly.
 */
export class MockProvider implements AIProvider {
  readonly label = "Offline templates (no AI)";
  readonly offline = true;

  async run<K extends AITaskKind>(kind: K, input: AITaskMap[K]["input"]): Promise<AITaskMap[K]["output"]> {
    const handlers: { [P in AITaskKind]: (i: AITaskMap[P]["input"]) => AITaskMap[P]["output"] } = {
      analyze_contact: (i) => mockAnalyze(i.profile, i.contact),
      generate_script: mockScript,
      regenerate_question: (i) => mockRegenerate(i),
      process_notes: (i) => mockNotes(i.notes, i.contact.full_name, i.today),
      draft_message: mockDraft,
      answer_from_notes: mockAnswer,
    };
    const out = (handlers[kind] as (i: AITaskMap[K]["input"]) => AITaskMap[K]["output"])(input);
    // Same validation path as real AI output.
    return TASKS[kind].schema.parse(out);
  }
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------


function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function sentences(text: string): string[] {
  return text
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/^[-•*]\s*/, ""))
    .filter((s) => s.length > 3);
}

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] ?? full;
}

interface ParsedRole {
  organization: string;
  title: string;
  start_label: string;
  end_label: string;
  description: string;
}

/**
 * Parses LinkedIn-style "Title / Company · Full-time / Jan 2020 - Present"
 * blocks, after removing platform artifacts ("X logo", "Show all", tenure,
 * employment type, work mode) with the shared profile normalizer.
 */
export function parseRoles(text: string): ParsedRole[] {
  const ls = splitSegments(text)
    .filter((l) => !logoHeading(l))
    .map(cleanLine)
    .filter((l): l is NonNullable<ReturnType<typeof cleanLine>> => !!l);
  const roles: ParsedRole[] = [];
  const isLocation = (l: (typeof ls)[number] | undefined) =>
    !!l && (!!l.workMode || /^[A-Z][\w .'-]+,\s*[A-Z][\w .'-]+(?:,\s*[A-Z][\w .'-]+)?$/.test(l.text));
  ls.forEach((line, idx) => {
    const m = line.text.match(DATE_RANGE);
    if (!m || m.index !== 0 || idx < 2) return;
    const [start, end] = m[0].split(/\s*[-–—]\s*/);
    const orgLine = ls[idx - 1].text;
    const titleLine = ls[idx - 2].text;
    if (DATE_RANGE.test(orgLine) || DATE_RANGE.test(titleLine) || isLocation(ls[idx - 2])) return;
    const after = isLocation(ls[idx + 1]) ? ls[idx + 2] : ls[idx + 1];
    roles.push({
      organization: orgLine,
      title: titleLine,
      start_label: start.trim(),
      end_label: end.trim(),
      // A long line after the dates/location is the role description (titles and org names are short).
      description: after && !DATE_RANGE.test(after.text) && after.text.length > 40 ? after.text.slice(0, 160) : "",
    });
  });
  return roles;
}

function sectionText(text: string, heading: RegExp, stop: RegExp): string {
  const ls = text.split(/\r?\n/);
  const start = ls.findIndex((l) => heading.test(l.trim()));
  if (start < 0) return "";
  const rest = ls.slice(start + 1);
  const end = rest.findIndex((l) => stop.test(l.trim()));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

function lineContaining(text: string, term: string): string | null {
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const hit = sentences(text).find((s) => re.test(s));
  if (!hit) return null;
  // Keep the evidence short: a window of words around the term.
  const words = hit.split(/\s+/);
  const i = words.findIndex((w) => re.test(w)) ;
  const from = Math.max(0, (i < 0 ? 0 : i) - 6);
  return words.slice(from, from + 14).join(" ");
}

// ---------------------------------------------------------------------------
// analyze_contact
// ---------------------------------------------------------------------------

function mockAnalyze(profile: Profile, c: AITaskMap["analyze_contact"]["input"]["contact"]): ContactAnalysisAI {
  const all = [c.linkedin_profile_text, c.linkedin_experience_text, c.linkedin_education_text].join("\n");
  const expText = c.linkedin_experience_text || sectionText(all, /^experience$/i, /^(education|skills|licenses|volunteer)/i) || all;
  const eduText = c.linkedin_education_text || sectionText(all, /^education$/i, /^(skills|licenses|volunteer|experience)/i);

  const roles = parseRoles(expText).filter((r) => !/university|college|school/i.test(r.organization));
  // LinkedIn lists education as School / Degree / years — the reverse of roles.
  const education = parseRoles(eduText).map((r) => ({ ...r, organization: r.title, title: r.organization }));
  if (education.length === 0 && eduText) {
    const ls = lines(eduText);
    for (let i = 0; i < ls.length; i++) {
      if (/university|college|school|institute/i.test(ls[i])) {
        education.push({ organization: ls[i], title: ls[i + 1] && !DATE_RANGE.test(ls[i + 1]) ? ls[i + 1] : "", start_label: "", end_label: "", description: "" });
      }
    }
  }

  const current = roles[0];
  const company = c.current_company || current?.organization || "";
  const position = c.current_position || current?.title || "";
  const name = firstName(c.full_name);

  const sources = [all, c.email_thread_text].join("\n");
  // Real connections only: the same school, the same employer, or the same
  // hometown city. A company on your target list, or a broad term both profiles
  // mention ("supply chain"), is NOT a shared experience.
  const me = normalizeProfile(profile);
  const connections: { point: string; evidence: string }[] = [];
  if (me.school) {
    const theirSchool = education.find((e) => sameOrg(normalizeSchool(e.organization)?.name ?? e.organization, me.school!.value));
    const ev = theirSchool && lineContaining(sources, theirSchool.organization);
    if (ev) connections.push({ point: `${name} also went to ${me.school.value}.`, evidence: ev });
  }
  for (const mine of me.experiences) {
    const theirs = roles.find((r) => sameOrg(r.organization, mine.org));
    const ev = theirs && lineContaining(sources, theirs.organization);
    if (ev && !connections.some((x) => x.point.includes(mine.orgSpoken))) {
      connections.push({ point: `${name} also worked at ${mine.orgSpoken}.`, evidence: ev });
    }
  }
  const city = me.hometown?.value.split(",")[0].trim();
  if (city && city.length >= 4) {
    const ev = lineContaining(sources, city);
    if (ev) connections.push({ point: `${name} has ties to ${city}, where you're from.`, evidence: ev });
  }
  // Interests their work touches — an interest overlap, not shared experience.
  // Their headline (first lines of the profile) + titles describe what their work involves.
  const headline = lines(c.linkedin_profile_text).slice(0, 3).join(" ");
  const workText = [position, company, headline, ...roles.map((r) => r.title)].join(" ");
  const sharedInterests = me.interests
    .filter((i) => new RegExp(`\\b${i.value.split(" ")[0].slice(0, 6)}`, "i").test(workText))
    .slice(0, 2)
    .map((i) => ({ point: `${name}'s work involves ${i.value}, which you're interested in.`, evidence: lineContaining(sources, i.value.split(" ")[0].slice(0, 6)) ?? "" }))
    .filter((x) => x.evidence);

  const transitions: string[] = [];
  for (let i = 0; i < roles.length - 1; i++) {
    const to = roles[i];
    const from = roles[i + 1];
    if (to.organization !== from.organization) transitions.push(`Moved from ${from.organization} to ${to.organization}.`);
    else if (to.title !== from.title) transitions.push(`Promoted from ${from.title} to ${to.title} at ${to.organization}.`);
  }

  const missing: string[] = [];
  if (roles.length === 0) missing.push("Work history (paste the Experience section from LinkedIn)");
  if (education.length === 0) missing.push("Education history");
  if (!c.email_thread_text) missing.push("Email thread — helps personalize why you're connecting");

  return {
    extracted: {
      current_company: company,
      current_position: position,
      location: "",
      industry: /consult/i.test(all) ? "Consulting" : /supply chain|procurement|sourcing/i.test(all) ? "Supply chain" : "",
      experiences: roles.slice(0, 8),
      education: education.slice(0, 4),
    },
    headline_summary: position && company ? `${c.full_name} is ${article(position)} ${position} at ${company}.` : `${c.full_name}${company ? ` works at ${company}` : ""}.`,
    career_progression:
      roles.length > 1
        ? `Started as ${roles.at(-1)!.title} at ${roles.at(-1)!.organization} and is now ${position} at ${company}, across ${roles.length} roles.`
        : roles.length === 1
          ? `Currently ${position} at ${company}.`
          : "Not enough work history was provided to describe their career progression.",
    career_transitions: transitions.slice(0, 4),
    shared_interests: sharedInterests,
    connections_to_me: connections,
    topics_to_explore: [
      company && `What day-to-day work looks like at ${company}`,
      transitions[0] && `Why they made this move: ${transitions[0]}`,
      "What they look for in early-career candidates",
    ].filter(Boolean) as string[],
    recruiting_insights_to_ask: [
      company ? `How recruiting works for early-career roles at ${company}` : "How they recruited into their field",
      "Which experiences made the biggest difference in their own recruiting",
    ],
    missing_information: missing,
  };
}

function article(word: string) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

// ---------------------------------------------------------------------------
// generate_script / regenerate_question
// ---------------------------------------------------------------------------

interface ContactFacts {
  name: string;
  company: string;
  position: string;
  current: { org: string; title: string; start: string; description: string } | null;
  previous: { org: string; title: string } | null;
  school: { org: string; field: string } | null;
  sharedSchool: string | null;
  sharedEmployer: { org: string; mine: string } | null;
  interestMatch: string | null;
  source: string;
}

/** Everything the templates are allowed to say about the contact — all verified from their pasted profile. */
function contactFacts(i: GenerateScriptInput): ContactFacts {
  const c = i.contact;
  const me = normalizeProfile(i.profile);
  const clean = (s: string) => cleanLine(s.replace(/\s+logo$/i, ""))?.text ?? "";
  const work = i.experiences.filter((e) => e.kind === "work").map((e) => ({ ...e, organization: clean(e.organization), title: clean(e.title) }));
  const edu = i.experiences.filter((e) => e.kind === "education");
  const company = spokenOrg(c.current_company || work[0]?.organization || "");
  const position = clean(c.current_position || work[0]?.title || "");
  const cur = work[0] ?? null;
  const prev = work.find((e) => e.organization && company && !sameOrg(e.organization, company)) ?? null;
  const school = edu[0] ? { org: normalizeSchool(edu[0].organization)?.name ?? edu[0].organization, field: normalizeMajor(edu[0].title)?.field ?? "" } : null;
  const sharedSchool = me.school && edu.some((e) => sameOrg(normalizeSchool(e.organization)?.name ?? e.organization, me.school!.value)) ? me.school.value : null;
  let sharedEmployer: ContactFacts["sharedEmployer"] = null;
  for (const mine of me.experiences) {
    const theirs = work.find((w) => sameOrg(w.organization, mine.org));
    if (theirs) {
      sharedEmployer = { org: spokenOrg(theirs.organization), mine: mine.title ? mine.title.toLowerCase() : mine.kind === "internship" ? "intern" : "team member" };
      break;
    }
  }
  const headline = c.linkedin_profile_text.split(/\r?\n/).filter(Boolean).slice(0, 3).join(" ");
  const workText = [position, company, headline, ...work.map((w) => w.title)].join(" ");
  const interestMatch = me.interests.map((x) => x.value).find((v) => new RegExp(`\\b${v.split(" ")[0].slice(0, 6)}`, "i").test(workText)) ?? null;
  return {
    name: firstName(c.full_name),
    company,
    position,
    current: cur ? { org: cur.organization, title: cur.title, start: cur.start_label, description: cur.description } : null,
    previous: prev ? { org: spokenOrg(prev.organization), title: prev.title } : null,
    school,
    sharedSchool,
    sharedEmployer,
    interestMatch,
    source: [c.linkedin_profile_text, c.linkedin_experience_text, c.linkedin_education_text].join("\n"),
  };
}

/** A short verbatim fragment of the line that mentions `needle` (for evidence). */
function quoteFor(source: string, needle: string): QuestionAI["evidence"] {
  if (!needle) return [];
  const line = source.split(/\r?\n/).find((l) => l.toLowerCase().includes(needle.toLowerCase()));
  if (!line) return [];
  const fragment = line.split(" · ")[0].trim().split(/\s+/).slice(0, 18).join(" ");
  return fragment ? [{ quote: fragment, source: "linkedin" }] : [];
}

interface Candidate {
  q: QuestionAI;
  score: number;
  slot: "journey" | "deep" | "advice" | "extra";
}

function cand(slot: Candidate["slot"], score: number, section: QuestionAI["section"], question: string, short_version: string, why: string, follow_up: string, evidence: QuestionAI["evidence"] = []): Candidate {
  return { slot, score, q: { section, question, short_version, why_relevant: why, follow_up, priority: 2, evidence, include_in_short_call: false, is_alternate: false } };
}

function scriptCandidates(f: ContactFacts, i: GenerateScriptInput): Candidate[] {
  const me = normalizeProfile(i.profile);
  const at = f.company ? ` at ${f.company}` : "";
  const role = f.position ? `${article(f.position)} ${f.position}` : "";
  const year = Number(i.today.slice(0, 4));
  const startYear = Number(f.current?.start.match(/\d{4}/)?.[0] ?? NaN);
  const out: Candidate[] = [];

  // Career journey — at most one of these makes the short plan.
  // If their previous employer is also where the student worked, ask ONE merged question.
  const sharedIsPrevious = !!(f.sharedEmployer && f.previous && sameOrg(f.sharedEmployer.org, f.previous.org));
  if (f.previous && f.company && sharedIsPrevious) {
    out.push(cand("journey", 11, "career_journey", `You were at ${f.previous.org} before ${f.company}. What made you decide to make that move?`, `Shared ${f.previous.org} → ${f.company}`, "A real shared experience and a real career decision in one question.", `What from your time at ${f.previous.org} still helps you today?`, quoteFor(f.source, f.previous.org)));
  } else if (f.previous && f.company) {
    out.push(cand("journey", 9, "career_journey", `You moved from ${f.previous.org} to ${f.company}. What made you decide to make that change?`, `Why ${f.previous.org} → ${f.company}`, "A real career decision from their profile — it shows what they value.", `What skills from ${f.previous.org} still help you today?`, quoteFor(f.source, f.previous.org)));
  }
  if (f.school?.field && f.company) {
    out.push(cand("journey", 6, "career_journey", `You studied ${f.school.field}. How did that lead you to ${f.company}?`, "From school to this career", "Connects their education to their career, which is useful for your own planning.", "Was this the path you expected when you were in school?", quoteFor(f.source, f.school.field)));
  }
  out.push(cand("journey", 5, "career_journey", f.company ? `How did you first get interested in working${at}?` : "How did you first get into this kind of work?", "How they got started", "An easy opening question that lets them tell their story.", "Was it what you expected at the beginning?", quoteFor(f.source, f.position || f.company)));
  if (Number.isFinite(startYear) && year - startYear >= 3) {
    out.push(cand("journey", 4, "career_journey", `You've been${at} since ${startYear}. What has kept you there?`, "What has kept them there", "Long tenure usually means they've found something they value.", "How has your role changed over that time?", quoteFor(f.source, String(startYear))));
  }

  // Deep dive — ask about responsibilities instead of assuming them.
  if (f.sharedEmployer && !sharedIsPrevious) {
    out.push(cand("deep", 10, "deep_dive", `We both have a connection to ${f.sharedEmployer.org}. What was your experience there like, and what did you learn from it?`, `Shared: ${f.sharedEmployer.org}`, "A real shared experience — the most personal question you can ask.", "Is there anything you wish you had known when you started there?", quoteFor(f.source, f.sharedEmployer.org)));
  }
  if (f.sharedSchool) {
    out.push(cand("deep", 8, "deep_dive", `I saw that you also went to ${f.sharedSchool}. Which classes or experiences there helped you most in your career?`, `Shared school: ${f.sharedSchool}`, "You went to the same school, so their advice applies directly to you.", "Is there anything you'd do differently as a student there?", quoteFor(f.source, f.sharedSchool.split(" ")[0])));
  }
  if (f.current?.description) {
    const topic = f.current.description.split(/[.;]/)[0].trim();
    out.push(cand("deep", 7, "deep_dive", `Your profile mentions: “${topic.length > 90 ? `${topic.slice(0, 89)}…` : topic}.” What does that work look like in practice?`, "What their projects involve", "Builds on something they wrote themselves.", "What part of that work do you find most interesting?", quoteFor(f.source, topic.split(" ").slice(0, 4).join(" "))));
  }
  out.push(cand("deep", 6, "deep_dive", role ? `What kinds of projects do you usually work on as ${role}?` : `What kinds of projects do you usually work on${at}?`, "Typical projects", "We don't know their exact responsibilities, so this asks instead of assuming.", "Which part of that work do you enjoy most?", quoteFor(f.source, f.position)));
  if (f.interestMatch) {
    out.push(cand("deep", 5, "deep_dive", `I'm interested in ${f.interestMatch}. What do people usually misunderstand about ${f.interestMatch} work${at}?`, `Reality of ${f.interestMatch}`, `Their work touches ${f.interestMatch}, which you want to learn about.`, "What skills matter most for that kind of work?", quoteFor(f.source, f.interestMatch.split(" ")[0])));
  }
  out.push(cand("deep", 3, "deep_dive", "What is a challenge in your work that people outside your team might not see?", "A hidden challenge", "Shows the real job behind the title.", "How do you usually handle it?"));

  // Career advice — tied to the student's own situation.
  const major = me.major?.value;
  out.push(cand("advice", 7, "career_advice", `If you were a ${major ? `${major} ` : ""}student today, what would you focus on to prepare for work like yours?`, "What to focus on now", "Turns their experience into concrete next steps for you.", "Are there classes, projects, or skills that helped you most?"));
  if (f.company) {
    out.push(cand("advice", 5, "career_advice", `What do you think matters most when someone early in their career applies to ${f.company}?`, `Recruiting at ${f.company}`, "Recruiting advice from someone who knows the company.", "When should students start preparing?"));
  }
  out.push(cand("advice", 3, "career_advice", "Looking back, what advice would you give yourself as a student?", "Advice to their younger self", "Honest lessons are often the most useful advice.", ""));

  // Extras for the bank.
  out.push(cand("extra", 2, "deep_dive", "What skills have you built the most since you started?", "Skills built", "Shows how people grow in this field.", "How did you build them?"));
  out.push(cand("extra", 2, "deep_dive", "What do the strongest people on your team have in common?", "What strong teammates share", "Reveals what success looks like there.", ""));
  out.push(cand("extra", 1, "closing", "Is there anything I didn't ask that you think I should know?", "Anything I missed?", "Gives them room to share what matters most to them.", ""));
  return out;
}

/** Picks a realistic plan: 15 min → 3 main questions; 30+ min → 6. The rest go to the bank. */
function planQuestions(cands: Candidate[], minutes: number): QuestionAI[] {
  const best = (slot: Candidate["slot"]) => cands.filter((c) => c.slot === slot).sort((a, b) => b.score - a.score);
  const core = [best("journey")[0], best("deep")[0], best("advice")[0]].filter(Boolean) as Candidate[];
  const rest = cands.filter((c) => !core.includes(c)).sort((a, b) => b.score - a.score);
  const mainCount = minutes <= 15 ? 3 : minutes <= 20 ? 4 : 6;
  const main = [...core, ...rest.filter((c) => c.slot !== "extra")].slice(0, mainCount);
  return cands.map((c) => {
    const inCore = core.includes(c);
    const isMain = main.includes(c);
    return {
      ...c.q,
      priority: (inCore ? 1 : isMain ? 2 : 3) as 1 | 2 | 3,
      include_in_short_call: inCore,
      is_alternate: !isMain,
    };
  });
}

function mockScript(i: GenerateScriptInput): ScriptAI {
  const f = contactFacts(i);
  const me = normalizeProfile(i.profile);
  const name = f.name;
  const at = f.company ? ` at ${f.company}` : "";
  const intro = composeIntroduction(me, i.profile, { company: f.company, title: f.position, industry: "", text: f.source }, i.today);
  const topInterest = intro.interests[0];

  const why = f.sharedEmployer
    ? `I wanted to talk with you because I was ${article(f.sharedEmployer.mine)} ${f.sharedEmployer.mine} at ${f.sharedEmployer.org} too, and I'd love to hear where your path went from there.`
    : f.sharedSchool
      ? `I wanted to talk with you because you also went to ${f.sharedSchool}, and your path${at} is the kind of career I'm trying to understand.`
      : f.previous && f.company
        ? `I wanted to talk with you because you moved from ${f.previous.org} to ${f.company}, and I'm curious how you made that decision.`
        : f.interestMatch
          ? `I wanted to talk with you because your work in ${f.interestMatch}${at} is exactly what I'm hoping to learn about.`
          : f.position
            ? `I wanted to talk with you because I'd like to understand what working as ${article(f.position)} ${f.position}${at} is really like.`
            : `I wanted to talk with you because I'd like to learn about your work${at}.`;

  return {
    objectives: [
      f.previous ? `Understand why ${name} moved from ${f.previous.org} to ${f.company}` : `Understand how ${name} got to ${f.company || "this career"}`,
      `Learn what ${f.position ? `a ${f.position}` : "their role"} actually does day to day`,
      topInterest ? `Get advice on preparing for ${topInterest}` : "Get honest advice on what to focus on as a student",
    ],
    greeting: `Hi ${name}, it's great to meet you. Thank you for taking the time to talk with me today.`,
    why_connect: why,
    self_intro: intro.text,
    transition_to_questions: "I have a few questions, but I'm happy to follow wherever the conversation goes.",
    questions: planQuestions(scriptCandidates(f, i), i.durationMinutes),
    closing_thanks: `This was really helpful, ${name}. Thank you for your time and advice.`,
    referral_question:
      f.sharedEmployer || f.sharedSchool || i.durationMinutes > 15
        ? "Is there anyone else you think would be helpful for me to learn from as I explore this field?"
        : null,
    closing_reminder: "Watch the time, thank them by name, and mention one specific thing you'll act on.",
  };
}

function mockRegenerate(i: AITaskMap["regenerate_question"]["input"]): QuestionAI {
  // Offer a different, verified question from the same section that isn't already in the script.
  const f = contactFacts(i);
  const taken = new Set([...i.otherQuestions, i.current.question].map((x) => x.toLowerCase()));
  const pool = scriptCandidates(f, i)
    .map((c) => c.q)
    .filter((c) => c.section === i.current.section && !taken.has(c.question.toLowerCase()));
  const pick = pool[0] ?? scriptCandidates(f, i).map((c) => c.q).find((c) => !taken.has(c.question.toLowerCase()));
  if (!pick) return i.current;
  return { ...pick, section: i.current.section, priority: i.current.priority, include_in_short_call: i.current.include_in_short_call, is_alternate: i.current.is_alternate };
}

// ---------------------------------------------------------------------------
// process_notes
// ---------------------------------------------------------------------------

const TOPICS: [RegExp, string][] = [
  [/case (interview|prep)|cases\b/i, "case interviews"],
  [/recruit|application|interview/i, "recruiting"],
  [/network/i, "networking"],
  [/communicat|present|speak/i, "communication"],
  [/excel|sql|data|analytics/i, "technical skills"],
  [/supply chain|procurement|sourcing|logistics/i, "supply chain"],
  [/consult/i, "consulting"],
  [/strategy/i, "corporate strategy"],
  [/lead/i, "leadership"],
];

function topicOf(s: string) {
  return TOPICS.find(([re]) => re.test(s))?.[1] ?? "career advice";
}

function mockNotes(notes: string, contactName: string, today: string): NotesAI {
  const ss = sentences(notes);
  const advice: NotesAI["advice"] = [];
  const actions: NotesAI["action_items"] = [];
  const insights: string[] = [];
  const resources: NotesAI["resources"] = [];
  const intros: NotesAI["introductions_offered"] = [];
  const reconnect: NotesAI["reconnect_signals"] = [];
  let offeredHelp = false;

  for (const s of ss) {
    const lower = s.toLowerCase();
    if (/introduce|connect me with|put me in touch|intro to/.test(lower)) {
      const who = s.match(/(?:introduce me to|connect me with|put me in touch with|intro to)\s+([^.,;]+)/i)?.[1] ?? "someone on their team";
      intros.push({ person_or_role: who.trim(), note: s });
      offeredHelp = true;
      continue;
    }
    if (/reconnect|keep in touch|stay in touch|reach out (again|after|when)|follow up after/.test(lower)) {
      const timeframe = /mission/.test(lower)
        ? "after_mission"
        : /recruit/.test(lower)
          ? "after_recruiting"
          : /after (reading|finishing|i read|you read)/.test(lower)
            ? "after_resource"
            : /next month/.test(lower)
              ? "specific_date"
              : "general";
      reconnect.push({ phrase: s, timeframe, date: timeframe === "specific_date" ? addDays(today, 30) : null });
      continue;
    }
    if (/^(i('ll| will| promised| need to| should| said i'?d)|i'm going to)/i.test(s) || /\bi (promised|said i'?d|will send|'ll send)\b/i.test(s)) {
      const due = s.match(/(this week|next week|tomorrow|before (my|the) mission|in a month)/i)?.[0] ?? null;
      actions.push({ owner: "me", description: s.replace(/^i('ll| will)\s+/i, "").replace(/\.$/, ""), due_hint: due });
      continue;
    }
    if (/book|read |course|podcast|article/.test(lower)) {
      const quoted = s.match(/["“]([^"”]+)["”]/)?.[1];
      const named = quoted ?? s.match(/(?:book|reading|read|course|podcast)\s+(?:called\s+)?([A-Z][^.,;]+)/)?.[1];
      if (named) {
        const kind = /course/.test(lower) ? "course" : /podcast/.test(lower) ? "podcast" : /article/.test(lower) ? "article" : "book";
        resources.push({ name: named.trim(), kind, note: s });
      }
    }
    if (/recommend|suggest|advice|should|important|focus on|learn|practice|key is|advantage|^said\b/.test(lower)) {
      const text = s.replace(/^(said|she said|he said|they said)\s+/i, "");
      advice.push({ advice: text.charAt(0).toUpperCase() + text.slice(1), topic: topicOf(s), source_quote: s });
      const skill = s.match(/(?:recommended|suggested)\s+(?:learning|practicing|studying)\s+([^.,;]+)/i)?.[1];
      if (skill && !resources.some((r) => r.name === skill)) resources.push({ name: skill.trim(), kind: "skill", note: s });
      if (/happy to|anytime|feel free/.test(lower)) offeredHelp = true;
      continue;
    }
    if (/happy to help|reach out anytime|feel free to|offered/.test(lower)) {
      offeredHelp = true;
      continue;
    }
    if (/enjoy|loves?\b|family|kids|daughter|\bson\b|wife|husband|hobby|grew up|alma mater|hiking|climbing|marathon|runs the/.test(lower)) {
      insights.push(s);
    }
  }

  const topics = Array.from(new Set(advice.map((a) => a.topic)));
  return {
    summary: `Talked with ${contactName}. ${ss.slice(0, 3).join(" ")}`.slice(0, 600),
    key_points: ss.slice(0, 5),
    advice,
    action_items: actions,
    relationship_insights: insights,
    resources,
    introductions_offered: intros,
    reconnect_signals: reconnect,
    offered_further_help: offeredHelp,
    topics: topics.length ? topics : ["career exploration"],
  };
}

// ---------------------------------------------------------------------------
// draft_message
// ---------------------------------------------------------------------------

function mockDraft(i: DraftMessageInput): DraftAI {
  const name = firstName(i.contact.full_name);
  const me = i.profile.preferred_name || firstName(i.profile.full_name) || "";
  const advice = i.summary?.advice[0]?.advice;
  const intro = i.summary?.introductions_offered[0]?.person_or_role;
  const personal = i.summary?.relationship_insights[0];
  const details: string[] = [];

  const lines: string[] = [];
  const opener = i.tone === "professional" ? `Dear ${name},` : `Hi ${name},`;

  switch (i.kind) {
    case "thank_you":
    case "linkedin_message": {
      lines.push(
        i.tone === "brief"
          ? `Thank you again for talking with me${i.meetingDate ? "" : " recently"}.`
          : `Thank you so much for taking the time to talk with me${i.contact.current_company ? ` about your work at ${i.contact.current_company}` : ""}. I really enjoyed our conversation.`,
      );
      if (advice) {
        lines.push(`Your advice that ${lowerFirst(advice.replace(/\.$/, ""))} was especially helpful, and I'm planning to act on it.`);
        details.push(advice);
      }
      const res = i.summary?.resources[0];
      if (res && i.tone !== "brief") {
        lines.push(
          res.kind === "skill"
            ? `I'm going to follow your suggestion and start on ${res.name}.`
            : `I've added ${res.name} to my list and will start on it this week.`,
        );
        details.push(res.name);
      }
      if (intro) {
        lines.push(`I'd also be grateful for the introduction to ${intro} whenever it's convenient.`);
        details.push(intro);
      }
      if (personal && i.tone === "friendly") {
        lines.push(`It was fun to hear that ${lowerPronoun(personal.replace(/\.$/, ""))}.`);
        details.push(personal);
      }
      break;
    }
    case "advice_update":
    case "action_followup": {
      lines.push(`I wanted to share a quick update since we talked.`);
      if (i.userContext) {
        lines.push(i.userContext.trim());
        details.push(i.userContext.trim());
      }
      if (advice) {
        lines.push(`Your advice that ${lowerFirst(advice.replace(/\.$/, ""))} has stayed with me.`);
        details.push(advice);
      }
      lines.push("Thank you again for pointing me in the right direction.");
      break;
    }
    case "reconnection":
    case "post_mission_reconnection": {
      lines.push(
        i.kind === "post_mission_reconnection"
          ? `I hope you've been well! We spoke${i.meetingDate ? ` back in ${new Date(i.meetingDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}` : " a while ago"} before I left on my mission, and I've just returned.`
          : `I hope you've been well! We talked${i.meetingDate ? ` in ${new Date(i.meetingDate).toLocaleDateString("en-US", { month: "long" })}` : " a while ago"} about your work${i.contact.current_company ? ` at ${i.contact.current_company}` : ""}.`,
      );
      if (advice) {
        lines.push(`I still think about your advice that ${lowerFirst(advice.replace(/\.$/, ""))}.`);
        details.push(advice);
      }
      if (i.userContext) {
        lines.push(i.userContext.trim());
        details.push(i.userContext.trim());
      }
      lines.push("I'd love to hear what you've been working on lately.");
      break;
    }
  }

  const body = [opener, "", lines.join(" "), "", i.tone === "professional" ? "Best regards," : "Thanks again,", me].join("\n").trim();
  const subject =
    i.channel === "linkedin"
      ? ""
      : i.kind === "thank_you"
        ? "Thank you for your time"
        : i.kind === "post_mission_reconnection"
          ? "Reconnecting after a couple of years"
          : i.kind === "reconnection"
            ? "Reconnecting"
            : "A quick update";
  return { subject, body, details_used: details };
}

/** "She loves climbing" → "she loves climbing", but never lowercases a name. */
function lowerPronoun(s: string) {
  return /^(She|He|They|We)\b/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// answer_from_notes
// ---------------------------------------------------------------------------

function mockAnswer(i: AITaskMap["answer_from_notes"]["input"]): KnowledgeAI {
  if (i.sources.length === 0) {
    return { answer: "I couldn't find anything in your saved notes about that yet.", cited_source_ids: [], found_relevant_notes: false };
  }
  // One line per person, preferring their actual advice over summaries and raw notes.
  const rank = (label: string) => (/· advice/.test(label) ? 0 : /· notes/.test(label) ? 1 : /· summary/.test(label) ? 2 : 3);
  const byPerson = new Map<string, (typeof i.sources)[number]>();
  for (const s of [...i.sources].sort((a, b) => rank(a.label) - rank(b.label))) {
    const who = s.label.split(" · ")[0];
    if (!byPerson.has(who)) byPerson.set(who, s);
  }
  const picked = [...byPerson.entries()].slice(0, 5);
  const lines = picked.map(([who, s]) => `• ${who}: ${(sentences(s.text)[0] ?? s.text).replace(/\s*\(topic: [^)]*\)$/, "")}`);
  return {
    answer: `From your notes:\n${lines.join("\n")}`,
    cited_source_ids: picked.map(([, s]) => s.id),
    found_relevant_notes: true,
  };
}
