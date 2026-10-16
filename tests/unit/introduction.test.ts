import { describe, expect, it } from "vitest";
import { composeIntroduction, spokenTextIssues, wordCount } from "@/lib/profile/introduction";
import { cleanLine, normalizeInterests, normalizeMajor, normalizeProfile, normalizeSchool, spokenOrg } from "@/lib/profile/normalize";

/**
 * Regression fixtures for the "raw LinkedIn text in the spoken introduction" bug.
 * This is a structural twin of the real report: identical artifacts and layout
 * (logo headings, "· Part-time", "· 3 mos", "· Hybrid", degree prefix, sub-school
 * name, "- " bullets), with synthetic names so no private data is committed.
 */
const FLAT_BACKGROUND =
  "Lakeshore State University Hale School of Business logo Research Assistant Lakeshore State University Hale School of Business · Part-time Aug 2026 - Present · 3 mos Ridgefield, Ohio, United States · Hybrid Granite Machinery Inc. logo Procurement Intern Granite Machinery Inc. · Internship Jun 2026 - Aug 2026 · 3 mos Wuxi, Jiangsu, China · On-site";

const MULTILINE_BACKGROUND = `Lakeshore State University Hale School of Business logo
Research Assistant
Lakeshore State University Hale School of Business · Part-time
Aug 2026 - Present · 3 mos
Ridgefield, Ohio, United States · Hybrid
Show all
Granite Machinery Inc. logo
Procurement Intern
Granite Machinery Inc. · Internship
Jun 2026 - Aug 2026 · 3 mos
Wuxi, Jiangsu, China · On-site
…see more`;

/** What the broken generator produced from that input (anonymized). */
const BROKEN_INTRO =
  "A little about me: I'm Jordan, originally from Hangzhou, China, and I study BS Global Supply Chain Management at Lakeshore State University Hale School of Business. Lakeshore State University Hale School of Business logo Research Assistant Lakeshore State University Hale School of Business · Part-time Aug 2026 - Present · 3 mos Ridgefield, Ohio, United States · Hybrid Granite Machinery Inc. Right now I'm exploring different career paths, and I'm especially curious about - management consulting and - strategy consulting.";

const BASE = {
  full_name: "Jordan Lin",
  preferred_name: "Jordan",
  hometown: "Hangzhou, China",
  school: "Lakeshore State University Hale School of Business",
  major: "BS Global Supply Chain Management",
  interests: ["- Management consulting", "- Strategy consulting"],
  intro_pitch: "",
};
const TODAY = "2026-10-15";
const SUPPLY_CHAIN_CONTACT = { company: "Northwind Consulting", title: "Senior Consultant, Supply Chain" };

function introFor(background: string, extra: Partial<typeof BASE> = {}, contact = SUPPLY_CHAIN_CONTACT) {
  const profile = { ...BASE, ...extra, background };
  return composeIntroduction(normalizeProfile(profile), profile, contact, TODAY);
}

describe("regression: raw profile text in the spoken introduction", () => {
  it("the validator flags the original broken introduction", () => {
    const issues = spokenTextIssues(BROKEN_INTRO, [FLAT_BACKGROUND]);
    expect(issues.join(" | ")).toMatch(/logo/);
    expect(issues.join(" | ")).toMatch(/·/);
    expect(issues.join(" | ")).toMatch(/tenure/);
    expect(issues.join(" | ")).toMatch(/employment-type/);
    expect(issues.join(" | ")).toMatch(/bullet/);
    expect(issues.join(" | ")).toMatch(/word for word/);
  });

  for (const [name, background] of [
    ["flattened paste (exactly as reported)", FLAT_BACKGROUND],
    ["multi-line paste", MULTILINE_BACKGROUND],
  ] as const) {
    describe(name, () => {
      const intro = introFor(background);

      it("contains no LinkedIn artifacts, metadata, or bullet prefixes", () => {
        expect(intro.text).not.toMatch(/\blogo\b|show all|see more|·|\b\d+\s*mos\b|Part-time|Full-time|Hybrid|On-site|(^|\s)- /i);
        expect(spokenTextIssues(intro.text, [background])).toEqual([]);
      });

      it("says the school and degree naturally", () => {
        expect(intro.text).toContain("I study Global Supply Chain Management at LSU");
        expect(intro.text).not.toMatch(/\bBS\b|Hale School of Business/);
      });

      it("does not read the pasted background aloud", () => {
        expect(intro.text).not.toContain("Research Assistant Lakeshore");
        expect(spokenTextIssues(intro.text, [background]).some((x) => /word for word/.test(x))).toBe(false);
      });

      it("fits a 20–30 second read", () => {
        expect(intro.words).toBeGreaterThanOrEqual(35);
        expect(intro.words).toBeLessThanOrEqual(65);
        expect(wordCount(intro.text)).toBe(intro.words);
      });

      it("picks the verified experience most relevant to a supply-chain contact", () => {
        expect(intro.text).toContain("This past summer, I did a procurement internship at Granite Machinery in Wuxi.");
        expect(intro.text).toMatch(/consulting and strategy/);
        expect(intro.text).toContain("I'd love to learn from your experience at Northwind Consulting");
      });
    });
  }

  it("reads a plain sentence background the same way", () => {
    const intro = introFor(
      "Completed a procurement internship at Granite Machinery's China Research and Development Center in Wuxi in summer 2026.",
    );
    expect(intro.text).toContain("This past summer, I did a procurement internship at Granite Machinery in Wuxi.");
  });

  it("never keeps articles or verbs inside an extracted title", () => {
    const np = normalizeProfile({ ...BASE, background: "I completed a procurement internship at Granite Machinery this summer." });
    expect(np.experiences[0]).toMatchObject({ title: "procurement intern", field: "procurement", orgSpoken: "Granite Machinery" });
  });

  it("names the student, says what they study, and avoids repeating thanks or their name", () => {
    const intro = introFor(FLAT_BACKGROUND);
    expect(intro.text.startsWith("I'm Jordan, originally from Hangzhou, China, and I study")).toBe(true);
    expect(intro.text.match(/Jordan/g)).toHaveLength(1);
    expect(intro.text).not.toMatch(/thank/i);
  });
});

describe("safe fallbacks for missing or ambiguous data", () => {
  it("skips an experience it can't read and asks the user to add one", () => {
    const intro = introFor("Hardworking, passionate, team player!!! Excited about growth & impact.");
    expect(intro.experience).toBeNull();
    expect(intro.warnings.join(" ")).toMatch(/Couldn't read a specific experience/);
    expect(intro.text).toMatch(/^I'm Jordan, originally from Hangzhou, China, and I study Global Supply Chain Management at LSU\./);
    expect(spokenTextIssues(intro.text)).toEqual([]);
  });

  it("never invents details for an empty profile", () => {
    // Plain and honest beats made-up; the warnings tell the user what to add.
    const profile = { full_name: "", preferred_name: "", hometown: "", school: "", major: "", background: "", interests: [], intro_pitch: "" };
    const intro = composeIntroduction(normalizeProfile(profile), profile, {}, TODAY);
    expect(intro.text).toBe("I'm a student. I'm exploring different career paths, and I'd love to learn from your experience.");
    expect(intro.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it("uses the student's own spoken introduction exactly, when saved", () => {
    const intro = introFor(FLAT_BACKGROUND, { intro_pitch: "Hi, I'm Jordan — I study supply chain and I'm curious about consulting." });
    expect(intro.origin).toBe("yours");
    expect(intro.text).toBe("Hi, I'm Jordan — I study supply chain and I'm curious about consulting.");
  });

  it("does not treat a target company as somewhere the student worked", () => {
    const profile = { ...BASE, background: "", interests: ["Consulting"], target_companies: ["Northwind Consulting"] };
    const intro = composeIntroduction(normalizeProfile(profile), profile, SUPPLY_CHAIN_CONTACT, TODAY);
    expect(intro.experience).toBeNull();
    expect(intro.text).not.toMatch(/worked|internship/);
  });
});

describe("normalization helpers", () => {
  it("cleans bullets and deduplicates overlapping interests", () => {
    expect(
      normalizeInterests([
        "- Management and strategy consulting",
        "• Big Four consulting and advisory",
        "Corporate strategy",
        "- Global supply chain management",
        "Procurement and sourcing",
      ]).map((i) => i.value),
    ).toEqual(["consulting", "strategy", "supply chain", "procurement"]);
  });

  it("shortens schools only when it's safe", () => {
    expect(normalizeSchool("Lakeshore State University Hale School of Business")).toEqual({ name: "Lakeshore State University", spoken: "LSU" });
    expect(normalizeSchool("Westbrook University")).toEqual({ name: "Westbrook University", spoken: "Westbrook University" });
    expect(normalizeSchool("University of Utah")).toEqual({ name: "University of Utah", spoken: "University of Utah" });
    expect(normalizeSchool("Texas A&M University")?.spoken).toBe("Texas A&M University");
  });

  it("separates the degree from the field of study", () => {
    expect(normalizeMajor("BS Global Supply Chain Management")).toEqual({ field: "Global Supply Chain Management", degree: "BS" });
    expect(normalizeMajor("Bachelor of Science in Marketing")?.field).toBe("Marketing");
    expect(normalizeMajor("Economics, BA")).toEqual({ field: "Economics", degree: "BA" });
    expect(normalizeMajor("Information Systems")).toEqual({ field: "Information Systems", degree: null });
  });

  it("strips only real platform artifacts and keeps meaningful words", () => {
    expect(cleanLine("Granite Machinery Inc. · Full-time")?.text).toBe("Granite Machinery Inc.");
    expect(cleanLine("Aug 2026 - Present · 1 yr 3 mos")?.text).toBe("Aug 2026 - Present");
    expect(cleanLine("Show all")).toBeNull();
    expect(cleanLine("Remote Sensing Analyst")?.text).toBe("Remote Sensing Analyst");
    expect(cleanLine("Logo Design Lead")?.text).toBe("Logo Design Lead");
    expect(cleanLine("Hybrid Cloud Engineer")?.text).toBe("Hybrid Cloud Engineer");
    expect(spokenOrg("Granite Machinery Inc.")).toBe("Granite Machinery");
    expect(spokenOrg("Granite Machinery's China Research and Development Center")).toBe("Granite Machinery");
  });

  it("keeps the source text for every extracted fact", () => {
    const np = normalizeProfile({ ...BASE, background: MULTILINE_BACKGROUND });
    expect(np.school?.source).toBe(BASE.school);
    expect(np.experiences.map((e) => [e.title, e.orgSpoken])).toEqual([
      ["Research Assistant", "Lakeshore State University Hale School of Business"],
      ["Procurement Intern", "Granite Machinery"],
    ]);
    expect(np.experiences[1].source).toContain("Granite Machinery Inc. · Internship");
  });
});
