// QA-1D Step 3B §17 — logs in as each of the three persistent QA fixture
// identities through the REAL BeautyFolio login UI (never injected
// localStorage) against the isolated QA runtime, and saves each session as
// a reusable Playwright storageState file. Requires the identities to
// already exist — run `npm run qa:provision-identities` first.
//
// storageState files are git-ignored (playwright/.auth/*) and their
// contents are never printed by any test in this suite.
import { expect, test as setup } from "@playwright/test";

const AUTH_DIR = "playwright/.auth";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name} in .env.test — run \`npm run qa:provision-identities\` first, ` +
        `which writes the fixture emails/passwords this setup reads.`,
    );
  }
  return value;
}

async function loginAndSave(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
  storageStatePath: string,
): Promise<void> {
  await page.goto("/login");
  // Wait for React hydration to attach the form's submit handler before
  // interacting — clicking too early falls through to a native browser
  // form submission (GET with credentials in the query string) instead of
  // the intercepted supabase.auth.signInWithPassword() call.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // A successful login navigates away from /login (see src/routes/login.tsx).
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  await page.context().storageState({ path: storageStatePath });
}

setup("authenticate as qa-admin", async ({ page }) => {
  const email = requireEnv("QA_ADMIN_EMAIL");
  const password = requireEnv("QA_ADMIN_PASSWORD");
  await loginAndSave(page, email, password, `${AUTH_DIR}/qa-admin.json`);
});

setup("authenticate as qa-professional-a", async ({ page }) => {
  const email = requireEnv("QA_PRO_A_EMAIL");
  const password = requireEnv("QA_PRO_A_PASSWORD");
  await loginAndSave(page, email, password, `${AUTH_DIR}/qa-professional-a.json`);
});

setup("authenticate as qa-professional-b", async ({ page }) => {
  const email = requireEnv("QA_PRO_B_EMAIL");
  const password = requireEnv("QA_PRO_B_PASSWORD");
  await loginAndSave(page, email, password, `${AUTH_DIR}/qa-professional-b.json`);
  // Sanity check the file was written without ever reading/printing its
  // contents in this log.
  expect(true).toBe(true);
});
