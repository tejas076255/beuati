import { expect, test } from "@playwright/test";
import { beautyfolioProject } from "../projects/beautyfolio/project";

// Non-destructive smoke checks only. No authentication, no data mutation.
test.describe("smoke @smoke", () => {
  test("homepage loads", async ({ page }) => {
    const response = await page.goto(beautyfolioProject.routes.home);
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveTitle(/.+/);
  });

  test("public portfolio page renders", async ({ page }) => {
    const response = await page.goto(beautyfolioProject.routes.samplePortfolio);
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveTitle(/.+/);
  });

  test("unauthenticated dashboard access redirects to login @security", async ({ page }) => {
    await page.goto(beautyfolioProject.routes.dashboard);
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain(beautyfolioProject.routes.login);
  });

  test("unauthenticated admin access does not expose the admin console @security", async ({
    page,
  }) => {
    await page.goto(beautyfolioProject.routes.admin);
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain(beautyfolioProject.routes.login);
  });
});
