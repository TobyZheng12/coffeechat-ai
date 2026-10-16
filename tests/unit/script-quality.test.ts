import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { studentBlock } from "@/lib/ai/tasks";
import { MemoryStore } from "@/lib/data/memory";
import { getDemoRepository, newDemoId } from "@/lib/demo/registry";
import { spokenTextIssues } from "@/lib/profile/introduction";
import { loadProfile } from "@/lib/services/context";
import { prepareCoffeeChat } from "@/lib/services/contacts";
import { saveProfile } from "@/lib/services/profile";
import { editQuestion, editScript, generateScript } from "@/lib/services/scripts";
import { getMeetingView } from "@/lib/services/views";
import { makeCtx, SARAH_EMAIL, SARAH_LINKEDIN, STUDENT_PROFILE } from "../support/fixtures";

/** A second, very different (fictional) contact. */
const PRIYA_LINKEDIN = `Priya Raman
Product Manager at Summit Apparel
Portland, Oregon

Experience
Summit Apparel logo
Product Manager
Summit Apparel · Full-time
Mar 2021 - Present · 5 yrs 8 mos
Portland, Oregon, United States · Hybrid
Own the roadmap for the online store and customer loyalty program.
Analyst
Harborview Advisory · Full-time
Jul 2017 - Feb 2021 · 3 yrs 8 mos
Show all

Education
Lakeshore State University
Bachelor of Arts, Economics
2013 - 2017`;

const FLAT_BACKGROUND =
  "Lakeshore State University Hale School of Business logo Research Assistant Lakeshore State University Hale School of Business · Part-time Aug 2026 - Present · 3 mos Ridgefield, Ohio, United States · Hybrid Granite Machinery Inc. logo Procurement Intern Granite Machinery Inc. · Internship Jun 2026 - Aug 2026 · 3 mos Wuxi, Jiangsu, China · On-site";

async function setup(profileOverrides: Partial<typeof STUDENT_PROFILE> & { background?: string } = {}) {
  const ctx = makeCtx({ now: new Date("2026-10-15T18:00:00Z") });
  await saveProfile(ctx, { ...STUDENT_PROFILE, ...profileOverrides });
  return ctx;
}

const mainQuestions = async (ctx: ReturnType<typeof makeCtx>, meetingId: string) =>
  (await getMeetingView(ctx, meetingId)).questions.filter((q) => !q.is_alternate);

describe("script quality (offline templates)", () => {
  it("gives meaningfully different questions to contacts with different backgrounds", async () => {
    const ctx = await setup();
    const sarah = await prepareCoffeeChat(ctx, { full_name: "Sarah Mitchell", linkedin_profile_text: SARAH_LINKEDIN, email_thread_text: SARAH_EMAIL });
    const priya = await prepareCoffeeChat(ctx, { full_name: "Priya Raman", linkedin_profile_text: PRIYA_LINKEDIN });
    const a = (await mainQuestions(ctx, sarah.meetingId)).map((q) => q.question);
    const b = (await mainQuestions(ctx, priya.meetingId)).map((q) => q.question);
    const overlap = a.filter((q) => b.includes(q)).length / Math.max(a.length, b.length);
    expect(overlap).toBeLessThan(0.5);

    // Sarah: real shared school + shared employer (from the student's Background), with evidence.
    expect(a.join(" ")).toMatch(/You were at Granite Machinery before Northwind Consulting/);
    // Priya: her real move and her own words, asked about rather than assumed.
    expect(b.join(" ")).toMatch(/You moved from Harborview Advisory to Summit Apparel/);
    expect(b.join(" ")).toMatch(/Your profile mentions: “Own the roadmap for the online store/);
    for (const q of [...a, ...b]) expect(spokenTextIssues(q, [], 60)).toEqual([]);
  });

  it("attaches verbatim evidence to personalized questions", async () => {
    const ctx = await setup();
    const priya = await prepareCoffeeChat(ctx, { full_name: "Priya Raman", linkedin_profile_text: PRIYA_LINKEDIN });
    const qs = (await getMeetingView(ctx, priya.meetingId)).questions;
    const move = qs.find((q) => q.question.startsWith("You moved from"))!;
    expect(move.evidence[0].quote).toBe("Harborview Advisory");
    for (const q of qs) for (const e of q.evidence) expect(PRIYA_LINKEDIN).toContain(e.quote);
  });

  it("keeps the 15-minute plan realistic and the rest in the bank", async () => {
    const ctx = await setup();
    const short = await prepareCoffeeChat(ctx, { full_name: "Priya Raman", linkedin_profile_text: PRIYA_LINKEDIN, duration_minutes: 15 });
    const qs = (await getMeetingView(ctx, short.meetingId)).questions;
    const main = qs.filter((q) => !q.is_alternate);
    expect(main).toHaveLength(3);
    expect(main.every((q) => q.include_in_short_call && q.priority === 1)).toBe(true);
    expect(new Set(main.map((q) => q.section))).toEqual(new Set(["career_journey", "deep_dive", "career_advice"]));
    expect(qs.filter((q) => q.is_alternate).length).toBeGreaterThanOrEqual(4);

    const long = await prepareCoffeeChat(ctx, { full_name: "Priya Raman", linkedin_profile_text: PRIYA_LINKEDIN, duration_minutes: 30 });
    const qs30 = (await getMeetingView(ctx, long.meetingId)).questions;
    expect(qs30.filter((q) => !q.is_alternate)).toHaveLength(6);
    expect(qs30.filter((q) => q.include_in_short_call)).toHaveLength(3);
  });

  it("does not mistake a target company or a broad term for shared experience", async () => {
    const ctx = await setup({ background: "", target_companies: ["Northwind Consulting"], interests: ["Supply chain"] });
    const r = await prepareCoffeeChat(ctx, { full_name: "Sarah Mitchell", linkedin_profile_text: SARAH_LINKEDIN.replace(/Westbrook University/g, "Lakeview College") });
    const contact = await ctx.repo.getContact(r.contactId);
    expect(contact!.analysis!.connections_to_me).toEqual([]);
    expect(contact!.analysis!.shared_interests[0].point).toMatch(/work involves supply chain, which you're interested in/);
    const v = await getMeetingView(ctx, r.meetingId);
    expect(v.meeting.script!.why_connect).not.toMatch(/both have a connection/);
    // Mentioning where THEY work is fine; claiming the student worked there is not.
    expect(v.meeting.script!.self_intro).not.toMatch(/worked|interned|internship/);
    expect(v.meeting.script!.self_intro).toContain("learn from your experience at Northwind Consulting");
  });

  it("produces a clean introduction from the reported broken profile", async () => {
    const ctx = await setup({
      school: "Lakeshore State University Hale School of Business",
      major: "BS Global Supply Chain Management",
      interests: ["- Management consulting", "- Strategy consulting"],
      background: FLAT_BACKGROUND,
    });
    const r = await prepareCoffeeChat(ctx, { full_name: "Sarah Mitchell", linkedin_profile_text: SARAH_LINKEDIN });
    const intro = (await getMeetingView(ctx, r.meetingId)).meeting.script!.self_intro;
    expect(spokenTextIssues(intro, [FLAT_BACKGROUND])).toEqual([]);
    expect(intro).toContain("Global Supply Chain Management at LSU");
  });
});

describe("regeneration keeps your edits", () => {
  it("keeps an edited introduction and edited questions unless you choose to replace them", async () => {
    const ctx = await setup();
    const r = await prepareCoffeeChat(ctx, { full_name: "Priya Raman", linkedin_profile_text: PRIYA_LINKEDIN });
    const before = (await getMeetingView(ctx, r.meetingId)).meeting.script!;
    await editScript(ctx, r.meetingId, { ...before, self_intro: "My own edited intro.", referral_question: before.referral_question });
    const q = (await mainQuestions(ctx, r.meetingId))[0];
    await editQuestion(ctx, q.id, { question: "My own question?", priority: 1, section: q.section });

    await generateScript(ctx, r.meetingId);
    let v = await getMeetingView(ctx, r.meetingId);
    expect(v.meeting.script!.self_intro).toBe("My own edited intro.");
    expect(v.meeting.script!.edited_fields).toEqual(["self_intro"]);
    expect(v.meeting.script!.greeting).toBe(before.greeting); // unedited fields are regenerated (same facts → same text)
    expect(v.questions.some((x) => x.question === "My own question?")).toBe(true);

    await generateScript(ctx, r.meetingId, { replaceEdited: true });
    v = await getMeetingView(ctx, r.meetingId);
    expect(v.meeting.script!.self_intro).not.toBe("My own edited intro.");
    expect(v.meeting.script!.edited_fields).toEqual([]);
    expect(v.questions.some((x) => x.question === "My own question?")).toBe(false);
  });

  it("uses the saved spoken introduction word for word", async () => {
    const ctx = await setup({ intro_pitch: "I'm Jordan. I study supply chain at Westbrook, and I'm curious how consultants spend their week." });
    const r = await prepareCoffeeChat(ctx, { full_name: "Priya Raman", linkedin_profile_text: PRIYA_LINKEDIN });
    const s = (await getMeetingView(ctx, r.meetingId)).meeting.script!;
    expect(s.self_intro).toBe("I'm Jordan. I study supply chain at Westbrook, and I'm curious how consultants spend their week.");
    expect(s.intro_origin).toBe("yours");
  });

  it("never rewrites stored profile data or other meetings' scripts", async () => {
    const ctx = await setup({ background: FLAT_BACKGROUND });
    const first = await prepareCoffeeChat(ctx, { full_name: "Priya Raman", linkedin_profile_text: PRIYA_LINKEDIN });
    const firstScript = (await getMeetingView(ctx, first.meetingId)).meeting.script;
    await prepareCoffeeChat(ctx, { full_name: "Sarah Mitchell", linkedin_profile_text: SARAH_LINKEDIN });
    expect((await loadProfile(ctx)).background).toBe(FLAT_BACKGROUND);
    expect((await getMeetingView(ctx, first.meetingId)).meeting.script).toEqual(firstScript);
  });
});

describe("optional Claude provider shares the same safeguards (mocked API)", () => {
  it("replaces an AI introduction that copies raw profile text", async () => {
    const ctx = await setup({ background: FLAT_BACKGROUND, school: "Lakeshore State University Hale School of Business", major: "BS Global Supply Chain Management" });
    const bad = {
      objectives: ["a", "b", "c"],
      greeting: "Hi Priya!",
      why_connect: "I wanted to connect.",
      self_intro: `I'm Jordan. ${FLAT_BACKGROUND}`,
      transition_to_questions: "",
      questions: [],
      closing_thanks: "Thanks!",
      referral_question: null,
      closing_reminder: "",
    };
    const parse = vi.fn().mockResolvedValue({ stop_reason: "end_turn", parsed_output: bad });
    const client = { beta: { messages: { parse } } } as unknown as Anthropic;
    const r = await prepareCoffeeChat({ ...ctx, ai: new AnthropicProvider("claude-opus-5-5", "test", client) }, {
      full_name: "Priya Raman",
      linkedin_profile_text: PRIYA_LINKEDIN,
      generate: false,
    });
    await generateScript({ ...ctx, ai: new AnthropicProvider("claude-opus-5-5", "test", client) }, r.meetingId);
    const s = (await getMeetingView(ctx, r.meetingId)).meeting.script!;
    expect(s.intro_origin).toBe("fallback");
    expect(spokenTextIssues(s.self_intro, [FLAT_BACKGROUND])).toEqual([]);
    expect(s.review_notes!.join(" ")).toMatch(/AI's introduction/);

    // The prompt itself gets cleaned facts, not the raw paste.
    const prompt = parse.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("Verified experience: Research Assistant at Lakeshore State University Hale School of Business");
    expect(prompt).toContain("Procurement Intern at Granite Machinery (Wuxi)");
    expect(prompt).not.toContain("· Part-time");
  });

  it("tells the model that target companies are not employers", async () => {
    const ctx = await setup();
    const block = studentBlock(await loadProfile(ctx), "2026-10-15");
    expect(block).toMatch(/has NOT worked at these\): Northwind Consulting, Granite Machinery/);
  });
});

describe("public demo stays isolated", () => {
  it("never sees a private profile, and its own scripts pass the same checks", async () => {
    const privateCtx = makeCtx({ store: new MemoryStore() });
    await saveProfile(privateCtx, { ...STUDENT_PROFILE, full_name: "Private Person", background: FLAT_BACKGROUND });
    const demo = await getDemoRepository(newDemoId());
    const profile = await demo.getProfile();
    expect(profile!.full_name).toBe("Jordan Lin");
    expect(JSON.stringify(await demo.listContacts())).not.toMatch(/Private Person|Lakeshore State University Hale/);
    for (const m of await demo.listMeetings()) {
      if (m.script) expect(spokenTextIssues(m.script.self_intro, [profile!.background])).toEqual([]);
    }
  });
});
