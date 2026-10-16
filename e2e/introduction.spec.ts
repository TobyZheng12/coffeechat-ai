import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSCODE } from "../playwright.config";

/** Structural twin of the reported broken profile (synthetic names). */
const FLAT_BACKGROUND =
  "Lakeshore State University Hale School of Business logo Research Assistant Lakeshore State University Hale School of Business · Part-time Aug 2026 - Present · 3 mos Ridgefield, Ohio, United States · Hybrid Granite Machinery Inc. logo Procurement Intern Granite Machinery Inc. · Internship Jun 2026 - Aug 2026 · 3 mos Wuxi, Jiangsu, China · On-site";

const CONTACT = `Dana Brooks
Senior Consultant, Supply Chain at Bayline Partners

Experience
Senior Consultant
Bayline Partners · Full-time
Jan 2022 - Present · 4 yrs 10 mos
Supply Chain Analyst
Granite Machinery · Full-time
Jun 2018 - Dec 2021`;

const ARTIFACTS = /\blogo\b|show all|see more|·|\b\d+\s*mos\b|Part-time|Hybrid|On-site|(^|\s)- [a-z]/i;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Passcode").fill(E2E_PASSCODE);
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test("profile input → clean script → edit intro → regenerate keeps or replaces it", async ({ page }) => {
  test.setTimeout(300_000); // many steps; generous for slow machines
  await signIn(page);

  // 1. Paste a messy profile.
  await page.goto("/app/settings");
  await page.getByLabel("Full name").fill("Jordan Lin");
  await page.getByLabel("Preferred name").fill("Jordan");
  await page.getByLabel("Hometown").fill("Hangzhou, China");
  await page.getByLabel("School").fill("Lakeshore State University Hale School of Business");
  await page.getByLabel("Major").fill("BS Global Supply Chain Management");
  await page.getByLabel("Background").fill(FLAT_BACKGROUND);
  await page.getByLabel("Career interests").fill("- Management consulting\n- Strategy consulting");
  await page.getByLabel(/My spoken introduction/).fill("");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();

  // 2. Settings shows the cleaned facts and a clean suggested introduction.
  await page.reload();
  const suggested = page.getByTestId("suggested-intro");
  await expect(suggested).toContainText("I study Global Supply Chain Management at LSU");
  await expect(suggested).not.toHaveText(ARTIFACTS);
  await expect(page.getByText("Procurement Intern · Granite Machinery")).toBeVisible();

  // 3. Generate a script for a 15-minute chat.
  await page.goto("/app/prepare");
  await page.getByLabel("Full name").fill("Dana Brooks");
  await page.getByLabel("LinkedIn profile text").fill(CONTACT);
  await page.getByLabel("Length").selectOption("15");
  await page.getByRole("button", { name: "Prepare coffee chat" }).click();
  await expect(page).toHaveURL(/\/app\/meetings\/[0-9a-f-]+$/);
  const intro = page.getByTestId("self-intro");
  await expect(intro).toContainText("This past summer, I did a procurement internship at Granite Machinery in Wuxi.");
  await expect(intro).not.toHaveText(ARTIFACTS);
  const generated = (await intro.textContent())!.trim();
  const words = generated.split(/\s+/).length;
  expect(words).toBeGreaterThanOrEqual(35);
  expect(words).toBeLessThanOrEqual(65);
  // Shared employer is real (both have Granite Machinery) — so it's used.
  await expect(page.getByText(/I was a procurement intern at Granite Machinery too/)).toBeVisible();
  await expect(page.getByText(/You were at Granite Machinery before Bayline Partners/).first()).toBeVisible();

  // 15-minute plan: three main questions.
  await page.getByRole("tab", { name: "Cheat sheet" }).click();
  await page.getByRole("button", { name: "15-minute plan" }).click();
  await expect(page.locator("ol li")).toHaveCount(3);
  await page.getByRole("tab", { name: "Full script" }).click();

  // 4. Edit the introduction.
  await page.getByRole("button", { name: "Edit opening" }).click();
  await page.getByLabel("Your introduction").fill("Hi, I'm Jordan. I study supply chain, and I'd love to hear how you got into consulting.");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(intro).toHaveText("Hi, I'm Jordan. I study supply chain, and I'd love to hear how you got into consulting.");

  // 5. Regenerate: the edit survives.
  await page.getByRole("button", { name: "Regenerate script" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Regenerate" }).click();
  await expect(page.getByText("Script ready")).toBeVisible();
  await expect(intro).toHaveText("Hi, I'm Jordan. I study supply chain, and I'd love to hear how you got into consulting.");
  await expect(page.getByText(/about 30 seconds · edited by you/)).toBeVisible();

  // 6. Regenerate and explicitly replace edits: back to the generated introduction.
  await page.getByRole("button", { name: "Regenerate script" }).click();
  await page.getByRole("dialog").getByLabel(/Also replace my edits/).check();
  await page.getByRole("dialog").getByRole("button", { name: "Regenerate" }).click();
  await expect(intro).toHaveText(generated);
});
