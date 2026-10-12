import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryRepository, MemoryStore } from "@/lib/data/memory";
import { DEMO_ID_PATTERN, getDemoRepository, newDemoId } from "@/lib/demo/registry";
import { seedDemoWorkspace } from "@/lib/demo/seed";

describe("public demo isolation", () => {
  it("has no import path to real storage or auth", () => {
    // The demo modules must never be able to reach Supabase or the local data file.
    for (const file of ["src/lib/demo/registry.ts", "src/lib/demo/seed.ts"]) {
      const specifiers = Array.from(readFileSync(path.resolve(file), "utf8").matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
      expect(specifiers.length).toBeGreaterThan(0);
      for (const s of specifiers) expect(s).not.toMatch(/supabase|local-store|\/workspace$|next\/headers/);
    }
  });

  it("seeds only fictional people and companies", async () => {
    const repo = new MemoryRepository(new MemoryStore(), "00000000-0000-4000-8000-00000000d3e0");
    await seedDemoWorkspace(repo, new Date("2026-10-12T18:00:00Z"));
    const contacts = await repo.listContacts();
    expect(contacts.map((c) => c.full_name).sort()).toEqual(["Daniel Okafor", "Elena Rossi", "Kenji Watanabe", "Maya Patel"]);
    const real = /McKinsey|BCG|Bain|Deloitte|PwC|KPMG|Accenture|Caterpillar|Walmart|Nike|Amazon|Apple|BYU|Brigham Young|Toby|Zheng/i;
    for (const c of contacts) {
      expect(JSON.stringify(c)).not.toMatch(real);
      expect(c.linkedin_url).toMatch(/linkedin\.com\/in\/example-/);
    }
    const profile = await repo.getProfile();
    expect(JSON.stringify(profile)).not.toMatch(real);
    // The seeded story covers every stage of the workflow.
    const meetings = await repo.listMeetings();
    expect(meetings.filter((m) => m.status === "completed")).toHaveLength(2);
    expect(meetings.every((m) => m.script)).toBe(true);
    expect((await repo.listDrafts()).some((d) => d.sent_at)).toBe(true);
    expect((await repo.listFollowUps()).length).toBeGreaterThan(3);
  });

  it("gives every visitor a separate workspace", async () => {
    const a = newDemoId();
    const b = newDemoId();
    expect(a).toMatch(DEMO_ID_PATTERN);
    const repoA = await getDemoRepository(a);
    const repoB = await getDemoRepository(b);
    const maya = (await repoA.listContacts()).find((c) => c.full_name === "Maya Patel")!;
    await repoA.updateContact(maya.id, { full_name: "Changed by visitor A" });
    expect((await repoB.listContacts()).map((c) => c.full_name)).toContain("Maya Patel");
    expect((await repoB.listContacts()).map((c) => c.full_name)).not.toContain("Changed by visitor A");
  });

  it("rejects malformed demo ids", async () => {
    await expect(getDemoRepository("../../etc/passwd")).rejects.toThrow();
  });
});
