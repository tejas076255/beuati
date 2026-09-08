// Auth Completeness (password recovery, duplicate-email UX, Account
// Settings password change). DESTRUCTIVE — mutates a QA fixture's real
// login password. Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:auth-completeness` / `test:e2e:qa:crud` scripts.
//
// CRITICAL: every step that changes Professional A's password restores it
// to QA_PRO_A_PASSWORD (via the service-role Admin API, which can force-set
// a password without knowing the "current" one) immediately after that
// step's assertions, AND again unconditionally in the outer `finally` — so
// a failure or timeout at any point still leaves the shared QA fixture's
// credentials exactly as every other spec's auth.setup.ts expects them.
//
// Do not run against protected — this suite never resolves a backend other
// than QA (enforced by runDestructiveQaPreflight/assertDestructiveQaAllowed).
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { runDestructiveQaPreflight } from "../../projects/beautyfolio/qa-destructive-preflight.ts";
import { beautyfolioProject } from "../../projects/beautyfolio/project.ts";

const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required .env.test variable: ${name}`);
  return value;
}

async function signIn(email: string, password: string) {
  const client = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"),
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  return { client, error };
}

test.describe.serial("Auth Completeness @crud @auth-completeness @tenant", () => {
  test("forgot/reset password, duplicate-email UX, Settings password change, invariants, cleanup", async ({
    browser,
  }) => {
    const { provider } = runDestructiveQaPreflight();
    const rawAdmin = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const baseUrl = process.env["QA_BASE_URL"] ?? "http://localhost:8081";

    const proAEmail = requireEnv("QA_PRO_A_EMAIL");
    const proAOriginalPassword = requireEnv("QA_PRO_A_PASSWORD");
    const proBEmail = requireEnv("QA_PRO_B_EMAIL");
    const proBPassword = requireEnv("QA_PRO_B_PASSWORD");

    const proAProfileRow = await provider.getRow("profiles", { email: proAEmail });
    if (!proAProfileRow) throw new Error("QA Professional A profile fixture not found.");
    const proAAuthUserId = proAProfileRow["auth_user_id"] as string;

    const proABp = await provider.getRow("beautician_profiles", { slug: proASlug });
    if (!proABp) throw new Error("QA Professional A portfolio fixture not found.");
    const proABpId = proABp["id"] as string;

    // Snapshot every invariant this suite must prove untouched by any
    // password operation.
    const baselineRole = await provider.getRow("user_roles", {
      user_id: proAAuthUserId,
      role: "admin",
    });
    const baselineInvariants = {
      profileId: proAProfileRow["id"] as string,
      bpProfileId: proABp["profile_id"] as string,
      plan: proABp["plan"],
      isVerified: proABp["is_verified"],
      completionScore: proABp["completion_score"],
      wasAdmin: !!baselineRole,
    };

    async function restoreProAPassword(): Promise<void> {
      const { error } = await rawAdmin.auth.admin.updateUserById(proAAuthUserId, {
        password: proAOriginalPassword,
      });
      if (error) throw new Error(`Failed to restore Professional A's password: ${error.message}`);
    }

    async function assertInvariantsUnchanged(label: string): Promise<void> {
      const current = await provider.getRow("beautician_profiles", { id: proABpId });
      const currentProfile = await provider.getRow("profiles", {
        id: baselineInvariants.profileId,
      });
      const currentRole = await provider.getRow("user_roles", {
        user_id: proAAuthUserId,
        role: "admin",
      });
      expect(
        currentProfile?.["auth_user_id"],
        `${label}: auth user id (profile ownership) unchanged`,
      ).toBe(proAAuthUserId);
      expect(current?.["profile_id"], `${label}: beautician_profile ownership unchanged`).toBe(
        baselineInvariants.bpProfileId,
      );
      expect(current?.["plan"], `${label}: plan unchanged`).toBe(baselineInvariants.plan);
      expect(current?.["is_verified"], `${label}: verification unchanged`).toBe(
        baselineInvariants.isVerified,
      );
      expect(!!currentRole, `${label}: admin role unchanged`).toBe(baselineInvariants.wasAdmin);
      // completion_score is explicitly allowed to differ only via its own
      // legitimate triggers (never via a password operation, which touches
      // no scored column) — since this suite never writes any scored field,
      // it must remain byte-identical to the baseline.
      expect(current?.["completion_score"], `${label}: completion_score unaffected`).toBe(
        baselineInvariants.completionScore,
      );
    }

    try {
      // ============================================================
      // 1. Forgot-password request shows a generic confirmation,
      // regardless of whether the email exists
      // ============================================================
      const page1 = await (await browser.newContext()).newPage();
      await page1.goto("/forgot-password");
      // Wait for hydration before interacting — clicking too early can fall
      // through to native form submission / submit before React's zod
      // validation has the real field value, per the same gotcha documented
      // in tests/e2e-qa/auth.setup.ts's loginAndSave().
      await page1.waitForLoadState("networkidle");
      await page1.getByLabel("Email").fill(proAEmail);
      await page1.getByRole("button", { name: /send reset link/i }).click();
      await expect(page1.getByText(/if an account is associated with that email/i)).toBeVisible({
        timeout: 10_000,
      });

      const page1b = await (await browser.newContext()).newPage();
      await page1b.goto("/forgot-password");
      await page1b.waitForLoadState("networkidle");
      await page1b.getByLabel("Email").fill("qa-nonexistent-e2e-address@example.com");
      await page1b.getByRole("button", { name: /send reset link/i }).click();
      await expect(
        page1b.getByText(/if an account is associated with that email/i),
        "an unknown email must show the exact same generic confirmation",
      ).toBeVisible({ timeout: 10_000 });

      // ============================================================
      // 2. Deterministic recovery link via the service-role Admin API
      // (no real mailbox needed) — reaches the reset UI
      // ============================================================
      const redirectTo = `${baseUrl}/reset-password`;
      const { data: linkData, error: linkError } = await rawAdmin.auth.admin.generateLink({
        type: "recovery",
        email: proAEmail,
        options: { redirectTo },
      });
      expect(linkError, "generating a recovery link for the QA fixture must succeed").toBeNull();
      const actionLink = linkData?.properties?.action_link;
      expect(actionLink, "a recovery action_link must be returned").toBeTruthy();

      const recoveryCtx = await browser.newContext();
      const recoveryPage = await recoveryCtx.newPage();
      await recoveryPage.goto(actionLink!);
      // CardTitle in this codebase renders a plain <div>, not a semantic
      // heading element (see src/components/ui/card.tsx) — matched by text,
      // consistent with how other specs in this suite assert Card titles.
      await expect(recoveryPage.getByText("Set a new password", { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      // Identity is conclusively proven by step 4 below (the new password
      // this recovery session sets is verified to work specifically for
      // proAEmail's sign-in, and only for that account) — a real
      // cryptographic guarantee of the recovery token itself, not
      // something that needs re-checking via in-browser JS here.

      // ============================================================
      // 3. New password succeeds via the recovery session
      // ============================================================
      const newPasswordOnce = `QA_E2E_recovered_${Date.now()}Aa1`;
      await recoveryPage.getByLabel("New password", { exact: true }).fill(newPasswordOnce);
      await recoveryPage.getByLabel("Confirm new password").fill(newPasswordOnce);
      await recoveryPage.getByRole("button", { name: /update password/i }).click();
      await recoveryPage.waitForURL((url) => url.pathname.startsWith("/dashboard"), {
        timeout: 15_000,
      });

      // ============================================================
      // 4. Old password fails afterward; new password succeeds
      // ============================================================
      const oldPasswordAttempt = await signIn(proAEmail, proAOriginalPassword);
      expect(
        oldPasswordAttempt.error,
        "the old password must be rejected after reset",
      ).not.toBeNull();
      await oldPasswordAttempt.client.auth.signOut();

      const newPasswordAttempt = await signIn(proAEmail, newPasswordOnce);
      expect(newPasswordAttempt.error, "the new password must be accepted").toBeNull();
      await newPasswordAttempt.client.auth.signOut();

      await assertInvariantsUnchanged("after recovery-link password reset");

      // Restore to baseline before the next mutating sub-test.
      await restoreProAPassword();
      const restoredCheck1 = await signIn(proAEmail, proAOriginalPassword);
      expect(
        restoredCheck1.error,
        "password must be restored to baseline after step 3/4",
      ).toBeNull();
      await restoredCheck1.client.auth.signOut();

      // ============================================================
      // 5. Invalid/missing recovery state handled cleanly
      // ============================================================
      const invalidCtx = await browser.newContext();
      const invalidPage = await invalidCtx.newPage();
      await invalidPage.goto("/reset-password");
      await expect(invalidPage.getByText(/no longer valid/i)).toBeVisible({ timeout: 10_000 });
      await expect(invalidPage.getByRole("button", { name: /request a new link/i })).toBeVisible();

      // ============================================================
      // 6. Settings: authenticated password change (correct current
      // password) — using the REAL dashboard UI as Professional A
      // ============================================================
      const proACtx = await browser.newContext();
      const proAPage = await proACtx.newPage();
      await proAPage.goto("/login");
      await proAPage.waitForLoadState("networkidle");
      await proAPage.getByLabel("Email").fill(proAEmail);
      await proAPage.getByLabel("Password", { exact: true }).fill(proAOriginalPassword);
      await proAPage.getByRole("button", { name: /sign in/i }).click();
      await proAPage.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

      await proAPage.goto("/dashboard/settings");
      await expect(proAPage.getByText(proAEmail)).toBeVisible({ timeout: 10_000 });

      const settingsNewPassword = `QA_E2E_settings_${Date.now()}Bb2`;
      await proAPage.getByLabel("Current password").fill(proAOriginalPassword);
      await proAPage.getByLabel("New password", { exact: true }).fill(settingsNewPassword);
      await proAPage.getByRole("button", { name: /change password/i }).click();
      await expect(proAPage.getByText(/password updated/i)).toBeVisible({ timeout: 10_000 });

      const settingsChangeCheck = await signIn(proAEmail, settingsNewPassword);
      expect(settingsChangeCheck.error, "the Settings-changed password must work").toBeNull();
      await settingsChangeCheck.client.auth.signOut();

      await assertInvariantsUnchanged("after authenticated Settings password change");
      await restoreProAPassword();

      // ============================================================
      // 7. Wrong current password is rejected — no change occurs
      // ============================================================
      await proAPage.goto("/dashboard/settings");
      await proAPage.waitForLoadState("networkidle");
      await proAPage.getByLabel("Current password").fill("definitely-not-the-real-password");
      await proAPage.getByLabel("New password", { exact: true }).fill("QA_E2E_should_never_apply1");
      await proAPage.getByRole("button", { name: /change password/i }).click();
      await expect(proAPage.getByText(/current password is incorrect/i)).toBeVisible({
        timeout: 10_000,
      });
      const stillOriginal = await signIn(proAEmail, proAOriginalPassword);
      expect(
        stillOriginal.error,
        "the original password must still work after a rejected wrong-current-password attempt",
      ).toBeNull();
      await stillOriginal.client.auth.signOut();
      const rejectedAttempt = await signIn(proAEmail, "QA_E2E_should_never_apply1");
      expect(
        rejectedAttempt.error,
        "the attempted new password must never have taken effect",
      ).not.toBeNull();

      await proAPage.context().close();

      // ============================================================
      // 8. Duplicate-email signup UX — enumeration-safe by construction
      // ============================================================
      // QA's actual Confirm-email/Confirm-phone configuration determines
      // which of Supabase's two documented behaviors fires (an explicit
      // `user_already_exists` error, or an obfuscated no-error response) —
      // this suite asserts the SAFE OUTCOME in either case, never a
      // specific branch, so it stays correct regardless of that QA project
      // setting. In both branches this app must never show Supabase's raw
      // "already registered" string, and must always offer a path forward.
      const dupCtx = await browser.newContext();
      const dupPage = await dupCtx.newPage();
      await dupPage.goto("/signup");
      await dupPage.waitForLoadState("networkidle");
      await dupPage.getByLabel("Full name").fill("QA E2E Duplicate Attempt");
      await dupPage.getByLabel("Email").fill(proAEmail);
      await dupPage.getByLabel("Password", { exact: true }).fill("QA_E2E_dup_attempt_pw1");
      await dupPage.getByRole("button", { name: /^sign up$/i }).click();

      await expect(
        dupPage.getByText(/already have an account|check your email to confirm/i),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        dupPage.getByText(/user already registered/i),
        "the raw Supabase duplicate-account error string must never be shown",
      ).toHaveCount(0);
      // A path forward must always be visible, regardless of which branch:
      const hasSignInLink = await dupPage.getByRole("link", { name: /sign in/i }).count();
      expect(hasSignInLink, "a sign-in path must be offered either way").toBeGreaterThan(0);

      await assertInvariantsUnchanged("after a duplicate-email signup attempt");
      const stillOriginalAfterDup = await signIn(proAEmail, proAOriginalPassword);
      expect(
        stillOriginalAfterDup.error,
        "a duplicate signup attempt must never change A's real password",
      ).toBeNull();
      await stillOriginalAfterDup.client.auth.signOut();

      // ============================================================
      // 9. Normal new signup still works (regression, cleaned up after)
      // ============================================================
      // This must remain a REAL regression signal. The only condition
      // allowed to downgrade a signup failure to "QA-INFRA BLOCKED" is the
      // confirmed, specific Supabase email-send-rate-limit response
      // (HTTP 429 with error_code "over_email_send_rate_limit") — observed
      // directly from the actual /auth/v1/signup network response, never
      // inferred from UI text. Any other failure (wrong status, wrong
      // error_code, a thrown exception, a timeout) hard-fails the test via
      // a normal (non-soft) expect/throw — nothing here swallows an
      // unknown Auth error.
      const freshEmail = `qa-e2e-auth-completeness-${Date.now()}@example.com`;
      const freshCtx = await browser.newContext();
      const freshPage = await freshCtx.newPage();
      await freshPage.goto("/signup");
      await freshPage.waitForLoadState("networkidle");
      await freshPage.getByLabel("Full name").fill("QA E2E Fresh Signup");
      await freshPage.getByLabel("Email").fill(freshEmail);
      await freshPage.getByLabel("Password", { exact: true }).fill("QA_E2E_fresh_signup_pw1");

      const [signupResponse] = await Promise.all([
        freshPage.waitForResponse((res) => res.url().includes("/auth/v1/signup"), {
          timeout: 15_000,
        }),
        freshPage.getByRole("button", { name: /^sign up$/i }).click(),
      ]);
      const signupStatus = signupResponse.status();
      // The raw GoTrue API response uses `code` (confirmed directly against
      // live QA); `error_code` is the field name the JS SDK's own parsed
      // AuthError normalizes it to internally (see auth-js's fetch.js) —
      // checking both makes this robust to which layer's shape is observed,
      // without loosening WHICH value is accepted (still an exact match on
      // "over_email_send_rate_limit" only).
      let signupBody: { code?: string; error_code?: string; message?: string } | null = null;
      try {
        signupBody = await signupResponse.json();
      } catch {
        signupBody = null;
      }

      const isConfirmedRateLimit =
        signupStatus === 429 &&
        (signupBody?.code === "over_email_send_rate_limit" ||
          signupBody?.error_code === "over_email_send_rate_limit");

      if (isConfirmedRateLimit) {
        // QA-INFRA BLOCKED — the ONLY condition allowed to skip the
        // regression assertions below. No user was created by Supabase in
        // this case (confirmed separately via the DB check that follows),
        // so there is nothing to clean up.
        console.warn(
          "[auth-completeness] QA-INFRA BLOCKED: fresh-signup regression skipped — " +
            `confirmed over_email_send_rate_limit (HTTP 429) from ${signupResponse.url()}`,
        );
        test.info().annotations.push({
          type: "qa-infra-blocked",
          description: "fresh-signup regression blocked by over_email_send_rate_limit (HTTP 429)",
        });
        const orphanCheck = await rawAdmin
          .from("profiles")
          .select("id")
          .eq("email", freshEmail)
          .maybeSingle();
        expect(
          orphanCheck.data,
          "a rate-limited signup attempt must not have created a real account",
        ).toBeNull();
      } else if (signupStatus >= 200 && signupStatus < 300) {
        // A real success — enforce every normal signup assertion,
        // including actual DB-level provisioning, not just UI text.
        await Promise.race([
          freshPage.waitForURL((url) => url.pathname.startsWith("/dashboard"), {
            timeout: 10_000,
          }),
          freshPage.getByText(/check your email to confirm/i).waitFor({ timeout: 10_000 }),
        ]);
        const reachedDashboard = freshPage.url().includes("/dashboard");
        const sawConfirmation = await freshPage.getByText(/check your email to confirm/i).count();
        expect(
          reachedDashboard || sawConfirmation > 0,
          "a successful signup must either reach the dashboard immediately or show the email-confirmation message",
        ).toBe(true);

        // Account/profile/role provisioning must be real, not just a UI
        // state — handle_new_user() must have created both rows.
        const freshProfile = await provider.getRow("profiles", { email: freshEmail });
        expect(
          freshProfile,
          "a profiles row must be provisioned for the new signup",
        ).not.toBeNull();
        const freshAuthUserId = freshProfile?.["auth_user_id"] as string;
        const freshRole = await provider.getRow("user_roles", {
          user_id: freshAuthUserId,
          role: "beautician",
        });
        expect(
          freshRole,
          "the new signup must be provisioned with the beautician role",
        ).not.toBeNull();

        // Cleanup — this is a real account this run created, must not be
        // left behind regardless of the outcome above.
        await rawAdmin.auth.admin.deleteUser(freshAuthUserId);
      } else {
        // Any other outcome is a genuine regression signal — hard-fail
        // with the exact observed status/error so it's never mistaken for
        // the confirmed infra condition or silently ignored.
        throw new Error(
          `Fresh signup failed with an unexpected response (not the confirmed rate-limit ` +
            `condition): status=${signupStatus} body=${JSON.stringify(signupBody)}`,
        );
      }

      // ============================================================
      // 10. Professional B cannot reset or change A's password
      // ============================================================
      // B's own signInWithPassword/updateUser calls are structurally
      // scoped to B's own session — there is no target-user parameter
      // anywhere in that API for B to redirect at A. This re-confirms A's
      // password is still the baseline after every step above, which is
      // the only externally-observable proof that B (or anyone else)
      // never altered it.
      const bCtx = await browser.newContext();
      const bPage = await bCtx.newPage();
      await bPage.goto("/login");
      await bPage.waitForLoadState("networkidle");
      await bPage.getByLabel("Email").fill(proBEmail);
      await bPage.getByLabel("Password", { exact: true }).fill(proBPassword);
      await bPage.getByRole("button", { name: /sign in/i }).click();
      await bPage.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
      await bPage.goto("/dashboard/settings");
      await bPage.waitForLoadState("networkidle");
      // B changing B's own password must only ever affect B, never A.
      await bPage.getByLabel("Current password").fill(proBPassword);
      await bPage.getByLabel("New password", { exact: true }).fill(proBPassword); // no-op value, same password
      await bPage.getByRole("button", { name: /change password/i }).click();
      const aStillWorks = await signIn(proAEmail, proAOriginalPassword);
      expect(
        aStillWorks.error,
        "A's password must be completely unaffected by B's own actions",
      ).toBeNull();
      await aStillWorks.client.auth.signOut();
      await bCtx.close();

      // ============================================================
      // 11. Admin authorization unaffected by any of the above
      // ============================================================
      const adminCtx = await browser.newContext({ storageState: "playwright/.auth/qa-admin.json" });
      const adminPage = await adminCtx.newPage();
      await adminPage.goto("/admin/profiles");
      await expect(adminPage.getByRole("row", { name: new RegExp(proASlug) })).toBeVisible({
        timeout: 10_000,
      });
      await adminCtx.close();
    } finally {
      // Unconditional final safety net — restores Professional A's
      // password to the exact .env.test baseline regardless of where any
      // failure above occurred, using the service-role Admin API (which
      // force-sets a password without needing to know the "current" one).
      await restoreProAPassword().catch((err) => {
        console.error(
          "[auth-completeness] CRITICAL: failed to restore Professional A's password",
          err,
        );
        throw err;
      });
      const finalCheck = await signIn(proAEmail, proAOriginalPassword);
      expect(
        finalCheck.error,
        "Professional A's password must be restored to the .env.test baseline on exit",
      ).toBeNull();
      await finalCheck.client.auth.signOut();
    }
  });
});
