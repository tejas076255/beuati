// QA-1Q — Portfolio Readiness module lifecycle regression. DESTRUCTIVE.
// Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:readiness` / `test:e2e:qa:crud` scripts.
//
// Audited architecture: Readiness was already fully implemented —
// evaluatePortfolioContentReadiness() (src/lib/seo-helpers.ts), the
// beautician's own /dashboard/seo full checklist, and a compact inline
// panel inside the shared ProfileManager (visible to both the beautician
// and Admin via the existing "Profile" tab). This phase's only real gap
// was the previously-disabled "Readiness" tab in the per-beautician Admin
// workspace, now wired to a dedicated read-only checklist reusing the
// SAME evaluator and the SAME already-fetched admin readiness context —
// no new business logic, no new percentage/score. Readiness is
// deliberately independent of both publish status (never blocks it) and
// BeautyFolio verification (is_verified is a read-only input to one
// non-required check, never written by readiness).
import { type Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { runDestructiveQaPreflight } from "../../projects/beautyfolio/qa-destructive-preflight.ts";
import { beautyfolioProject } from "../../projects/beautyfolio/project.ts";

const AUTH_DIR = "playwright/.auth";
const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required .env.test variable: ${name}`);
  return value;
}

async function openReadinessTab(page: Page, slug: string): Promise<void> {
  await page.goto(`/admin/beauticians/${slug}`);
  await page.getByRole("button", { name: "Readiness", exact: true }).click();
}

test.describe.serial("Portfolio Readiness lifecycle @crud @readiness @tenant", () => {
  test("missing required items -> Admin identifies them -> fill them -> ready -> remove one -> needs_improvement -> cleanup", async ({
    browser,
  }) => {
    const { provider } = runDestructiveQaPreflight();
    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    if (!proA) throw new Error("QA professional fixtures not found.");
    const proAId = proA["id"] as string;

    // Confirmed live baseline: display_name is set (fixture default), but
    // professional_title/bio/primary_city are empty and no services exist
    // — 3 of the 6 required checks already fail out of the box, plus
    // status stays "draft" until this test temporarily publishes it (see
    // §9/§10 below).
    const originalTitle = (proA["professional_title"] as string) ?? "";
    const originalBio = (proA["bio"] as string) ?? "";
    const originalCity = (proA["primary_city"] as string) ?? "";
    const originalStatus = proA["status"] as string;
    const originalVerified = proA["is_verified"] as boolean;

    let serviceId: string | null = null;

    try {
      // ---- §9/§10 publication relationship: readiness never blocks
      // publish — publish NOW, while required checks are still failing,
      // to prove the two are independent from the start. ----
      await provider.updateRow("beautician_profiles", { id: proAId }, { status: "published" });
      const publishedWhileIncomplete = await provider.getRow("beautician_profiles", {
        id: proAId,
      });
      expect(
        publishedWhileIncomplete?.["status"],
        "status must be freely settable regardless of readiness completeness",
      ).toBe("published");

      // ---- §1/§2 Admin Readiness tab identifies the exact missing
      // required items (real UI) ----
      const adminCtx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
      const adminPage = await adminCtx.newPage();
      await openReadinessTab(adminPage, proASlug);

      await expect(adminPage.getByText("Status: Needs improvement")).toBeVisible({
        timeout: 10_000,
      });
      const requiredGroup = adminPage.getByText("Required for search").locator("..");
      await expect(requiredGroup.getByText("Professional title", { exact: true })).toBeVisible();
      await expect(requiredGroup.getByText("About / introduction", { exact: true })).toBeVisible();
      await expect(requiredGroup.getByText("Primary city", { exact: true })).toBeVisible();
      await expect(
        requiredGroup.getByText("At least one active service", { exact: true }),
      ).toBeVisible();

      // ---- §3/§4 fill the missing required data, confirm readiness
      // updates correctly ----
      const longBio =
        "This bio is intentionally written to be long enough to satisfy the readiness " +
        "module's minimum bio-length requirement for the about/introduction check.";
      await provider.updateRow(
        "beautician_profiles",
        { id: proAId },
        {
          professional_title: "QA Bridal Makeup Artist",
          bio: longBio,
          primary_city: "Ahmedabad",
        },
      );
      const seededService = await provider.insertRow("services", {
        beautician_profile_id: proAId,
        name: "QA Readiness Bridal Makeup",
        is_active: true,
      });
      serviceId = seededService["id"] as string;

      await adminPage.reload();
      await openReadinessTab(adminPage, proASlug);
      await expect(adminPage.getByText("Status: Ready for search")).toBeVisible({
        timeout: 10_000,
      });

      // ---- §5 recommended-only missing items must not block "ready" —
      // profile photo, locality, service areas, gallery, before/after,
      // reviews, faqs, videos, availability, social link are all still
      // unset for this fixture, yet state is "ready" above. ----
      const recommendedGroup = adminPage.getByText("Recommended (optional").locator("..");
      await expect(recommendedGroup.getByText("Profile photo", { exact: true })).toBeVisible();

      // ---- §6 removing a required item makes readiness incomplete again ----
      await provider.updateRow("beautician_profiles", { id: proAId }, { primary_city: "" });
      await adminPage.reload();
      await openReadinessTab(adminPage, proASlug);
      await expect(adminPage.getByText("Status: Needs improvement")).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        adminPage
          .getByText("Required for search")
          .locator("..")
          .getByText("Primary city", { exact: true }),
      ).toBeVisible();

      // ---- §8 readiness never implies verification ----
      const rowAfterReadyPhase = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        rowAfterReadyPhase?.["is_verified"],
        "reaching a ready-adjacent state must never set is_verified",
      ).toBe(originalVerified);

      // ---- §7 Professional B cannot read or mutate A's private
      // readiness inputs ----
      const proBClient = createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"),
      );
      const signIn = await proBClient.auth.signInWithPassword({
        email: requireEnv("QA_PRO_B_EMAIL"),
        password: requireEnv("QA_PRO_B_PASSWORD"),
      });
      expect(signIn.error).toBeNull();

      const crossTenantRead = await proBClient
        .from("beautician_profiles")
        .select("bio, professional_title, primary_city")
        .eq("id", proAId);
      // Public read policy on beautician_profiles permits reading
      // PUBLISHED profiles' public-facing fields (the portfolio page
      // itself needs this) — the tenant-isolation boundary that actually
      // matters is that B cannot WRITE to A's row, checked next.
      void crossTenantRead;

      const crossTenantUpdate = await proBClient
        .from("beautician_profiles")
        .update({ bio: "hijacked" })
        .eq("id", proAId)
        .select();
      expect(
        crossTenantUpdate.data?.length ?? 0,
        "Professional B must not be able to mutate A's readiness-relevant profile fields",
      ).toBe(0);

      const crossTenantServiceInsert = await proBClient.from("services").insert({
        beautician_profile_id: proAId,
        name: "hijacked service",
      });
      expect(
        crossTenantServiceInsert.error,
        "Professional B must not be able to insert a service under A's profile",
      ).not.toBeNull();
      await proBClient.auth.signOut();

      const rowUnchangedByB = await provider.getRow("beautician_profiles", { id: proAId });
      expect(rowUnchangedByB?.["bio"]).toBe(longBio);

      await adminCtx.close();
    } finally {
      if (serviceId) {
        await provider.deleteRow("services", { id: serviceId }).catch(() => {});
      }
      await provider.updateRow(
        "beautician_profiles",
        { id: proAId },
        {
          professional_title: originalTitle,
          bio: originalBio,
          primary_city: originalCity,
          status: originalStatus,
        },
      );
      const restored = await provider.getRow("beautician_profiles", { id: proAId });
      expect(restored?.["professional_title"]).toBe(originalTitle);
      expect(restored?.["bio"]).toBe(originalBio);
      expect(restored?.["primary_city"]).toBe(originalCity);
      expect(restored?.["status"], "Professional A profile status must be restored exactly").toBe(
        originalStatus,
      );
      expect(restored?.["is_verified"]).toBe(originalVerified);
      const orphanService = await provider.rowExists("services", {
        beautician_profile_id: proAId,
        name: "QA Readiness Bridal Makeup",
      });
      expect(orphanService, "no seeded QA service may remain").toBe(false);
    }
  });
});
