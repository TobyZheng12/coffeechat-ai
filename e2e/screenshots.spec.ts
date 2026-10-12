import { expect, test } from "@playwright/test";

/**
 * Generates README/portfolio screenshots from the FICTIONAL demo workspace.
 * Run with:  SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 */
test.skip(!process.env.SCREENSHOTS, "Set SCREENSHOTS=1 to regenerate docs/screenshots");

test.use({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2 });
test.setTimeout(240_000);

for (const scheme of ["light", "dark"] as const) {
  test(`capture demo screenshots (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    // Hide the Next.js dev-mode badge so it doesn't appear in screenshots.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent = "nextjs-portal { display: none !important; }";
        document.head.appendChild(s);
      });
    });
    const shot = (name: string) => page.screenshot({ path: `docs/screenshots/${name}-${scheme}.png` });

    await page.goto("/");
    await shot("landing");

    await page.goto("/demo");
    await expect(page.getByText("Demo mode.")).toBeVisible();
    await shot("dashboard");

    await page.goto("/app/contacts");
    await page.getByRole("link", { name: /Daniel Okafor/ }).click();
    await page.getByRole("link", { name: /Coffee chat with Daniel/ }).click();
    await expect(page.getByText("Goals for this conversation")).toBeVisible();
    await shot("script");

    await page.goto(`${page.url()}/live`);
    await page.keyboard.press("x");
    await shot("live");

    await page.goto("/app/follow-ups");
    await shot("follow-ups");

    await page.goto("/app/contacts");
    await page.getByRole("link", { name: /Maya Patel/ }).click();
    await page.getByRole("heading", { name: "Relationship timeline" }).scrollIntoViewIfNeeded();
    await shot("contact");

    await page.goto("/app/knowledge");
    await page.getByRole("button", { name: "Which contacts recommended case interviews?" }).click();
    await expect(page.getByText("Sources", { exact: true })).toBeVisible();
    await shot("knowledge");

    await page.goto("/app/playbook");
    await shot("playbook");

    await page.goto("/app/companies");
    await page.getByRole("link", { name: /Northwind Consulting/ }).click();
    await shot("company");
  });
}
