import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Test-only env loading — populates process.env for this Node test process
// so tests/helpers/providers/supabase-provider.ts's
// createSupabaseProviderFromEnv() can find SUPABASE_URL/
// SUPABASE_SERVICE_ROLE_KEY without any test file needing to know how the
// file is loaded. .env.test is git-ignored (see .gitignore) and never
// printed/logged here. Uses Node's built-in loader (no new dependency);
// silently no-ops when the file doesn't exist, so the rest of the suite
// still runs with zero secrets in CI or a fresh checkout. Isolated to this
// file — vite.config.ts (the app's own build/dev config) is untouched, so
// this has no effect on `npm run dev`/`npm run build`.
try {
  process.loadEnvFile(fileURLToPath(new URL("./.env.test", import.meta.url)));
} catch {
  // .env.test not present — expected in CI/fresh checkouts.
}

// Generic, reusable Vitest config — pure Node environment for framework-
// agnostic unit/security tests against exported helpers. No jsdom/browser
// globals; Playwright (tests/e2e) owns real browser coverage.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/security/**/*.test.ts",
      "tests/safety/**/*.test.ts",
      "tests/provider/**/*.test.ts",
    ],
    watch: false,
    passWithNoTests: false,
    reporters: ["default"],
  },
});
