import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

// QA-1D Step 3B — isolated QA browser runtime. Completely separate from
// playwright.config.ts (the normal local-dev smoke config): different
// config file, different port, own webServer spawn with QA_ALLOW_WRITES
// never touched, and — critically — its own `env` block on webServer that
// points the spawned `npm run dev` process at the QA Supabase project
// instead of whatever the developer's shell/normal .env has configured.
// Running `npm run test:e2e` (normal) never loads this file or .env.test.
try {
  process.loadEnvFile(fileURLToPath(new URL("./.env.test", import.meta.url)));
} catch {
  // .env.test not present — this config can't run without it; individual
  // specs fail with a clear "not configured" error rather than silently
  // pointing at nothing.
}

// Dedicated, non-default port so this can never silently attach to (or
// collide with) a normal dev server already running on 8080.
const QA_PORT = 8081;
const baseURL = process.env["QA_BASE_URL"] ?? `http://localhost:${QA_PORT}`;

// Server-only — read once here, only to build the spawned process's own
// env block below. Never assigned to a VITE_* key (that would bundle it
// into the browser). Never printed.
const supabaseUrl = process.env["SUPABASE_URL"] ?? "";
const supabasePublishableKey = process.env["QA_SUPABASE_PUBLISHABLE_KEY"] ?? "";
const supabaseServiceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const supabaseProjectRef = process.env["QA_EXPECTED_PROJECT_REF"] ?? "";

export default defineConfig({
  testDir: "./tests/e2e-qa",
  fullyParallel: false, // identity-scoped auth setup is easier to reason about serially
  forbidOnly: !!process.env["CI"],
  retries: 0,
  workers: 1,
  timeout: 30_000,
  reporter: [["html", { outputFolder: "playwright-report-qa", open: "never" }], ["list"]],
  outputDir: "test-results-qa",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "qa-setup",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "qa-chromium",
      testIgnore: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["qa-setup"],
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${QA_PORT} --strictPort`,
    url: baseURL,
    // Never reuse an already-running server — this suite must always
    // start its own, freshly pointed at the QA backend, never silently
    // attach to a normal dev server that might be wired to production.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      // Client-side — bundled into the browser. Publishable/anon key only,
      // safe to expose by Supabase's own design.
      VITE_SUPABASE_URL: supabaseUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
      VITE_SUPABASE_PROJECT_ID: supabaseProjectRef,
      VITE_SITE_URL: baseURL,
      // Server-side (SSR / TanStack Start server functions) — never
      // bundled to the browser. SUPABASE_SERVICE_ROLE_KEY in particular
      // must NEVER appear in a VITE_* key above.
      SUPABASE_URL: supabaseUrl,
      SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
      SUPABASE_PROJECT_ID: supabaseProjectRef,
      SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
    },
  },
});
