// Per-portfolio GTM + marketing tracking phase — dataLayer event contract
// AND per-portfolio GTM container regression. DESTRUCTIVE (creates one real
// lead via the public form; writes/removes a real portfolio_tracking_
// settings row). Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:portfolio-tracking` / `test:e2e:qa:crud` scripts.
//
// Two describe blocks:
// 1. dataLayer event contract — schema-independent, proven against the real
//    public form (submit_lead RPC): portfolio_view fires, lead_submit fires
//    exactly once on genuine server-confirmed success and never on a
//    client-validation failure, no customer PII ever reaches
//    window.dataLayer.
// 2. Per-portfolio GTM container — requires the
//    portfolio_tracking_settings migration applied to QA first (see the
//    phase report). Admin save/update/remove + validation, tenant
//    isolation (A's GTM never on B's page), professional write rejection,
//    empty-config no-script, and Admin/dashboard route exclusion.
import { type Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  buildQaLeadContent,
  runDestructiveQaPreflight,
} from "../../projects/beautyfolio/qa-destructive-preflight.ts";
import { beautyfolioProject } from "../../projects/beautyfolio/project.ts";

const AUTH_DIR = "playwright/.auth";
const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;
const proBSlug = beautyfolioProject.qaIdentities.professionalB.slug;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required .env.test variable: ${name}`);
  return value;
}

async function openTrackingTab(page: Page, slug: string): Promise<void> {
  await page.goto(`/admin/beauticians/${slug}`);
  await page.getByRole("button", { name: "Tracking", exact: true }).click();
}

function futureDateInput(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

/** Every event this app ever pushes to dataLayer must exclude these —
 * asserted against the full serialized payload of every captured push, not
 * just the fields the app happens to name, so a future accidental PII field
 * addition would still be caught here. */
function assertNoPii(events: Record<string, unknown>[], pii: { phone: string; name: string }) {
  const serialized = JSON.stringify(events);
  expect(serialized.includes(pii.phone), "dataLayer must never contain the customer phone").toBe(
    false,
  );
  expect(serialized.includes(pii.name), "dataLayer must never contain the customer name").toBe(
    false,
  );
  for (const event of events) {
    expect(
      Object.keys(event),
      `event ${String(event["event"])} must never carry a name/phone/email/message field`,
    ).not.toEqual(expect.arrayContaining(["name", "phone", "email", "message", "customer_name"]));
  }
}

/** window.dataLayer is a plain array analytics.ts pushes onto and never
 * clears — reading its full current contents at each checkpoint is enough,
 * no interception needed. */
async function readDataLayer(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    () => (window as unknown as { dataLayer?: Record<string, unknown>[] }).dataLayer ?? [],
  );
}

test.describe.serial("Portfolio dataLayer tracking @crud @tracking @tenant", () => {
  test("portfolio_view fires, lead_submit fires once on real success, never on client-validation failure, no PII", async ({
    browser,
  }) => {
    const { provider, runId } = runDestructiveQaPreflight();
    const content = buildQaLeadContent(runId);
    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    if (!proA) throw new Error("QA professional fixtures not found.");
    const proAId = proA["id"] as string;
    const originalStatus = proA["status"] as string;

    let profileTemporarilyPublished = false;
    let serviceId: string | null = null;
    let leadId: string | null = null;

    try {
      if (originalStatus !== "published") {
        await provider.updateRow("beautician_profiles", { id: proAId }, { status: "published" });
        profileTemporarilyPublished = true;
      }
      const seededService = await provider.insertRow("services", {
        beautician_profile_id: proAId,
        name: content.serviceName,
        is_active: true,
      });
      serviceId = seededService["id"] as string;

      const context = await browser.newContext();
      const page = await context.newPage();

      // ---- portfolio_view fires on a real page load ----
      await page.goto(`/portfolio/${proASlug}`);
      await page.waitForTimeout(500);
      const afterLoad = await readDataLayer(page);
      const portfolioViewEvents = afterLoad.filter((e) => e["event"] === "portfolio_view");
      expect(portfolioViewEvents.length, "portfolio_view must fire on a real page visit").toBe(1);
      expect(portfolioViewEvents[0]?.["profile_slug"]).toBe(proASlug);

      // ---- a client-validation failure (invalid phone) must never emit
      // lead_submit — the form returns before calling submitPortfolioLeadFn ----
      const availabilitySection = page.locator("#availability");
      await availabilitySection.scrollIntoViewIfNeeded();
      await availabilitySection.getByLabel("Your name").fill(content.clientName);
      await availabilitySection.getByLabel("Phone number").fill("123"); // invalid, fails isValidPhone()
      await availabilitySection.getByLabel("Event date").fill(futureDateInput(60));
      await availabilitySection.getByLabel("Service").selectOption({ label: content.serviceName });
      await availabilitySection.getByLabel("Location").fill(content.location);
      await availabilitySection.getByRole("button", { name: "Check availability" }).click();
      await expect(page.getByText("Enter a valid phone number.")).toBeVisible({ timeout: 5_000 });
      const afterInvalidSubmit = await readDataLayer(page);
      expect(
        afterInvalidSubmit.filter((e) => e["event"] === "lead_submit").length,
        "an invalid/rejected submission must never emit lead_submit",
      ).toBe(0);

      // ---- a genuine, server-confirmed success emits lead_submit exactly
      // once (not on a duplicate render, not twice) ----
      await availabilitySection.getByLabel("Phone number").fill(content.phone);
      await availabilitySection.getByRole("button", { name: "Check availability" }).click();
      await expect(page.getByText("Availability request sent")).toBeVisible({ timeout: 15_000 });

      const createdLead = await provider.getRow("leads", {
        beautician_profile_id: proAId,
        phone: content.phone,
      });
      expect(createdLead, "the real lead must exist after a genuine success").not.toBeNull();
      leadId = createdLead!["id"] as string;

      const afterSuccess = await readDataLayer(page);
      const leadSubmitEvents = afterSuccess.filter((e) => e["event"] === "lead_submit");
      expect(leadSubmitEvents.length, "lead_submit must fire exactly once on real success").toBe(1);
      expect(leadSubmitEvents[0]?.["profile_slug"]).toBe(proASlug);
      expect(leadSubmitEvents[0]?.["service_id"]).toBe(serviceId);

      // ---- no customer PII anywhere in the captured dataLayer ----
      assertNoPii(afterSuccess, { phone: content.phone, name: content.clientName });

      await context.close();
    } finally {
      if (leadId) {
        await provider.deleteRow("leads", { id: leadId }).catch(() => {});
      }
      if (serviceId) {
        await provider.deleteRow("services", { id: serviceId }).catch(() => {});
      }
      if (profileTemporarilyPublished) {
        await provider.updateRow("beautician_profiles", { id: proAId }, { status: originalStatus });
      }
      const restored = await provider.getRow("beautician_profiles", { id: proAId });
      expect(restored?.["status"], "Professional A profile status must be restored exactly").toBe(
        originalStatus,
      );
      const orphanLead = await provider.rowExists("leads", { name: content.clientName });
      expect(orphanLead, "no lead with this runId may remain").toBe(false);
    }
  });
});

test.describe.serial("Per-portfolio GTM container @crud @tracking @tenant", () => {
  test("Admin saves/updates/removes A's GTM ID, invalid IDs rejected, professional write blocked, A's public page loads A's GTM only, B never sees it, empty config loads nothing, Admin/dashboard load nothing", async ({
    browser,
  }) => {
    const { provider } = runDestructiveQaPreflight();
    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    const proB = await provider.getRow("beautician_profiles", { slug: proBSlug });
    if (!proA || !proB) throw new Error("QA professional fixtures not found.");
    const proAId = proA["id"] as string;
    const proBId = proB["id"] as string;
    const originalStatusA = proA["status"] as string;

    let profileATemporarilyPublished = false;

    try {
      if (originalStatusA !== "published") {
        await provider.updateRow("beautician_profiles", { id: proAId }, { status: "published" });
        profileATemporarilyPublished = true;
      }

      // ---- Admin saves A's GTM ID ----
      const adminCtx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
      const adminPage = await adminCtx.newPage();
      await openTrackingTab(adminPage, proASlug);
      const gtmInput = adminPage.getByPlaceholder("GTM-XXXXXXX");
      await gtmInput.fill("gtm-abcd123");
      await adminPage.getByRole("button", { name: "Save", exact: true }).click();
      await expect(adminPage.getByText("GTM container ID saved")).toBeVisible({
        timeout: 10_000,
      });

      const savedRow = await provider.getRow("portfolio_tracking_settings", {
        beautician_profile_id: proAId,
      });
      expect(savedRow, "tracking settings row must exist after save").not.toBeNull();
      // ---- normalized to uppercase server-side, regardless of input case ----
      expect(savedRow?.["gtm_container_id"]).toBe("GTM-ABCD123");

      // ---- invalid ID rejected, does not overwrite the valid saved value ----
      await adminPage.reload();
      await adminPage.getByRole("button", { name: "Tracking", exact: true }).click();
      await expect(gtmInput).toHaveValue("GTM-ABCD123", { timeout: 10_000 });
      await gtmInput.fill("not-a-valid-id");
      await adminPage.getByRole("button", { name: "Update", exact: true }).click();
      await expect(
        adminPage.getByText("Enter a valid GTM container ID (e.g. GTM-XXXXXXX)."),
      ).toBeVisible({ timeout: 5_000 });
      const afterInvalidAttempt = await provider.getRow("portfolio_tracking_settings", {
        beautician_profile_id: proAId,
      });
      expect(
        afterInvalidAttempt?.["gtm_container_id"],
        "an invalid submission must never persist",
      ).toBe("GTM-ABCD123");

      // ---- update to a new valid value works ----
      await gtmInput.fill("GTM-NEWID99");
      await adminPage.getByRole("button", { name: "Update", exact: true }).click();
      await expect(adminPage.getByText("GTM container ID saved")).toBeVisible({
        timeout: 10_000,
      });
      const afterUpdate = await provider.getRow("portfolio_tracking_settings", {
        beautician_profile_id: proAId,
      });
      expect(afterUpdate?.["gtm_container_id"]).toBe("GTM-NEWID99");

      // ---- Professional (even A themselves) cannot write tracking settings
      // — direct client attempt, RLS must reject it (no admin write policy
      // exists for non-admins on this table) ----
      const proAClient = createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"),
      );
      const signInA = await proAClient.auth.signInWithPassword({
        email: requireEnv("QA_PRO_A_EMAIL"),
        password: requireEnv("QA_PRO_A_PASSWORD"),
      });
      expect(signInA.error).toBeNull();
      const proAWriteAttempt = await proAClient
        .from("portfolio_tracking_settings")
        .update({ gtm_container_id: "GTM-HACKED1" })
        .eq("beautician_profile_id", proAId)
        .select();
      expect(
        proAWriteAttempt.data?.length ?? 0,
        "a professional must never be able to write their own tracking settings this phase",
      ).toBe(0);
      await proAClient.auth.signOut();
      const rowUnchangedByProfessional = await provider.getRow("portfolio_tracking_settings", {
        beautician_profile_id: proAId,
      });
      expect(rowUnchangedByProfessional?.["gtm_container_id"]).toBe("GTM-NEWID99");

      // ---- A's public portfolio loads A's GTM container (real network
      // request, not just inline-script text presence) ----
      const publicCtxA = await browser.newContext();
      const publicPageA = await publicCtxA.newPage();
      const gtmRequestA = publicPageA.waitForRequest(
        (req) =>
          req.url().includes("googletagmanager.com/gtm.js") && req.url().includes("GTM-NEWID99"),
        { timeout: 10_000 },
      );
      await publicPageA.goto(`/portfolio/${proASlug}`);
      await expect(gtmRequestA).resolves.toBeTruthy();
      await publicCtxA.close();

      // ---- B's public portfolio never loads A's GTM ----
      const publicCtxB = await browser.newContext();
      const publicPageB = await publicCtxB.newPage();
      let sawAsGtmOnB = false;
      publicPageB.on("request", (req) => {
        if (req.url().includes("GTM-NEWID99")) sawAsGtmOnB = true;
      });
      await publicPageB.goto(`/portfolio/${proBSlug}`);
      await publicPageB.waitForTimeout(1500);
      expect(sawAsGtmOnB, "Professional B's page must never load A's GTM container").toBe(false);
      await publicCtxB.close();

      // ---- remove works ----
      await adminPage.reload();
      await adminPage.getByRole("button", { name: "Tracking", exact: true }).click();
      await expect(gtmInput).toHaveValue("GTM-NEWID99", { timeout: 10_000 });
      adminPage.once("dialog", (dialog) => dialog.accept());
      await adminPage.getByRole("button", { name: "Remove", exact: true }).click();
      await expect(adminPage.getByText("GTM container ID removed")).toBeVisible({
        timeout: 10_000,
      });
      const afterRemove = await provider.getRow("portfolio_tracking_settings", {
        beautician_profile_id: proAId,
      });
      expect(afterRemove, "the row must be gone after Remove").toBeNull();

      // ---- empty config loads no portfolio GTM script on the public page ----
      const publicCtxEmpty = await browser.newContext();
      const publicPageEmpty = await publicCtxEmpty.newPage();
      let sawAnyGtmRequest = false;
      publicPageEmpty.on("request", (req) => {
        if (req.url().includes("googletagmanager.com/gtm.js")) sawAnyGtmRequest = true;
      });
      await publicPageEmpty.goto(`/portfolio/${proASlug}`);
      await publicPageEmpty.waitForTimeout(1500);
      expect(sawAnyGtmRequest, "no GTM request when tracking config is absent").toBe(false);
      await publicCtxEmpty.close();

      // ---- Admin/dashboard routes never load a portfolio GTM script, even
      // while A had a real container ID configured earlier in this test ----
      await adminPage.goto(`/admin/beauticians/${proASlug}`);
      const adminHtml = await adminPage.content();
      expect(
        adminHtml.includes("googletagmanager.com/gtm.js"),
        "Admin workspace must never load a per-portfolio GTM script",
      ).toBe(false);

      await adminCtx.close();
    } finally {
      // provider.deleteRow() assumes every table has an "id" column (it
      // selects "id" back to report rows affected) — this table's primary
      // key is beautician_profile_id itself, so a direct service-role
      // client is used for cleanup here instead.
      const rawAdmin = createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      );
      await rawAdmin
        .from("portfolio_tracking_settings")
        .delete()
        .eq("beautician_profile_id", proAId);
      await rawAdmin
        .from("portfolio_tracking_settings")
        .delete()
        .eq("beautician_profile_id", proBId);
      if (profileATemporarilyPublished) {
        await provider.updateRow(
          "beautician_profiles",
          { id: proAId },
          { status: originalStatusA },
        );
      }
      const restoredA = await provider.getRow("beautician_profiles", { id: proAId });
      expect(restoredA?.["status"], "Professional A profile status must be restored exactly").toBe(
        originalStatusA,
      );
      const orphanA = await provider.rowExists("portfolio_tracking_settings", {
        beautician_profile_id: proAId,
      });
      const orphanB = await provider.rowExists("portfolio_tracking_settings", {
        beautician_profile_id: proBId,
      });
      expect(orphanA, "no tracking settings row may remain for A").toBe(false);
      expect(orphanB, "no tracking settings row may remain for B").toBe(false);
    }
  });
});
