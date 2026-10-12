import { expect, test } from "@playwright/test";
import { jsPDF } from "jspdf";

test.beforeEach(async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByText("Demo mode.")).toBeVisible();
});

test("signed-out /app requests get a real HTTP redirect", async ({ request }) => {
  const res = await request.get("/app/contacts", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers().location).toContain("/login");
});

test("knowledge base answers with cited sources", async ({ page }) => {
  await page.getByRole("link", { name: "Knowledge base" }).click();
  await page.getByRole("button", { name: "Which contacts recommended case interviews?" }).click();
  await expect(page.getByText("Answer", { exact: true })).toBeVisible();
  await expect(page.getByText("Sources", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Maya Patel/ }).first()).toBeVisible();
  await expect(page.getByText(/Advice by topic/)).toBeVisible();
});

test("company pages group people and keep research notes", async ({ page }) => {
  await page.getByRole("link", { name: "Companies" }).click();
  await page.getByRole("link", { name: /Northwind Consulting/ }).click();
  await expect(page.getByRole("heading", { name: "Northwind Consulting" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Maya Patel/ }).first()).toBeVisible();
  await page.getByLabel(/Your research notes on/).fill("Recruiting for analysts opens in August.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Notes saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/Your research notes on/)).toHaveValue("Recruiting for analysts opens in August.");
});

test("playbook downloads as Markdown and PDF", async ({ page }) => {
  await page.getByRole("link", { name: "Playbook" }).click();
  await expect(page.getByRole("heading", { name: "My Pre-Mission Networking Playbook" })).toBeVisible();
  await expect(page.getByText("Reconnect after you return")).toBeVisible();

  const [md] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Markdown" }).click()]);
  expect(md.suggestedFilename()).toBe("networking-playbook.md");
  const pdfRes = await page.request.get("/app/playbook/pdf");
  expect(pdfRes.headers()["content-type"]).toBe("application/pdf");
  expect((await pdfRes.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("playbook downloads are private", async ({ request }) => {
  const res = await request.get("/app/playbook/markdown", { maxRedirects: 0 });
  expect([307, 401]).toContain(res.status());
});

test("a LinkedIn PDF export fills the profile box", async ({ page }) => {
  const doc = new jsPDF();
  doc.text(["Priya Raman", "Strategic Sourcing Manager at Granite Machinery"], 10, 10);
  const buffer = Buffer.from(doc.output("arraybuffer"));
  await page.goto("/app/prepare");
  await page.getByLabel("Import LinkedIn PDF or screenshot").setInputFiles({ name: "Profile.pdf", mimeType: "application/pdf", buffer });
  await expect(page.getByLabel("LinkedIn profile text")).toHaveValue(/Priya Raman/);
  await expect(page.getByLabel("LinkedIn profile text")).toHaveValue(/Strategic Sourcing Manager/);
});
