import { jsPDF } from "jspdf";
import { beforeEach, describe, expect, it } from "vitest";
import { AIError } from "@/lib/ai/provider";
import { MemoryStore } from "@/lib/data/memory";
import { getCompanyView, listCompanies } from "@/lib/services/companies";
import { prepareCoffeeChat } from "@/lib/services/contacts";
import type { AppContext } from "@/lib/services/context";
import { generateDraft, markDraftSent } from "@/lib/services/drafts";
import { cleanExtractedText, extractProfileText, sniff } from "@/lib/services/import";
import { askKnowledge, collectSources, rankSources, stem, tokenize } from "@/lib/services/knowledge";
import { saveMeetingNotes } from "@/lib/services/meetings";
import { buildPlaybook, playbookToMarkdown } from "@/lib/services/playbook";
import { playbookToPdf } from "@/lib/services/playbook-pdf";
import { saveProfile } from "@/lib/services/profile";
import { makeCtx, SARAH_LINKEDIN, SARAH_NOTES, STUDENT_PROFILE, USER_B } from "../support/fixtures";

const OMAR_LINKEDIN = `Omar Haddad
Category Manager at Brightline Retail
Experience
Category Manager
Brightline Retail · Full-time
Jan 2023 - Present
Buyer
Granite Machinery · Full-time
Jun 2019 - Dec 2022
Education
Westbrook University
Bachelor of Science, Marketing
2015 - 2019`;

let ctx: AppContext;
let store: MemoryStore;

beforeEach(async () => {
  store = new MemoryStore();
  ctx = makeCtx({ store });
  await saveProfile(ctx, STUDENT_PROFILE);
  const sarah = await prepareCoffeeChat(ctx, { full_name: "Sarah Mitchell", linkedin_profile_text: SARAH_LINKEDIN, scheduled_at: "2026-10-22T16:00:00Z" });
  await saveMeetingNotes(ctx, sarah.meetingId, { body: SARAH_NOTES });
  const { draft } = await generateDraft(ctx, { contact_id: sarah.contactId, meeting_id: sarah.meetingId, kind: "thank_you", tone: "brief" });
  await markDraftSent(ctx, draft.id);
  const omar = await prepareCoffeeChat(ctx, { full_name: "Omar Haddad", linkedin_profile_text: OMAR_LINKEDIN, scheduled_at: "2026-10-20T16:00:00Z" });
  await saveMeetingNotes(ctx, omar.meetingId, {
    body: "Said retail recruiting starts in early fall.\nRecommended learning Excel pivot tables.\nHe loves cooking Lebanese food.",
  });
});

describe("knowledge base retrieval", () => {
  it("stems and drops filler words", () => {
    expect(stem("recruiting")).toBe("recruit");
    expect(stem("consultants")).toBe("consult");
    expect(tokenize("What have consultants told me about recruiting?")).toEqual(["consult", "recruit"]);
  });

  it("finds who recommended something", async () => {
    const hits = rankSources(await collectSources(ctx), "Which contacts recommended case interviews?");
    expect(hits[0].contactName).toBe("Sarah Mitchell");
    expect(hits.some((h) => h.contactName === "Omar Haddad")).toBe(false);
  });

  it("finds people by company", async () => {
    const hits = rankSources(await collectSources(ctx), "Who have I spoken with at Brightline Retail?");
    expect(hits[0].contactName).toBe("Omar Haddad");
  });

  it("answers with citations to real conversations", async () => {
    const r = await askKnowledge(ctx, "What have people told me about recruiting?");
    expect(r.found).toBe(true);
    expect(r.citations.map((c) => c.contactName)).toContain("Omar Haddad");
    for (const c of r.citations) expect(c.meetingId ?? c.contactId).toBeTruthy();
  });

  it("says so — without calling the AI — when notes don't cover the question", async () => {
    let called = false;
    const spy: AppContext = { ...ctx, ai: { label: "spy", offline: true, run: async () => ((called = true), {} as never) } };
    const r = await askKnowledge(spy, "What did anyone say about quantum astrophysics?");
    expect(r.found).toBe(false);
    expect(called).toBe(false);
  });

  it("only ever searches your own notes", async () => {
    const other = makeCtx({ store, userId: USER_B });
    expect(await collectSources(other)).toEqual([]);
    expect((await askKnowledge(other, "case interviews")).found).toBe(false);
  });

  it("drops citation ids the AI invents", async () => {
    const liar: AppContext = {
      ...ctx,
      ai: { label: "liar", offline: true, run: async () => ({ answer: "x", cited_source_ids: ["S1", "S99", "bogus"], found_relevant_notes: true }) as never },
    };
    const r = await askKnowledge(liar, "case interviews");
    expect(r.citations).toHaveLength(1);
  });
});

describe("networking playbook", () => {
  it("compiles only recorded facts into every section", async () => {
    const p = await buildPlaybook(ctx);
    expect(p.title).toBe("My Pre-Mission Networking Playbook");
    expect(p.stats).toMatchObject({ people: 2, conversations: 2, thankYous: 1 });
    const recorded = new Set((await ctx.repo.listInsights()).map((i) => i.insight));
    for (const person of p.people) for (const a of person.advice) expect(recorded.has(a)).toBe(true);
    expect(p.recruitingAdvice.some((a) => /recruiting starts in early fall/i.test(a.insight))).toBe(true);
    // Sarah asked to reconnect after the mission; the return date is unknown, so it stays undated.
    const sarah = p.afterYouReturn.find((r) => r.who.startsWith("Sarah"))!;
    expect(sarah.when).toMatch(/return date/i);
    // Open tasks due before departure are listed; the completed thank-you is not.
    expect(p.beforeYouLeave.some((t) => /thank-you/i.test(t.title) && t.who === "Sarah Mitchell")).toBe(false);
    expect(p.beforeYouLeave.some((t) => t.who === "Omar Haddad")).toBe(true);
  });

  it("exports Markdown and a real PDF", async () => {
    const p = await buildPlaybook(ctx);
    const md = playbookToMarkdown(p);
    expect(md).toMatch(/^# My Pre-Mission Networking Playbook/);
    for (const h of ["## Before you leave", "## Reconnect after you return", "## Recruiting advice", "## People", "### Sarah Mitchell"]) {
      expect(md).toContain(h);
    }
    const pdf = new Uint8Array(playbookToPdf(p));
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(2000);
  });
});

describe("profile import", () => {
  it("identifies files by content, not name", () => {
    expect(sniff(new TextEncoder().encode("%PDF-1.7"))).toBe("pdf");
    expect(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe("image/png");
    expect(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniff(new TextEncoder().encode("<html>"))).toBeNull();
  });

  it("extracts text from a LinkedIn-style PDF", async () => {
    const doc = new jsPDF();
    doc.text(["Priya Raman", "Strategic Sourcing Manager at Granite Machinery", "Experience"], 10, 10);
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    const r = await extractProfileText(ctx, bytes);
    expect(r.method).toBe("pdf");
    expect(r.text).toContain("Priya Raman");
    expect(r.text).toContain("Strategic Sourcing Manager");
  });

  it("needs a real model for screenshots and rejects unsupported files", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expect(extractProfileText(ctx, png)).rejects.toMatchObject({ code: "not_configured" });
    await expect(extractProfileText(ctx, new TextEncoder().encode("hello"))).rejects.toBeInstanceOf(AIError);
    await expect(extractProfileText(ctx, new Uint8Array(4 * 1024 * 1024))).rejects.toThrow(/under 3.8 MB/);
  });

  it("transcribes screenshots with a vision-capable provider and counts usage", async () => {
    const vision: AppContext = { ...ctx, aiDailyLimit: 1, ai: { ...ctx.ai, offline: false, transcribeImage: async () => "Jane Doe\n\n\n\nAnalyst" } };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect((await extractProfileText(vision, png)).text).toBe("Jane Doe\n\nAnalyst");
    await expect(extractProfileText(vision, png)).rejects.toMatchObject({ code: "usage_limit" });
  });

  it("cleans extracted text", () => {
    expect(cleanExtractedText("A  \r\n\n\n\nPage 1 of 3\nB")).toBe("A\n\nB");
  });
});

describe("company pages", () => {
  it("groups people by employer and includes former employees", async () => {
    const companies = await listCompanies(ctx);
    expect(companies.map((c) => c.name).sort()).toEqual(["Brightline Retail", "Northwind Consulting"]);
    const granite = await getCompanyView(ctx, "granite machinery");
    expect(granite.contacts).toHaveLength(0);
    expect(granite.alumni.map((a) => a.contact.full_name).sort()).toEqual(["Omar Haddad", "Sarah Mitchell"]);
  });

  it("stores your own research notes per company", async () => {
    await ctx.repo.saveCompanyResearch("Brightline Retail", "Recruiting opens in September.");
    await ctx.repo.saveCompanyResearch("brightline retail", "Updated note.");
    const v = await getCompanyView(ctx, "Brightline Retail");
    expect(v.research?.notes).toBe("Updated note.");
    expect(await makeCtx({ store, userId: USER_B }).repo.getCompanyResearch("Brightline Retail")).toBeNull();
  });
});
