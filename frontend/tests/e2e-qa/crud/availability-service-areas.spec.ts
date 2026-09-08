// Availability + Service Areas — per-beautician Admin tab regression.
// DESTRUCTIVE. Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:availability-service-areas` / `test:e2e:qa:crud`
// scripts.
//
// Audited architecture: availability_settings + service_areas, their
// owner-scoped RLS (owns_beautician_profile(), already admin-inclusive),
// and the beautician's own /dashboard/availability + /dashboard/areas
// pages all already existed. Neither page was already split into a
// reusable presentational Manager component — both were extracted this
// phase into src/components/availability/availability-manager.tsx and
// src/components/service-areas/service-areas-manager.tsx, now shared
// verbatim by the professional's own dashboard pages AND this Admin tab.
// Admin can now edit the full availability settings form and perform
// full service-area add/edit/delete, all through the exact same
// bpId-parameterized core functions (getAvailabilityForProfile/
// saveAvailabilityForProfile/listServiceAreasForProfile/
// createServiceAreaForProfile/updateServiceArea/deleteServiceArea) the
// professional's own pages use — see src/data/admin/availability.server.ts.
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

async function openAvailabilityTab(page: Page, slug: string): Promise<void> {
  await page.goto(`/admin/beauticians/${slug}`);
  await page.getByRole("button", { name: "Availability", exact: true }).click();
}

test.describe.serial("Availability + Service Areas lifecycle @crud @availability @tenant", () => {
  test("Admin manages A's full availability settings and service areas, public/dashboard reflect it, B is blocked, cleanup restores baseline", async ({
    browser,
  }) => {
    const { provider, runId } = runDestructiveQaPreflight();
    const prefix = `${process.env["QA_RECORD_PREFIX"] ?? "QA_E2E_"}${runId}_`;

    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    if (!proA) throw new Error("QA professional fixtures not found.");
    const proAId = proA["id"] as string;
    const originalStatus = proA["status"] as string;

    const existingAvailability = await provider.getRow("availability_settings", {
      beautician_profile_id: proAId,
    });
    const originalAcceptingBookings = existingAvailability
      ? (existingAvailability["accepting_bookings"] as boolean)
      : true; // matches the column's own DB default — see migration.
    const originalTimezone = existingAvailability
      ? (existingAvailability["timezone"] as string)
      : "Asia/Kolkata"; // matches the column's own DB default.
    const hadExistingAvailabilityRow = !!existingAvailability;

    let profileTemporarilyPublished = false;
    let serviceAreaId: string | null = null;

    try {
      if (originalStatus !== "published") {
        await provider.updateRow("beautician_profiles", { id: proAId }, { status: "published" });
        profileTemporarilyPublished = true;
      }

      const adminCtx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
      const adminPage = await adminCtx.newPage();
      adminPage.on("dialog", (dialog) => dialog.accept());
      await openAvailabilityTab(adminPage, proASlug);

      // ---- CREATE: Admin adds a real service area through the extracted
      // ServiceAreasManager dialog (the same UI/validation the
      // professional's own /dashboard/areas page uses) ----
      await adminPage.getByRole("button", { name: "+ Add service area" }).click();
      await adminPage.getByLabel("Area / Locality").fill(`${prefix}Area`);
      await adminPage.getByLabel("City").fill(`${prefix}City`);
      await adminPage.getByLabel("State").fill(`${prefix}State`);
      await adminPage.getByRole("button", { name: "Save", exact: true }).click();
      await expect(adminPage.getByText("Service area added.")).toBeVisible({ timeout: 10_000 });
      await expect(adminPage.getByText(`${prefix}Area`)).toBeVisible({ timeout: 10_000 });

      const createdArea = await provider.getRow("service_areas", {
        beautician_profile_id: proAId,
        city: `${prefix}City`,
      });
      expect(createdArea, "service area must exist in DB after create").not.toBeNull();
      serviceAreaId = createdArea!["id"] as string;

      // ---- UPDATE: Admin edits that same service area ----
      await adminPage
        .getByRole("listitem")
        .filter({ hasText: `${prefix}Area` })
        .getByRole("button", { name: "Edit" })
        .click();
      await adminPage.getByLabel("City").fill(`${prefix}City-Edited`);
      await adminPage.getByRole("button", { name: "Save", exact: true }).click();
      await expect(adminPage.getByText("Service area updated.")).toBeVisible({ timeout: 10_000 });

      const editedArea = await provider.getRow("service_areas", { id: serviceAreaId });
      expect(editedArea?.["city"], "DB must reflect the edited city").toBe(`${prefix}City-Edited`);

      // ---- Admin edits the FULL availability settings form (not only
      // accepting_bookings) — toggle + timezone, one real Save ----
      const toggle = adminPage.getByRole("switch", { name: "Accepting new booking requests" });
      const timezoneInput = adminPage.getByLabel("Timezone");
      const wasChecked = await toggle.isChecked();
      if (wasChecked) await toggle.click();
      await timezoneInput.fill("America/New_York");
      await adminPage.getByRole("button", { name: "Save changes" }).click();
      await expect(adminPage.getByText("Availability updated")).toBeVisible({ timeout: 10_000 });
      await expect(adminPage.getByText("OFF", { exact: true })).toBeVisible({ timeout: 10_000 });

      const afterOff = await provider.getRow("availability_settings", {
        beautician_profile_id: proAId,
      });
      expect(afterOff?.["accepting_bookings"], "DB must reflect the OFF toggle").toBe(false);
      expect(afterOff?.["timezone"], "DB must reflect the edited timezone").toBe(
        "America/New_York",
      );

      // ---- public portfolio reflects the change — the "Check
      // availability" flow shows a not-accepting-bookings state instead of
      // the request form; wording stays enquiry/request, never
      // "confirmed booking" ----
      const publicCtx = await browser.newContext();
      const publicPage = await publicCtx.newPage();
      await publicPage.goto(`/portfolio/${proASlug}`);
      const availabilitySection = publicPage.locator("#availability");
      await availabilitySection.scrollIntoViewIfNeeded();
      await expect(
        availabilitySection.getByRole("button", { name: "Check availability" }),
      ).toHaveCount(0);
      const sectionText = await availabilitySection.innerText();
      expect(sectionText.toLowerCase()).not.toContain("confirmed booking");
      await publicCtx.close();

      // ---- Admin toggles back ON, public form reappears. Reload first —
      // a fresh navigation guarantees the form reflects the just-persisted
      // OFF state rather than racing the background refetch/reset that
      // follows the first save's query invalidation. ----
      await adminPage.reload();
      await openAvailabilityTab(adminPage, proASlug);
      await expect(adminPage.getByText("OFF", { exact: true })).toBeVisible({ timeout: 10_000 });
      await toggle.click();
      await adminPage.getByRole("button", { name: "Save changes" }).click();
      await expect(adminPage.getByText("Availability updated")).toBeVisible({ timeout: 10_000 });
      await expect(adminPage.getByText("ON", { exact: true })).toBeVisible({ timeout: 10_000 });

      const afterOn = await provider.getRow("availability_settings", {
        beautician_profile_id: proAId,
      });
      expect(afterOn?.["accepting_bookings"]).toBe(true);

      const publicCtx2 = await browser.newContext();
      const publicPage2 = await publicCtx2.newPage();
      await publicPage2.goto(`/portfolio/${proASlug}`);
      const availabilitySection2 = publicPage2.locator("#availability");
      await availabilitySection2.scrollIntoViewIfNeeded();
      await expect(
        availabilitySection2.getByRole("button", { name: "Check availability" }),
      ).toBeVisible({ timeout: 10_000 });
      await publicCtx2.close();

      // ---- Professional A's own dashboard still works and reflects the
      // same shared-core state (toggle + timezone) ----
      const proACtx = await browser.newContext({
        storageState: `${AUTH_DIR}/qa-professional-a.json`,
      });
      const proAPage = await proACtx.newPage();
      await proAPage.goto("/dashboard/availability");
      await expect(
        proAPage.getByRole("switch", { name: "Accepting new booking requests" }),
      ).toBeChecked({ timeout: 10_000 });
      await expect(proAPage.getByLabel("Timezone")).toHaveValue("America/New_York");
      await proAPage.goto("/dashboard/areas");
      await expect(proAPage.getByText(`${prefix}City-Edited`)).toBeVisible({ timeout: 10_000 });
      await proACtx.close();

      // ---- Professional B cannot access A's Admin tab or mutate A's
      // availability/service areas, including the specific area above ----
      const proBCtx = await browser.newContext({
        storageState: `${AUTH_DIR}/qa-professional-b.json`,
      });
      const proBPage = await proBCtx.newPage();
      await proBPage.goto(`/admin/beauticians/${proASlug}`);
      await expect(proBPage).toHaveURL(/\/dashboard/, { timeout: 10_000 });
      await proBCtx.close();

      const proBClient = createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"),
      );
      const signInB = await proBClient.auth.signInWithPassword({
        email: requireEnv("QA_PRO_B_EMAIL"),
        password: requireEnv("QA_PRO_B_PASSWORD"),
      });
      expect(signInB.error).toBeNull();

      const crossTenantAvailUpdate = await proBClient
        .from("availability_settings")
        .update({ accepting_bookings: false })
        .eq("beautician_profile_id", proAId)
        .select();
      expect(
        crossTenantAvailUpdate.data?.length ?? 0,
        "Professional B must not mutate A's availability",
      ).toBe(0);

      const crossTenantAreaUpdate = await proBClient
        .from("service_areas")
        .update({ city: "hijacked" })
        .eq("id", serviceAreaId)
        .select();
      expect(
        crossTenantAreaUpdate.data?.length ?? 0,
        "Professional B must not update A's service area",
      ).toBe(0);

      const crossTenantAreaDelete = await proBClient
        .from("service_areas")
        .delete()
        .eq("id", serviceAreaId)
        .select();
      expect(
        crossTenantAreaDelete.data?.length ?? 0,
        "Professional B must not delete A's service area",
      ).toBe(0);

      const crossTenantAreaInsert = await proBClient.from("service_areas").insert({
        beautician_profile_id: proAId,
        city: "hijacked",
      });
      expect(
        crossTenantAreaInsert.error,
        "Professional B must not insert a service area under A's profile",
      ).not.toBeNull();
      await proBClient.auth.signOut();

      const unchangedByB = await provider.getRow("availability_settings", {
        beautician_profile_id: proAId,
      });
      expect(unchangedByB?.["accepting_bookings"]).toBe(true);
      const areaUnchangedByB = await provider.getRow("service_areas", { id: serviceAreaId });
      expect(areaUnchangedByB?.["city"]).toBe(`${prefix}City-Edited`);

      // ---- DELETE: Admin removes the service area through the real UI
      // (window.confirm auto-accepted by the dialog handler registered
      // above) ----
      await adminPage.reload();
      await openAvailabilityTab(adminPage, proASlug);
      await adminPage
        .getByRole("listitem")
        .filter({ hasText: `${prefix}City-Edited` })
        .getByRole("button", { name: "Remove" })
        .click();
      await expect(adminPage.getByText("Service area removed.")).toBeVisible({ timeout: 10_000 });

      const deletedArea = await provider.getRow("service_areas", { id: serviceAreaId });
      expect(deletedArea, "service area must be gone from DB after delete").toBeNull();
      serviceAreaId = null;

      await adminCtx.close();
    } finally {
      // ---- cleanup: no guard-trigger blocks these tables' writes (unlike
      // beautician_profiles.is_verified), so the service-role provider can
      // restore them directly. ----
      if (serviceAreaId) {
        await provider.deleteRow("service_areas", { id: serviceAreaId }).catch(() => {});
      }
      if (hadExistingAvailabilityRow) {
        await provider.updateRow(
          "availability_settings",
          { beautician_profile_id: proAId },
          { accepting_bookings: originalAcceptingBookings, timezone: originalTimezone },
        );
      } else {
        // No row existed before this test — remove the one created along
        // the way so the QA baseline (no temporary availability_settings
        // rows) is restored exactly.
        await provider
          .deleteRow("availability_settings", { beautician_profile_id: proAId })
          .catch(() => {});
      }
      if (profileTemporarilyPublished) {
        await provider.updateRow("beautician_profiles", { id: proAId }, { status: originalStatus });
      }

      const restoredProfile = await provider.getRow("beautician_profiles", { id: proAId });
      expect(restoredProfile?.["status"], "status must be restored to baseline").toBe(
        originalStatus,
      );
      const restoredAvailability = await provider.getRow("availability_settings", {
        beautician_profile_id: proAId,
      });
      if (hadExistingAvailabilityRow) {
        expect(restoredAvailability?.["accepting_bookings"]).toBe(originalAcceptingBookings);
        expect(restoredAvailability?.["timezone"]).toBe(originalTimezone);
      } else {
        expect(
          restoredAvailability,
          "no temporary availability_settings row may remain",
        ).toBeNull();
      }
      const orphanArea = await provider.rowExists("service_areas", { city: `${prefix}City` });
      const orphanEditedArea = await provider.rowExists("service_areas", {
        city: `${prefix}City-Edited`,
      });
      expect(orphanArea || orphanEditedArea, "no seeded QA service area may remain").toBe(false);
    }
  });
});
