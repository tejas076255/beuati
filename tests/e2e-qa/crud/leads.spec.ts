// QA-1P — Leads module lifecycle regression. DESTRUCTIVE.
// Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:leads` / `test:e2e:qa:crud` scripts.
//
// Audited architecture: Leads is an already-mature mini-CRM (public
// submission via the submit_lead() SECURITY DEFINER RPC, a full
// professional /dashboard/leads experience, and a platform-wide
// /admin/leads page) — this phase only added the previously-scaffolded
// per-beautician Admin tab. `leads` is a genuine public-creation table (the
// ONE module in this suite with a real public form), so this test drives
// the REAL "Check availability" form on the public portfolio page rather
// than seeding a lead directly.
//
// Product rule: a lead is an ENQUIRY, never a confirmed booking — the
// public form's own success copy explicitly states "This is a request,
// not a confirmed booking," verified below as real evidence, not assumed.
import { type Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  buildQaLeadContent,
  runDestructiveQaPreflight,
} from "../../projects/beautyfolio/qa-destructive-preflight.ts";
import { beautyfolioProject } from "../../projects/beautyfolio/project.ts";

const AUTH_DIR = "playwright/.auth";
const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required .env.test variable: ${name}`);
  return value;
}

function futureDateInput(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

async function openLeadsTab(page: Page, slug: string): Promise<void> {
  await page.goto(`/admin/beauticians/${slug}`);
  await page.getByRole("button", { name: "Leads", exact: true }).click();
}

test.describe.serial("Leads module lifecycle @crud @leads @tenant", () => {
  test("real public submission -> Admin visibility -> status change -> tenant isolation -> privacy -> cleanup", async ({
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
      // ---- prerequisites: publish + seed a real service so the form's
      // required Service <select> has a genuine option ----
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

      // ---- §1/§18 real public submission via the actual "Check
      // availability" form (submit_lead RPC) ----
      const publicCtx = await browser.newContext();
      const publicPage = await publicCtx.newPage();
      await publicPage.goto(`/portfolio/${proASlug}`);

      const availabilitySection = publicPage.locator("#availability");
      await availabilitySection.scrollIntoViewIfNeeded();
      await availabilitySection.getByLabel("Your name").fill(content.clientName);
      await availabilitySection.getByLabel("Phone number").fill(content.phone);
      await availabilitySection.getByLabel("Event date").fill(futureDateInput(60));
      await availabilitySection.getByLabel("Service").selectOption({ label: content.serviceName });
      await availabilitySection.getByLabel("Location").fill(content.location);
      await availabilitySection.getByLabel("Message (optional)").fill(content.message);
      await availabilitySection.getByRole("button", { name: "Check availability" }).click();

      // Evidence-based success signal — real DOM state, not toast — and
      // the exact product-rule copy confirming this is not a booking.
      await expect(publicPage.getByText("Availability request sent")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        publicPage.getByText("This is a request, not a confirmed booking."),
      ).toBeVisible();
      await publicCtx.close();

      // ---- confirm the exact lead row was created for the correct profile ----
      const createdLead = await provider.getRow("leads", {
        beautician_profile_id: proAId,
        phone: content.phone,
      });
      expect(createdLead, "submitted lead must exist for Professional A").not.toBeNull();
      leadId = createdLead!["id"] as string;
      expect(createdLead!["name"]).toBe(content.clientName);
      expect(createdLead!["status"]).toBe("new");
      expect(createdLead!["source"]).toBe("portfolio");
      expect(createdLead!["location"]).toBe(content.location);

      // ---- §2/§3 Admin sees it in A's per-beautician tab (real UI) ----
      const adminCtx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
      const adminPage = await adminCtx.newPage();
      await openLeadsTab(adminPage, proASlug);
      await expect(adminPage.getByText(content.clientName)).toBeVisible({ timeout: 10_000 });
      await expect(adminPage.getByText(content.phone)).toBeVisible({ timeout: 10_000 });

      // ---- §7 authorized status change works ----
      await adminPage.getByRole("combobox").filter({ hasText: "New" }).click();
      await adminPage.getByRole("option", { name: "Contacted", exact: true }).click();
      await expect(adminPage.getByText("Lead status updated")).toBeVisible({ timeout: 10_000 });

      const rowAfterStatusChange = await provider.getRow("leads", { id: leadId });
      expect(rowAfterStatusChange?.["status"]).toBe("contacted");

      // ---- §4/§5 Professional B cannot read or mutate A's lead ----
      const proBClient = createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"),
      );
      const signIn = await proBClient.auth.signInWithPassword({
        email: requireEnv("QA_PRO_B_EMAIL"),
        password: requireEnv("QA_PRO_B_PASSWORD"),
      });
      expect(signIn.error).toBeNull();

      const crossTenantRead = await proBClient.from("leads").select("id").eq("id", leadId);
      expect(crossTenantRead.data?.length ?? 0, "Professional B must not read A's lead").toBe(0);

      const crossTenantUpdate = await proBClient
        .from("leads")
        .update({ status: "lost" })
        .eq("id", leadId)
        .select();
      expect(crossTenantUpdate.data?.length ?? 0, "Professional B must not mutate A's lead").toBe(
        0,
      );
      await proBClient.auth.signOut();

      const rowUnchangedByB = await provider.getRow("leads", { id: leadId });
      expect(
        rowUnchangedByB?.["status"],
        "lead must survive the rejected cross-tenant attempt",
      ).toBe("contacted");

      // ---- §6 anonymous/public cannot list or read stored leads directly
      // (separate from submission, which goes through the SECURITY DEFINER
      // RPC, never a direct table read/insert grant for anon) ----
      const anonClient = createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"),
      );
      const anonRead = await anonClient.from("leads").select("id").eq("id", leadId);
      expect(anonRead.data?.length ?? 0, "anon must not be able to read stored leads").toBe(0);
      const anonList = await anonClient.from("leads").select("id").limit(1);
      expect(anonList.data?.length ?? 0, "anon must not be able to list any leads").toBe(0);

      // ---- §9 customer PII absent from the public portfolio response ----
      const publicCtx2 = await browser.newContext();
      const publicPage2 = await publicCtx2.newPage();
      const response = await publicPage2.goto(`/portfolio/${proASlug}`);
      const html = (await response?.text()) ?? "";
      expect(html.includes(content.phone), "submitted phone must never appear in public HTML").toBe(
        false,
      );
      expect(
        html.includes(content.message),
        "submitted message must never appear in public HTML",
      ).toBe(false);
      await publicCtx2.close();

      await adminCtx.close();
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
      const orphanInquiry = leadId
        ? await provider.rowExists("lead_inquiries", { lead_id: leadId })
        : false;
      expect(orphanInquiry, "no lead_inquiries row may remain (FK cascade)").toBe(false);
    }
  });
});
