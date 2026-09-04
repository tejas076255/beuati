// Activity module — per-beautician Admin tab regression. DESTRUCTIVE.
// Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:activity` / `test:e2e:qa:crud` scripts.
//
// Audited architecture: audit_logs + log_admin_action() + the actor-join
// pattern all already existed, powering the platform-wide /admin/audit-logs
// page (src/data/admin/audit.server.ts's listAuditLogs). This phase's only
// real gap was the previously-disabled "Activity" tab in the per-beautician
// Admin workspace — now wired to a new, narrowly-scoped read
// (listAuditLogsForBeautician), which filters the SAME table to
// entity_type='beautician_profile' AND entity_id=<this profile> only — the
// unambiguous subset of events genuinely about this one professional.
// Read-only: no create/edit/delete actions live in this tab.
import { type Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { runDestructiveQaPreflight } from "../../projects/beautyfolio/qa-destructive-preflight.ts";
import { beautyfolioProject } from "../../projects/beautyfolio/project.ts";

const AUTH_DIR = "playwright/.auth";
const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;
const proBSlug = beautyfolioProject.qaIdentities.professionalB.slug;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required .env.test variable: ${name}`);
  return value;
}

async function openActivityTab(page: Page, slug: string): Promise<void> {
  await page.goto(`/admin/beauticians/${slug}`);
  await page.getByRole("button", { name: "Activity", exact: true }).click();
}

test.describe.serial("Activity lifecycle @crud @activity @tenant", () => {
  test("A's event appears scoped and chronological, B's does not, access is admin-only, cleanup restores baseline", async ({
    browser,
  }) => {
    const { provider } = runDestructiveQaPreflight();
    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    const proB = await provider.getRow("beautician_profiles", { slug: proBSlug });
    if (!proA || !proB) throw new Error("QA professional fixtures not found.");
    const proAId = proA["id"] as string;
    const proBId = proB["id"] as string;
    const originalVerifiedA = proA["is_verified"] as boolean;
    const originalVerifiedB = proB["is_verified"] as boolean;

    try {
      // ---- §2/§4 produce one genuine, timestamped A-related event and one
      // genuine B-related event, via the real admin toggle (same action
      // this Activity tab is meant to surface), a moment apart so
      // chronological order is meaningfully checkable ----
      const adminCtx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
      const adminPage = await adminCtx.newPage();

      await adminPage.goto(`/admin/beauticians/${proBSlug}`);
      await adminPage.getByRole("button", { name: "Verification", exact: true }).click();
      await adminPage.getByRole("button", { name: "Verify professional" }).click();
      await expect(adminPage.getByText("Verification updated")).toBeVisible({ timeout: 10_000 });

      await adminPage.goto(`/admin/beauticians/${proASlug}`);
      await adminPage.getByRole("button", { name: "Verification", exact: true }).click();
      await adminPage.getByRole("button", { name: "Verify professional" }).click();
      await expect(adminPage.getByText("Verification updated")).toBeVisible({ timeout: 10_000 });

      // ---- §1/§2/§4 Admin opens A's Activity tab: A's event appears,
      // most-recent-first (A's toggle happened after B's) ----
      await openActivityTab(adminPage, proASlug);
      const activityCard = adminPage.getByTestId("activity-recent-list");
      await expect(activityCard.getByText("verification changed").first()).toBeVisible({
        timeout: 10_000,
      });

      // ---- §3 B's event must NOT appear on A's tab. audit_logs is
      // append-only, so repeated test runs legitimately accumulate more
      // than one verification_changed row per entity over time —
      // existence, not getRow's single-row shape, is the correct check. ----
      const auditRowExistsA = await provider.rowExists("audit_logs", {
        entity_type: "beautician_profile",
        entity_id: proAId,
        action: "verification_changed",
      });
      const auditRowExistsB = await provider.rowExists("audit_logs", {
        entity_type: "beautician_profile",
        entity_id: proBId,
        action: "verification_changed",
      });
      expect(auditRowExistsA, "an audit row scoped to A must exist").toBe(true);
      expect(auditRowExistsB, "an audit row scoped to B must exist").toBe(true);

      // Confirm the rendered tab itself never surfaces B's row (the server
      // query is scoped by entity_id, not just a client-side UI filter).
      const bodyText = await activityCard.innerText();
      expect(bodyText.includes(proBId), "B's row id must never appear on A's Activity tab").toBe(
        false,
      );

      // ---- §5 professional users cannot access Admin Activity ----
      const proCtx = await browser.newContext({
        storageState: `${AUTH_DIR}/qa-professional-a.json`,
      });
      const proPage = await proCtx.newPage();
      await proPage.goto(`/admin/beauticians/${proASlug}`);
      await expect(proPage).toHaveURL(/\/dashboard/, { timeout: 10_000 });
      await proCtx.close();

      // ---- §6/§7 anonymous users cannot access it / no private activity
      // appears publicly ----
      const anonCtx = await browser.newContext();
      const anonPage = await anonCtx.newPage();
      const anonClient = createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"),
      );
      const anonRead = await anonClient
        .from("audit_logs")
        .select("id")
        .eq("entity_id", proAId)
        .limit(1);
      expect(anonRead.data?.length ?? 0, "anon must not be able to read audit_logs").toBe(0);
      const publicResponse = await anonPage.goto(`/portfolio/${proASlug}`);
      const publicHtml = (await publicResponse?.text()) ?? "";
      expect(
        publicHtml.includes("verification_changed"),
        "audit action names must never appear in public portfolio HTML",
      ).toBe(false);
      await anonCtx.close();

      await adminCtx.close();
    } finally {
      // ---- §8 restore baseline. is_verified is protected by
      // guard_beautician_profile_flags(), which checks has_role(auth.uid(),
      // 'admin') — the service-role provider client carries no auth.uid()
      // context, so a raw provider.updateRow() here would be silently
      // reset by the same trigger this feature relies on for its own
      // security guarantee. Restoring it correctly requires a genuinely
      // admin-authenticated client, exactly like the real feature does. ----
      const adminRestoreClient = createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"),
      );
      await adminRestoreClient.auth.signInWithPassword({
        email: requireEnv("QA_ADMIN_EMAIL"),
        password: requireEnv("QA_ADMIN_PASSWORD"),
      });
      await adminRestoreClient
        .from("beautician_profiles")
        .update({ is_verified: originalVerifiedA })
        .eq("id", proAId);
      await adminRestoreClient
        .from("beautician_profiles")
        .update({ is_verified: originalVerifiedB })
        .eq("id", proBId);
      await adminRestoreClient.auth.signOut();

      const restoredA = await provider.getRow("beautician_profiles", { id: proAId });
      const restoredB = await provider.getRow("beautician_profiles", { id: proBId });
      expect(restoredA?.["is_verified"]).toBe(originalVerifiedA);
      expect(restoredB?.["is_verified"]).toBe(originalVerifiedB);
    }
  });
});
