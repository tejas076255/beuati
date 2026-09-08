// QA-1D Step 3B §18 — authenticated route checks using the storageState
// fixtures saved by auth.setup.ts. No business CRUD is performed — only
// navigation and access-control assertions.
import { expect, test } from "@playwright/test";

test.describe("qa-admin @qa @readonly", () => {
  test.use({ storageState: "playwright/.auth/qa-admin.json" });

  test("admin console is accessible", async ({ page }) => {
    await page.goto("/admin");
    // useRequireAdmin() redirects non-admins away — staying on /admin (or a
    // sub-route under it) is the proof the session actually carries the
    // admin role, not just any authenticated session.
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByText(/admin/i).first()).toBeVisible();
  });
});

test.describe("qa-professional-a @qa @readonly", () => {
  test.use({ storageState: "playwright/.auth/qa-professional-a.json" });

  test("dashboard is accessible", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("cannot reach the admin console by navigating to /admin directly", async ({ page }) => {
    await page.goto("/admin");
    // useRequireAdmin() redirects a non-admin authenticated user to
    // /dashboard/leads — never leaves them on /admin.
    await page.waitForURL((url) => !url.pathname.startsWith("/admin"), { timeout: 10_000 });
    expect(page.url()).not.toContain("/admin");
  });
});

test.describe("qa-professional-b @qa @readonly", () => {
  test.use({ storageState: "playwright/.auth/qa-professional-b.json" });

  test("dashboard is accessible", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("cannot reach the admin console by navigating to /admin directly", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL((url) => !url.pathname.startsWith("/admin"), { timeout: 10_000 });
    expect(page.url()).not.toContain("/admin");
  });
});
