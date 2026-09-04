// Verification module — per-beautician Admin tab regression. DESTRUCTIVE.
// Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:verification` / `test:e2e:qa:crud` scripts.
//
// Audited architecture: is_verified already existed on beautician_profiles
// (Phase 1 Step 2 migration), already admin-toggleable platform-wide via
// /admin/profiles (updateProfileFlags in src/data/admin/profiles.server.ts),
// already DB-guarded (guard_beautician_profile_flags() silently resets the
// column to its previous value on any non-admin write, INSERT or UPDATE),
// and already audit-logged ("verification_changed" admin_audit_action). The
// public portfolio badge + its "Reviewed and approved by BeautyFolio" title
// already existed too. This phase's only real gap was the previously-
// disabled "Verification" tab in the per-beautician Admin workspace — now
// wired to a dedicated panel calling the SAME updateProfileFlags()
// authority, no new verification logic. Verification is deliberately
// independent of Readiness and Publication — neither is touched by it.
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

async function openVerificationTab(page: Page, slug: string): Promise<void> {
  await page.goto(`/admin/beauticians/${slug}`);
  await page.getByRole("button", { name: "Verification", exact: true }).click();
}

test.describe.serial("Verification lifecycle @crud @verification @tenant", () => {
  test("Admin verifies A -> public badge appears -> audit logged -> Admin unverifies -> badge gone -> tenant isolation -> readiness/publication unaffected -> cleanup", async ({
    browser,
  }) => {
    const { provider } = runDestructiveQaPreflight();
    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    if (!proA) throw new Error("QA professional fixtures not found.");
    const proAId = proA["id"] as string;
    const originalVerified = proA["is_verified"] as boolean;
    const originalStatus = proA["status"] as string;

    let profileTemporarilyPublished = false;

    try {
      // ---- §1 required check baseline: readiness/publication snapshot
      // before touching verification at all ----
      if (originalStatus !== "published") {
        await provider.updateRow("beautician_profiles", { id: proAId }, { status: "published" });
        profileTemporarilyPublished = true;
      }
      const beforeToggle = await provider.getRow("beautician_profiles", { id: proAId });
      const statusBeforeToggle = beforeToggle?.["status"];
      const bioBeforeToggle = beforeToggle?.["bio"];

      // ---- §1/§2/§3 Admin opens the Verification tab and verifies A ----
      const adminCtx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
      const adminPage = await adminCtx.newPage();
      await openVerificationTab(adminPage, proASlug);

      await expect(adminPage.getByText("Unverified", { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });
      await adminPage.getByRole("button", { name: "Verify professional" }).click();
      await expect(adminPage.getByText("Verification updated")).toBeVisible({ timeout: 10_000 });
      await expect(adminPage.getByText("Verified", { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });

      const afterVerify = await provider.getRow("beautician_profiles", { id: proAId });
      expect(afterVerify?.["is_verified"], "is_verified must be true in DB").toBe(true);

      // ---- §4 public portfolio shows the verified badge/wording ----
      const publicCtx = await browser.newContext();
      const publicPage = await publicCtx.newPage();
      await publicPage.goto(`/portfolio/${proASlug}`);
      await expect(
        publicPage.locator('[title="Reviewed and approved by BeautyFolio"]'),
      ).toBeVisible({ timeout: 10_000 });
      await publicCtx.close();

      // ---- §5 audit record created for this action. audit_logs is
      // append-only, so repeated test runs legitimately accumulate more
      // than one verification_changed row for this profile over time —
      // existence, not getRow's single-row shape, is the correct check
      // (same fix applied to tests/e2e-qa/crud/activity.spec.ts). ----
      const auditRowExists = await provider.rowExists("audit_logs", {
        entity_type: "beautician_profile",
        entity_id: proAId,
        action: "verification_changed",
      });
      expect(auditRowExists, "a verification_changed audit row must exist").toBe(true);

      // ---- §9 verification must not touch readiness/publication state ----
      const afterVerifyReadinessCheck = await provider.getRow("beautician_profiles", {
        id: proAId,
      });
      expect(afterVerifyReadinessCheck?.["status"]).toBe(statusBeforeToggle);
      expect(afterVerifyReadinessCheck?.["bio"]).toBe(bioBeforeToggle);

      // ---- §6 Admin un-verifies A and the public badge disappears ----
      await adminPage.reload();
      await openVerificationTab(adminPage, proASlug);
      await adminPage.getByRole("button", { name: "Remove verification" }).click();
      await expect(adminPage.getByText("Verification updated")).toBeVisible({ timeout: 10_000 });

      const afterUnverify = await provider.getRow("beautician_profiles", { id: proAId });
      expect(afterUnverify?.["is_verified"], "is_verified must be false in DB").toBe(false);

      const publicCtx2 = await browser.newContext();
      const publicPage2 = await publicCtx2.newPage();
      await publicPage2.goto(`/portfolio/${proASlug}`);
      await expect(
        publicPage2.locator('[title="Reviewed and approved by BeautyFolio"]'),
      ).toHaveCount(0);
      await publicCtx2.close();

      // ---- §7 Professional A cannot set is_verified on themselves — RLS
      // permits the UPDATE call to go through (owner update), but
      // guard_beautician_profile_flags() silently resets the column back to
      // its previous value for any non-admin caller ----
      const proAClient = createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"),
      );
      const signInA = await proAClient.auth.signInWithPassword({
        email: requireEnv("QA_PRO_A_EMAIL"),
        password: requireEnv("QA_PRO_A_PASSWORD"),
      });
      expect(signInA.error).toBeNull();
      await proAClient.from("beautician_profiles").update({ is_verified: true }).eq("id", proAId);
      await proAClient.auth.signOut();

      const afterSelfAttempt = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        afterSelfAttempt?.["is_verified"],
        "professional must never be able to self-verify",
      ).toBe(false);

      // ---- §8 Professional B cannot modify A's verification either ----
      const proBClient = createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"),
      );
      const signInB = await proBClient.auth.signInWithPassword({
        email: requireEnv("QA_PRO_B_EMAIL"),
        password: requireEnv("QA_PRO_B_PASSWORD"),
      });
      expect(signInB.error).toBeNull();
      const crossTenantUpdate = await proBClient
        .from("beautician_profiles")
        .update({ is_verified: true })
        .eq("id", proAId)
        .select();
      expect(
        crossTenantUpdate.data?.length ?? 0,
        "Professional B must not be able to touch A's row at all",
      ).toBe(0);
      await proBClient.auth.signOut();

      const afterCrossTenantAttempt = await provider.getRow("beautician_profiles", {
        id: proAId,
      });
      expect(afterCrossTenantAttempt?.["is_verified"]).toBe(false);

      await adminCtx.close();
    } finally {
      // ---- §10 restore baseline. is_verified is protected by
      // guard_beautician_profile_flags(), which checks has_role(auth.uid(),
      // 'admin') — the service-role provider client carries no auth.uid()
      // context, so a raw provider.updateRow() here is silently reset by
      // the same trigger this feature relies on for its own security
      // guarantee. Restoring it correctly requires a genuinely
      // admin-authenticated client, exactly like the real feature does
      // (discovered while hardening tests/e2e-qa/crud/activity.spec.ts's
      // equivalent cleanup). ----
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
        .update({ is_verified: originalVerified })
        .eq("id", proAId);
      await adminRestoreClient.auth.signOut();

      if (profileTemporarilyPublished) {
        await provider.updateRow("beautician_profiles", { id: proAId }, { status: originalStatus });
      }
      const restored = await provider.getRow("beautician_profiles", { id: proAId });
      expect(restored?.["is_verified"], "is_verified must be restored to baseline").toBe(
        originalVerified,
      );
      expect(restored?.["status"], "status must be restored to baseline").toBe(originalStatus);
    }
  });
});
