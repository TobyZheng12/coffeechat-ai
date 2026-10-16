import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSCODE } from "../playwright.config";

const PROFILE = `Rina Sato
Strategy Manager at Lakeview Foods
Boise, Idaho

Experience
Strategy Manager
Lakeview Foods · Full-time
Jan 2022 - Present
Lead growth strategy for the packaged foods division.
Consultant
Summit Advisory · Full-time
Jul 2018 - Dec 2021
Supply chain projects for consumer goods clients.

Education
Westbrook University
Bachelor of Science, Global Supply Chain Management
2014 - 2018`;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Passcode").fill(E2E_PASSCODE);
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test("signed-out visitors are sent to sign in, and wrong passcodes are rejected", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Better coffee chats/ })).toBeVisible();
  await page.goto("/app/contacts");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Passcode").fill("not-the-passcode");
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page.getByText("That passcode isn't right.")).toBeVisible();
});

test("complete coffee chat workflow", async ({ page }) => {
  await signIn(page);

  // Profile
  await page.goto("/app/settings");
  await page.getByLabel("Full name").fill("Test Student");
  await page.getByLabel("Preferred name").fill("Sam");
  await page.getByLabel("School").fill("Westbrook University");
  await page.getByLabel("Major").fill("Global Supply Chain Management");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();

  // Create contact + paste profile → script
  await page.goto("/app/prepare");
  await page.getByLabel("Full name").fill("Rina Sato");
  await page.getByLabel("LinkedIn profile text").fill(PROFILE);
  await page.getByLabel("Email thread").fill("Hi Sam, happy to chat about strategy roles. Thursday works. — Rina");
  await page.getByRole("button", { name: "Prepare coffee chat" }).click();
  await expect(page).toHaveURL(/\/app\/meetings\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Rina Sato" })).toBeVisible();
  await expect(page.getByText("Goals for this conversation")).toBeVisible();
  await expect(page.getByText(/You moved from Summit Advisory to Lakeview Foods/)).toBeVisible();
  const meetingUrl = page.url();

  // Cheat sheet & question bank views
  await page.getByRole("tab", { name: "Cheat sheet" }).click();
  await expect(page.getByText("Open with")).toBeVisible();
  await page.getByRole("tab", { name: "Question bank" }).click();
  await expect(page.getByRole("button", { name: "Add question" })).toBeVisible();

  // Live companion: keyboard check-off
  await page.goto(`${meetingUrl}/live`);
  await expect(page.getByText("0/")).toBeVisible();
  await page.keyboard.press("x");
  await expect(page.getByText(/^1\/\d+ asked$/)).toBeVisible();

  // After the call: notes → insights → follow-ups
  await page.goto(meetingUrl);
  await page.getByRole("tab", { name: /After the call/ }).click();
  await page
    .getByLabel(/Paste your rough notes/)
    .fill(
      "Rina moved from consulting into strategy.\nSaid communication is important.\nRecommended practicing case interviews.\nSuggested I reconnect after my mission.",
    );
  await page.getByRole("button", { name: "Save notes & extract insights" }).click();
  await expect(page.getByText("What you learned")).toBeVisible();
  await expect(page.getByText("Said communication is important.").first()).toBeVisible();

  // Follow-ups + thank-you email
  await page.getByRole("tab", { name: /Messages & follow-ups/ }).click();
  await expect(page.getByText("Send Rina a thank-you note")).toBeVisible();
  await page.getByRole("button", { name: "Generate draft" }).click();
  const body = page.getByLabel("Message body");
  await expect(body).toHaveValue(/communication is important/i);
  await expect(page.getByText("Draft · not sent")).toBeVisible();

  // Copy must NOT mark it as sent; explicit confirmation does.
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await page.getByRole("button", { name: "Yes, mark as sent" }).click();
  await expect(page.getByText(/Sent [A-Z][a-z]{2} \d+/)).toBeVisible();
  await expect(page.getByText("Draft · not sent")).toHaveCount(0);

  // History
  await page.goto("/app/contacts");
  await page.getByRole("link", { name: /Rina Sato/ }).click();
  await expect(page.getByRole("heading", { name: "Relationship timeline" })).toBeVisible();
  await expect(page.getByText("Thank-you email sent", { exact: false })).toBeVisible();
  await expect(page.getByText(/informational interview completed/)).toBeVisible();

  // Follow-up dashboard
  await page.goto("/app/follow-ups");
  await expect(page.getByRole("heading", { name: /Completed/ })).toBeVisible();
});

test("public demo is isolated from private data", async ({ browser }) => {
  // A demo visitor sees only fictional data…
  const demo = await browser.newContext();
  const d = await demo.newPage();
  await d.goto("/demo");
  await expect(d).toHaveURL(/\/app$/);
  await expect(d.getByText("Demo mode.")).toBeVisible();
  await d.goto("/app/contacts");
  await expect(d.getByText("Maya Patel")).toBeVisible();
  await expect(d.getByText("Rina Sato")).toHaveCount(0); // private contact from the previous test
  await d.getByRole("link", { name: /Maya Patel/ }).click();
  await expect(d.getByText("Westbrook alumni group on LinkedIn", { exact: true })).toBeVisible();
  await demo.close();

  // …and nothing from the demo ever lands in the private workspace.
  const priv = await browser.newContext();
  const p = await priv.newPage();
  await signIn(p);
  await p.goto("/app/contacts");
  await expect(p.getByText("Maya Patel")).toHaveCount(0);
  const file = readFileSync(".data/e2e-db.json", "utf8");
  expect(file).not.toContain("Maya Patel");
  expect(file).not.toContain("Northwind Consulting");
  await priv.close();
});
