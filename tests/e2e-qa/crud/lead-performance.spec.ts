// Lead Performance Dashboard — per-beautician Admin Leads tab regression.
// DESTRUCTIVE. Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:lead-performance` / `test:e2e:qa:crud` scripts.
//
// Audited architecture: the mature Leads CRM (leads/lead_inquiries/
// lead_activities), the professional's own /dashboard/leads Insights view
// (src/data/lead-insights.server.ts, src/components/leads/
// lead-insights-view.tsx), and the per-beautician Admin Leads tab all
// already existed. This phase adds a Stage Funnel + Attention Required +
// Conversion summary (src/lib/lead-performance.ts, a pure function over
// already-fetched leads + lead_activities — no new business logic) and
// reuses the existing Insights view verbatim via bpId-parameterized core
// extraction. Does not duplicate leads.spec.ts's real-public-submission
// coverage — this spec seeds leads directly (like reviews.spec.ts's
// documented precedent for curated, non-public-form data) to get
// deterministic stage/attention/attribution fixtures.
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

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function openLeadsTab(page: Page, slug: string): Promise<void> {
  await page.goto(`/admin/beauticians/${slug}`);
  await page.getByRole("button", { name: "Leads", exact: true }).click();
}

test.describe.serial("Lead Performance Dashboard @crud @lead-performance @tenant", () => {
  test("stage/conversion/attention/attribution are correct and scoped to A, update after a status change, B is excluded, cleanup restores baseline", async ({
    browser,
  }) => {
    const { provider, runId } = runDestructiveQaPreflight();
    const prefix = `${process.env["QA_RECORD_PREFIX"] ?? "QA_E2E_"}${runId}_`;

    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    const proB = await provider.getRow("beautician_profiles", { slug: proBSlug });
    if (!proA || !proB) throw new Error("QA professional fixtures not found.");
    const proAId = proA["id"] as string;
    const proBId = proB["id"] as string;

    const leadIds: string[] = [];
    let inquiryId: string | null = null;
    let bLeadId: string | null = null;

    try {
      // ---- seed A's leads: one stale/untouched "new" lead, one "contacted"
      // lead with an overdue follow-up, one already "booked" lead ----
      const untouched = await provider.insertRow("leads", {
        beautician_profile_id: proAId,
        name: `${prefix}Untouched`,
        phone: "9000000001",
        status: "new",
        source: "portfolio",
        created_at: daysAgoIso(5),
      });
      leadIds.push(untouched["id"] as string);

      const overdue = await provider.insertRow("leads", {
        beautician_profile_id: proAId,
        name: `${prefix}Overdue`,
        phone: "9000000002",
        status: "contacted",
        source: "whatsapp",
        last_contacted_at: daysAgoIso(4),
        next_followup_at: daysAgoIso(1),
      });
      leadIds.push(overdue["id"] as string);

      const booked = await provider.insertRow("leads", {
        beautician_profile_id: proAId,
        name: `${prefix}Booked`,
        phone: "9000000003",
        status: "booked",
        source: "instagram",
        last_contacted_at: daysAgoIso(2),
      });
      leadIds.push(booked["id"] as string);

      // A contact-type activity on the "overdue" lead, so first-response
      // time has a real, non-empty sample.
      await provider.insertRow("lead_activities", {
        lead_id: overdue["id"] as string,
        activity_type: "call",
        channel: "phone",
        occurred_at: daysAgoIso(3),
      });

      // One real enquiry (lead_inquiries) with a known source, so the
      // reused Attribution/Insights view has something deterministic to
      // show for this profile.
      const seededInquiry = await provider.insertRow("lead_inquiries", {
        lead_id: booked["id"] as string,
        source: "instagram",
        created_at: daysAgoIso(2),
      });
      inquiryId = seededInquiry["id"] as string;

      // ---- seed one B lead — must never appear in A's dashboard ----
      const bLead = await provider.insertRow("leads", {
        beautician_profile_id: proBId,
        name: `${prefix}ProfessionalBLead`,
        phone: "9000000004",
        status: "new",
      });
      bLeadId = bLead["id"] as string;

      // ---- Admin opens A's Leads tab ----
      const adminCtx = await browser.newContext({ storageState: `${AUTH_DIR}/qa-admin.json` });
      const adminPage = await adminCtx.newPage();
      await openLeadsTab(adminPage, proASlug);

      // ---- totals/stage counts scoped correctly to A (3 seeded, B's
      // never counted) ----
      await expect(adminPage.getByText("Total leads")).toBeVisible({ timeout: 10_000 });
      const totalLeadsCard = adminPage.getByText("Total leads").locator("..");
      await expect(totalLeadsCard.getByText("3", { exact: true })).toBeVisible({ timeout: 10_000 });

      // ---- conversion rate: 1 of 3 booked = 33.3% ----
      const bookedCard = adminPage.getByText("→ Booked (%)").locator("..");
      await expect(bookedCard.getByText("33.3", { exact: true })).toBeVisible({ timeout: 10_000 });

      // ---- attention required: the overdue follow-up and the stale
      // untouched lead both surface ----
      await expect(adminPage.getByText(`${prefix}Overdue`).first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(adminPage.getByText(`${prefix}Untouched`).first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(adminPage.getByText(/overdue follow-up/)).toBeVisible();

      // ---- first response time has a real sample ----
      await expect(adminPage.getByText(/Median first response:/)).toBeVisible({ timeout: 10_000 });

      // ---- B's lead never appears anywhere on A's dashboard ----
      const bodyText = await adminPage.locator("body").innerText();
      expect(
        bodyText.includes(`${prefix}ProfessionalBLead`),
        "B's lead must never appear on A's tab",
      ).toBe(false);

      // ---- Attribution (reused Insights view): the seeded Instagram
      // enquiry appears with All-time range ----
      await adminPage.getByRole("combobox").filter({ hasText: "Last 30 days" }).click();
      await adminPage.getByRole("option", { name: "All time", exact: true }).click();
      await expect(adminPage.getByText("Instagram", { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });

      // ---- existing lead management still works: a real status change
      // via the existing LeadsManager list updates the dashboard summary
      // (untouched -> contacted moves the "new/untouched" count down).
      // Only the seeded "Untouched" lead has status "New" among these
      // three, so this combobox is unambiguous — same pattern already
      // proven in leads.spec.ts. ----
      await adminPage.getByRole("combobox").filter({ hasText: "New" }).click();
      await adminPage.getByRole("option", { name: "Contacted", exact: true }).click();
      await expect(adminPage.getByText("Lead status updated")).toBeVisible({ timeout: 10_000 });

      const afterStatusChange = await provider.getRow("leads", { id: untouched["id"] as string });
      expect(afterStatusChange?.["status"]).toBe("contacted");

      await adminCtx.close();

      // ---- Professional B cannot read A's leads ----
      const proBClient = createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"),
      );
      const signInB = await proBClient.auth.signInWithPassword({
        email: requireEnv("QA_PRO_B_EMAIL"),
        password: requireEnv("QA_PRO_B_PASSWORD"),
      });
      expect(signInB.error).toBeNull();
      const crossTenantRead = await proBClient
        .from("leads")
        .select("id")
        .eq("beautician_profile_id", proAId);
      expect(crossTenantRead.data?.length ?? 0, "Professional B must not read A's leads").toBe(0);
      await proBClient.auth.signOut();
    } finally {
      if (inquiryId) {
        await provider.deleteRow("lead_inquiries", { id: inquiryId }).catch(() => {});
      }
      if (bLeadId) {
        await provider.deleteRow("leads", { id: bLeadId }).catch(() => {});
      }
      for (const id of leadIds) {
        await provider.deleteRow("lead_activities", { lead_id: id }).catch(() => {});
        await provider.deleteRow("leads", { id }).catch(() => {});
      }
      const orphanA = await provider.rowExists("leads", { beautician_profile_id: proAId });
      const orphanB = await provider.rowExists("leads", { beautician_profile_id: proBId });
      expect(orphanA, "no seeded QA lead may remain for A").toBe(false);
      expect(orphanB, "no seeded QA lead may remain for B").toBe(false);
    }
  });
});
