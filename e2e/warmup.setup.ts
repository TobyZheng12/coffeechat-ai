import { test as setup } from "@playwright/test";

/**
 * The E2E server runs `next dev`, which compiles each route the first time
 * it's requested. A first-time compile can make dev mode reload open pages,
 * which makes browser tests flaky. Visiting every route once up front means
 * the real tests only ever see warm, stable routes.
 */
setup.setTimeout(300_000);

setup("compile every route before the tests run", async ({ page }) => {
  const routes = [
    "/",
    "/login",
    "/demo",
    "/app",
    "/app/prepare",
    "/app/contacts",
    "/app/companies",
    "/app/follow-ups",
    "/app/knowledge",
    "/app/playbook",
    "/app/settings",
  ];
  for (const r of routes) {
    await page.goto(r);
    await page.waitForLoadState("networkidle");
  }
  // Dynamic routes compile on first visit regardless of which id is used.
  const contact = await page.goto("/app/contacts").then(() => page.locator('a[href^="/app/contacts/"]').first().getAttribute("href"));
  if (contact) {
    await page.goto(contact);
    await page.waitForLoadState("networkidle");
    await page.goto(`${contact}/edit`);
    await page.waitForLoadState("networkidle");
  }
  const meeting = await page.goto("/app").then(() => page.locator('a[href^="/app/meetings/"]').first().getAttribute("href"));
  if (meeting) {
    await page.goto(meeting);
    await page.waitForLoadState("networkidle");
    await page.goto(`${meeting}/live`);
    await page.waitForLoadState("networkidle");
  }
  await page.goto("/app/companies/Northwind%20Consulting");
  await page.waitForLoadState("networkidle");
  await page.request.get("/app/playbook/pdf");
  await page.request.get("/app/playbook/markdown");
  // Let any pending dev-mode reloads settle.
  await page.waitForTimeout(3000);
});
