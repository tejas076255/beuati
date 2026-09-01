import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

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
    include: ["tests/unit/**/*.test.ts", "tests/security/**/*.test.ts"],
    watch: false,
    passWithNoTests: false,
    reporters: ["default"],
  },
});
