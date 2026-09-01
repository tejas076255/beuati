import { defineConfig, devices } from "@playwright/test";

// Generic Playwright config — Chromium-only for QA-1B. baseURL is
// configurable so this same config can point at a staging/preview host
// later without editing spec files.
const baseURL = process.env["QA_BASE_URL"] ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  ...(process.env["CI"] ? { workers: 1 } : {}),
  timeout: 30_000,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
