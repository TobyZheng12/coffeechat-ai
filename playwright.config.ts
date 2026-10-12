import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the real app in LOCAL mode with the offline AI, against
 * a throwaway data file — never your real .data/local-db.json.
 */
const PORT = 3100;
export const E2E_PASSCODE = "e2e-passcode";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    timezoneId: "America/Denver",
  },
  projects: [
    {
      name: "chromium",
      // Uses installed Google Chrome locally; CI installs Playwright's Chromium.
      use: { ...devices["Desktop Chrome"], channel: process.env.CI ? undefined : "chrome" },
    },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      DATA_BACKEND: "local",
      LOCAL_DATA_FILE: ".data/e2e-db.json",
      LOCAL_PASSCODE: E2E_PASSCODE,
      SESSION_SECRET: "e2e-session-secret-that-is-at-least-32-chars",
      AI_PROVIDER: "mock",
      DEMO_ENABLED: "true",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      ANTHROPIC_API_KEY: "",
    },
  },
});
