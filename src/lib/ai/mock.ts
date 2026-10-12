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
import { TASKS, type AITaskKind, type AITaskMap, type DraftMessageInput, type GenerateScriptInput } from "./tasks";

/**
 * Offline, deterministic "AI" built from templates and simple text heuristics.
 *
 * Used for: automated tests, the public demo (no API cost, no key exposure),
 * and local development before an Anthropic key is configured. It only ever
 * quotes text that exists in the input, so grounding checks pass honestly.
 */
export class MockProvider implements AIProvider {
  readonly label = "Demo templates (offline)";
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

const DATE_RANGE =
  /^((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?\d{4}\s*[-–—]\s*(present|((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?\d{4})/i;

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

function stripEmploymentType(s: string) {
  return s.split("·")[0].trim();
}

interface ParsedRole {
  organization: string;
  title: string;
  start_label: string;
  end_label: string;
  description: string;
}

/** Parses LinkedIn-style "Title / Company · Full-time / Jan 2020 - Present" blocks. */
export function parseRoles(text: string): ParsedRole[] {
  const ls = lines(text);
  const roles: ParsedRole[] = [];
  ls.forEach((line, idx) => {
    const m = line.match(DATE_RANGE);
    if (!m || idx < 2) return;
    const [start, end] = m[0].split(/\s*[-–—]\s*/);
    const orgLine = ls[idx - 1];
    const titleLine = ls[idx - 2];
    if (DATE_RANGE.test(orgLine) || DATE_RANGE.test(titleLine)) return;
    const next = ls[idx + 1] ?? "";
    roles.push({
      organization: stripEmploymentType(orgLine),
      title: stripEmploymentType(titleLine),
      start_label: start.trim(),
      end_label: end.trim(),
      description: next && !DATE_RANGE.test(next) && next.length > 25 ? next.slice(0, 160) : "",
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

/**
 * Terms from the student's profile worth looking for in a contact's profile.
 * Labels are verb phrases that read correctly after a name or "you"
 * ("Maya went to…", "you went to…").
 */
function overlapTerms(p: Profile, contactCompany: string): { term: string; label: string }[] {
  const terms: { term: string; label: string }[] = [];
  const own = contactCompany.trim().toLowerCase();
  if (p.school) {
    terms.push({ term: p.school, label: `went to ${p.school}` });
    if (/brigham young/i.test(p.school)) terms.push({ term: "BYU", label: "studied at BYU" });
  }
  for (const company of [...extractOrgs(p.background), ...p.target_companies]) {
    if (company.trim().toLowerCase() === own) continue; // their own employer isn't a "connection"
    terms.push({ term: company, label: `worked with ${company}` });
  }
  for (const interest of p.interests) terms.push({ term: interest, label: `built experience in ${interest.toLowerCase()}` });
  for (const t of ["supply chain", "procurement", "sourcing", "China", "Mandarin", "consulting", "strategy"]) {
    terms.push({ term: t, label: `built experience in ${t}` });
  }
  if (p.hometown) terms.push({ term: p.hometown.split(",")[0], label: `spent time in ${p.hometown.split(",")[0]}` });
  return terms;
}

function extractOrgs(text: string): string[] {
  // "internship at Granite Machinery" → "Granite Machinery"
  const found = Array.from(text.matchAll(/\bat ((?:[A-Z][\w&.'-]*)(?:\s(?:[A-Z][\w&.'-]*|of|and))*)/g), (m) =>
    m[1].replace(/\s(of|and)$/, "").replace(/['’]s$/, ""),
  );
  return Array.from(new Set(found));
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
  const connections: { point: string; evidence: string }[] = [];
  const seen = new Set<string>();
  for (const { term, label } of overlapTerms(profile, c.current_company || roles[0]?.organization || "")) {
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    const ev = lineContaining(sources, term);
    if (ev) {
      seen.add(key);
      connections.push({ point: `${name} ${label}.`, evidence: ev });
    }
    if (connections.length >= 4) break;
  }

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
    shared_interests: connections.slice(0, 2),
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

function q(
  section: QuestionAI["section"],
  question: string,
  short_version: string,
  why_relevant: string,
  follow_up: string,
  priority: 1 | 2 | 3,
  evidence: QuestionAI["evidence"] = [],
  include_in_short_call = priority === 1,
  is_alternate = false,
): QuestionAI {
  return { section, question, short_version, why_relevant, follow_up, priority, evidence, include_in_short_call, is_alternate };
}

function mockScript(i: GenerateScriptInput): ScriptAI {
  const c = i.contact;
  const name = firstName(c.full_name);
  const me = i.profile.preferred_name || firstName(i.profile.full_name) || "there";
  const company = c.current_company || i.experiences.find((e) => e.kind === "work")?.organization || "your company";
  const position = c.current_position || i.experiences.find((e) => e.kind === "work")?.title || "your role";
  const work = i.experiences.filter((e) => e.kind === "work");
  const prev = work.find((e) => e.organization && e.organization !== company);
  const conn = c.analysis?.connections_to_me ?? [];
  const posEvidence = lineContaining(c.linkedin_profile_text + "\n" + c.linkedin_experience_text, position.split(" ")[0] ?? "");

  const questions: QuestionAI[] = [
    q(
      "career_journey",
      `To start, I'd love to hear how you ended up at ${company}. What led you to this path?`,
      `Path to ${company}`,
      "An easy, open question that lets them tell their story and sets a relaxed tone.",
      "Was this the career you expected when you were in school?",
      1,
      posEvidence ? [{ quote: posEvidence, source: "linkedin" }] : [],
    ),
    prev
      ? q(
          "career_journey",
          `I saw you were at ${prev.organization} before ${company}. What made you decide to make that move?`,
          `Why ${prev.organization} → ${company}`,
          "Career transitions show what they value and how they made big decisions.",
          "What surprised you most after the switch?",
          1,
          [{ quote: prev.organization, source: "linkedin" }],
        )
      : q(
          "career_journey",
          `What has surprised you most about working as ${article(position)} ${position}?`,
          "Biggest surprise in the role",
          "Shows the reality of the job beyond the title.",
          "Is that different from what you expected going in?",
          2,
        ),
    q(
      "deep_dive",
      `What does a typical week look like for you as ${article(position)} ${position}?`,
      "Typical week",
      "Helps you picture whether this work fits your strengths.",
      "Which part of the week do you enjoy most?",
      1,
    ),
    ...conn.slice(0, 2).map((cn, idx) =>
      q(
        "deep_dive",
        `I noticed that ${cn.point.replace(/\.$/, "").replace(new RegExp(`^${name}\\s`), "you ")}. How has that shaped the way you work today?`,
        cn.point.replace(new RegExp(`^${name}\\s`), "").slice(0, 60),
        "This is a real connection between your backgrounds, so it makes the conversation more personal.",
        "Is there anything from that experience you'd recommend I learn early?",
        idx === 0 ? 1 : 2,
        [{ quote: cn.evidence, source: "linkedin" }],
      ),
    ),
    q(
      "deep_dive",
      `What kinds of problems are you most excited to work on at ${company} right now?`,
      "Exciting problems now",
      "Shows what the work is really about and what skills matter.",
      "What makes someone great at solving those problems?",
      2,
    ),
    q(
      "career_advice",
      `If you were a ${i.profile.major || "business"} student today, what would you focus on to prepare for a career like yours?`,
      "What to focus on as a student",
      "Directly connects their experience to your next steps.",
      "Are there classes, projects, or skills that helped you most?",
      1,
    ),
    q(
      "career_advice",
      `For someone early in their career, which experiences matter most when recruiting at a company like ${company}?`,
      "What matters in recruiting",
      "Recruiting insight from someone who has been through it.",
      "When do you think students should start preparing?",
      2,
    ),
    q(
      "closing",
      "Is there anything I didn't ask that you think I should know?",
      "Anything I missed?",
      "Gives them room to share what they think matters most.",
      "",
      3,
      [],
      false,
    ),
    q("deep_dive", "What skills have you developed the most since you started?", "Skills developed", "Shows how people grow in this field.", "How did you build them?", 3, [], false, true),
    q("career_advice", "Looking back, is there anything you wish you had done differently early on?", "Wish I'd done differently", "Honest lessons are often the most useful advice.", "", 3, [], false, true),
    q("deep_dive", "What do the best people on your team have in common?", "What great teammates share", "Reveals what success looks like in their environment.", "", 3, [], false, true),
  ];

  const school = i.profile.school ? ` at ${i.profile.school}` : "";
  const intro =
    i.profile.intro_pitch ||
    `A little about me: I'm ${me}${i.profile.hometown ? `, originally from ${i.profile.hometown}` : ""}, and I study ${i.profile.major || "business"}${school}. ${
      i.profile.background ? `${i.profile.background.split(/(?<=\.)\s/)[0]} ` : ""
    }Right now I'm exploring different career paths, and I'm especially curious about ${
      i.profile.interests.slice(0, 2).join(" and ").toLowerCase() || "how people build their careers"
    }.`;

  return {
    objectives: [
      `Understand ${name}'s path to ${company}`,
      `Learn what the work is really like day to day`,
      "Get honest advice on how to prepare and what to focus on",
    ],
    greeting: `Hi ${name}, it's great to meet you! Thank you so much for taking the time to talk with me today.`,
    why_connect: conn[0]
      ? `I wanted to connect with you because ${conn[0].point.replace(new RegExp(`^${name}\\s`), "you ").replace(/\.$/, "")}, and your path to ${company} really caught my attention.`
      : `I wanted to connect with you because your work at ${company} is exactly the kind of career I'm trying to learn more about.`,
    self_intro: intro,
    transition_to_questions: "I have a few questions, but I'm happy to let the conversation go wherever it's most useful.",
    questions: i.durationMinutes <= 15 ? questions.map((x) => ({ ...x, include_in_short_call: x.priority === 1 })) : questions,
    closing_thanks: `This has been really helpful, ${name}. Thank you for being so generous with your time and advice.`,
    referral_question: conn.length > 0 ? "Is there anyone else you think would be helpful for me to learn from as I explore this field?" : null,
    closing_reminder: "Watch the time, thank them by name, and mention one specific thing you'll act on.",
  };
}

function mockRegenerate(i: AITaskMap["regenerate_question"]["input"]): QuestionAI {
  const company = i.contact.current_company || "your company";
  const variants: Record<QuestionAI["section"], string> = {
    career_journey: `Looking back, what was the most important decision that got you to ${company}?`,
    deep_dive: `What's a recent project at ${company} that taught you something new?`,
    career_advice: "What's one habit or skill you think students underestimate?",
    closing: "What would you be curious to hear about from me in a few months?",
  };
  const question = i.instruction?.trim()
    ? `${variants[i.current.section]} (${i.instruction.trim().slice(0, 60)})`
    : variants[i.current.section];
  return { ...i.current, question, short_version: question.split(" ").slice(0, 6).join(" "), evidence: [] };
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
