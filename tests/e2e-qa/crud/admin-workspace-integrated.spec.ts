// Admin per-beautician workspace — integrated cross-tab coherence
// regression. DESTRUCTIVE. Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:admin-workspace` / `test:e2e:qa:crud` scripts.
//
// This spec deliberately does NOT re-prove what each module's own
// dedicated suite already proves in isolation (full Services/Gallery/
// Reviews/Leads/Readiness CRUD lifecycles, per-module tenant isolation,
// etc — see the sibling specs in this directory). Its value is entirely
// in what only an integrated, single-session, multi-tab journey can show:
// that the SAME resolved professional stays correct as Admin switches
// tabs within one page instance (no remount between tabs), that an action
// taken on one tab (Verification) is visible on another (Activity) within
// that same session, and that two Admin actions taken from two different
// tabs in the same session compose correctly on the public page at once.
import { expect, test } from "@playwright/test";
import { runDestructiveQaPreflight } from "../../projects/beautyfolio/qa-destructive-preflight.ts";
import { beautyfolioProject } from "../../projects/beautyfolio/project.ts";

const AUTH_DIR = "playwright/.auth";
const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;

test.describe.serial("Admin workspace integrated coherence @crud @admin-workspace @tenant", () => {
  test("Admin navigates Profile -> Services -> Gallery -> Reviews -> Leads -> Readiness -> Verification -> Activity -> Availability for A without drift; cross-tab + public composition; B isolated; cleanup restores baseline", async ({
    browser,
  }) => {
    const { provider } = runDestructiveQaPreflight();

    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    if (!proA) throw new Error("QA professional fixtures not found.");
    const proAId = proA["id"] as string;
    const originalStatus = proA["status"] as string;
    const originalVerified = proA["is_verified"] as boolean;

    const existingAvailability = await provider.getRow("availability_settings", {
      beautician_profile_id: proAId,
    });
    const originalAcceptingBookings = existingAvailability
      ? (existingAvailability["accepting_bookings"] as boolean)
      : true;
    const hadExistingAvailabilityRow = !!existingAvailability;

    let profileTemporarilyPublished = false;

    try {
      if (originalStatus !== "published") {
        await provider.updateRow("beautician_profiles", { id: proAId }, { status: "published" });
        profileTemporarilyPublished = true;
      }

      const adminCtx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
      const adminPage = await adminCtx.newPage();
      await adminPage.goto(`/admin/beauticians/${proASlug}`);

      // ---- header identifies the correct professional before any tab
      // interaction ----
      await expect(adminPage.getByText(proA["display_name"] as string).first()).toBeVisible({
        timeout: 10_000,
      });

      // ---- walk several tabs in ONE session — same page instance, no
      // navigation between them — confirming each renders real,
      // A-specific content rather than stale/empty/wrong-profile state ----
      await adminPage.getByRole("button", { name: "Profile", exact: true }).click();
      await expect(
        adminPage.getByText(
          `Managing ${proA["display_name"]}'s professional identity and public information.`,
        ),
      ).toBeVisible({ timeout: 10_000 });

      await adminPage.getByRole("button", { name: "Services", exact: true }).click();
      await expect(
        adminPage.getByText(`Managing ${proA["display_name"]}'s priced offerings.`),
      ).toBeVisible({ timeout: 10_000 });

      await adminPage.getByRole("button", { name: "Gallery", exact: true }).click();
      await expect(
        adminPage.getByText(`Managing ${proA["display_name"]}'s portfolio images.`),
      ).toBeVisible({ timeout: 10_000 });

      await adminPage.getByRole("button", { name: "Reviews", exact: true }).click();
      await expect(
        adminPage.getByText(`Moderating testimonials for ${proA["display_name"]}.`),
      ).toBeVisible({ timeout: 10_000 });

      await adminPage.getByRole("button", { name: "Leads", exact: true }).click();
      await expect(
        adminPage.getByText(`Enquiries submitted through ${proA["display_name"]}'s public page.`),
      ).toBeVisible({ timeout: 10_000 });

      await adminPage.getByRole("button", { name: "Readiness", exact: true }).click();
      await expect(adminPage.getByText(/^Status: /)).toBeVisible({ timeout: 10_000 });

      // ---- cross-tab proof #1: verify on the Verification tab, confirm
      // it's visible on the Activity tab in the SAME session ----
      await adminPage.getByRole("button", { name: "Verification", exact: true }).click();
      await expect(adminPage.getByText("Unverified", { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });
      await adminPage.getByRole("button", { name: "Verify professional" }).click();
      await expect(adminPage.getByText("Verification updated")).toBeVisible({ timeout: 10_000 });

      await adminPage.getByRole("button", { name: "Activity", exact: true }).click();
      await expect(
        adminPage.getByTestId("activity-recent-list").getByText("verification changed").first(),
      ).toBeVisible({ timeout: 10_000 });

      // ---- cross-tab + public composition: also flip availability from
      // the SAME session, then confirm the public page shows BOTH the
      // verification badge AND the not-accepting-bookings state together ----
      await adminPage.getByRole("button", { name: "Availability", exact: true }).click();
      const toggle = adminPage.getByRole("switch", { name: "Accepting new booking requests" });
      const wasChecked = await toggle.isChecked();
      if (wasChecked) await toggle.click();
      await adminPage.getByRole("button", { name: "Save changes" }).click();
      await expect(adminPage.getByText("Availability updated")).toBeVisible({ timeout: 10_000 });

      const publicCtx = await browser.newContext();
      const publicPage = await publicCtx.newPage();
      await publicPage.goto(`/portfolio/${proASlug}`);
      await expect(
        publicPage.locator('[title="Reviewed and approved by BeautyFolio"]'),
      ).toBeVisible({ timeout: 10_000 });
      const availabilitySection = publicPage.locator("#availability");
      await availabilitySection.scrollIntoViewIfNeeded();
      await expect(
        availabilitySection.getByRole("button", { name: "Check availability" }),
      ).toHaveCount(0);
      await publicCtx.close();

      // ---- the resolved professional never drifted across all of the
      // above — re-check the header still names A, not some other profile ----
      await expect(adminPage.getByText(proA["display_name"] as string).first()).toBeVisible();

      await adminCtx.close();

      // ---- Professional B remains fully isolated from this session's
      // workspace ----
      const proBSlug = beautyfolioProject.qaIdentities.professionalB.slug;
      const proBCtx = await browser.newContext({
        storageState: `${AUTH_DIR}/qa-professional-b.json`,
      });
      const proBPage = await proBCtx.newPage();
      await proBPage.goto(`/admin/beauticians/${proASlug}`);
      await expect(proBPage).toHaveURL(/\/dashboard/, { timeout: 10_000 });
      await proBPage.goto(`/admin/beauticians/${proBSlug}`);
      await expect(proBPage).toHaveURL(/\/dashboard/, { timeout: 10_000 }); // B is not admin either
      await proBCtx.close();
    } finally {
      // ---- cleanup: is_verified is guard-trigger protected (see
      // verification.spec.ts / activity.spec.ts) — restore via a genuinely
      // admin-authenticated client, not the raw service-role provider.
      // availability_settings carries no such guard. ----
      const { createClient } = await import("@supabase/supabase-js");
      const adminRestoreClient = createClient(
        process.env["SUPABASE_URL"]!,
        process.env["QA_SUPABASE_PUBLISHABLE_KEY"]!,
      );
      await adminRestoreClient.auth.signInWithPassword({
        email: process.env["QA_ADMIN_EMAIL"]!,
        password: process.env["QA_ADMIN_PASSWORD"]!,
      });
      await adminRestoreClient
        .from("beautician_profiles")
        .update({ is_verified: originalVerified })
        .eq("id", proAId);
      await adminRestoreClient.auth.signOut();

      if (hadExistingAvailabilityRow) {
        await provider.updateRow(
          "availability_settings",
          { beautician_profile_id: proAId },
          { accepting_bookings: originalAcceptingBookings },
        );
      } else {
        await provider
          .deleteRow("availability_settings", { beautician_profile_id: proAId })
          .catch(() => {});
      }
      if (profileTemporarilyPublished) {
        await provider.updateRow("beautician_profiles", { id: proAId }, { status: originalStatus });
      }

      const restored = await provider.getRow("beautician_profiles", { id: proAId });
      expect(restored?.["is_verified"], "is_verified must be restored to baseline").toBe(
        originalVerified,
      );
      expect(restored?.["status"], "status must be restored to baseline").toBe(originalStatus);
      const restoredAvailability = await provider.getRow("availability_settings", {
        beautician_profile_id: proAId,
      });
      if (hadExistingAvailabilityRow) {
        expect(restoredAvailability?.["accepting_bookings"]).toBe(originalAcceptingBookings);
      } else {
        expect(
          restoredAvailability,
          "no temporary availability_settings row may remain",
        ).toBeNull();
      }
    }
  });
});
