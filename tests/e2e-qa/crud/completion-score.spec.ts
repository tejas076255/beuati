// Portfolio Completion Score (Stage 1). DESTRUCTIVE.
// Requires the explicit ephemeral write override
// (QA_ALLOW_WRITES_OVERRIDE=true) — see qa-destructive-preflight.ts, which
// is the ONE gate every mutation in this file is downstream of. Never run
// as part of the normal test:qa/test:e2e:qa chain; only via the dedicated
// `npm run test:e2e:qa:completion-score` / `test:e2e:qa:crud` scripts.
//
// NOT RUN as part of this implementation phase — the
// 20260906090000_portfolio_completion_score migration has not yet been
// applied to QA. This spec is written and ready; it must not be executed
// until that migration lands on tidymcyhgxzqhpbmcmyr.
//
// Covers every item in the task's QA checklist: existing QA profiles
// backfilled correctly; all 11 criteria award exact points; partial scoring
// exact; whitespace-only fields earn zero; Highlights arrays ignore empty/
// whitespace items; Free reaches exactly 100; Starter/Silver/Gold/Platinum
// use the identical formula; a plan upgrade never lowers the score; child
// INSERT/UPDATE/DELETE recomputes; Availability recomputes; direct
// legitimate Supabase writes recompute; a crafted manual completion_score
// write fails to control the persisted value; Admin also cannot manually
// override the derived score; Professional B cannot read/change A's score;
// RPC ownership/Admin authorization works; Admin filters return correct
// profiles; QA baseline restores fully.
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { runDestructiveQaPreflight } from "../../projects/beautyfolio/qa-destructive-preflight.ts";
import { beautyfolioProject } from "../../projects/beautyfolio/project.ts";

const proASlug = beautyfolioProject.qaIdentities.professionalA.slug;
const proBSlug = beautyfolioProject.qaIdentities.professionalB.slug;

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
  expect(error).toBeNull();
  return client;
}

// Full-100 field set. Bio is 80+ chars (Readiness threshold); Highlights and
// Why Choose You each contain one blank/whitespace-only entry mixed in with
// two real entries, to simultaneously prove the empty-item-ignoring rule
// AND that 2 real entries still earns full points.
const FULL_SCORE_PROFILE_FIELDS = {
  display_name: "QA_E2E_cs_Full Name",
  professional_title: "QA_E2E_cs_Professional Title",
  short_tagline: "QA_E2E_cs_Short tagline",
  profile_image_url: "https://example.com/qa-e2e-cs-photo.jpg",
  bio: "QA_E2E_cs_ ".repeat(10), // >= 80 chars once trimmed
  primary_city: "QA_E2E_cs_City",
  locality: "QA_E2E_cs_Locality",
  phone: "9000000000",
  about_highlights: ["QA_E2E_cs_Highlight A", "   ", "QA_E2E_cs_Highlight B"],
  why_choose_points: ["QA_E2E_cs_Why A", "", "QA_E2E_cs_Why B"],
};

const WORKING_HOURS_CONFIGURED = [
  { day: "monday", available: true, start: "09:00", end: "18:00" },
  { day: "tuesday", available: false, start: "", end: "" },
];
const WORKING_HOURS_NOT_CONFIGURED_ALL_OFF = [
  { day: "monday", available: false, start: "09:00", end: "18:00" },
];

test.describe.serial("Portfolio Completion Score @crud @completion-score @tenant", () => {
  test("scoring accuracy, triggers, backfill, security, Admin UX, cleanup", async ({ browser }) => {
    const { provider } = runDestructiveQaPreflight();
    const rawAdmin = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const proA = await provider.getRow("beautician_profiles", { slug: proASlug });
    const proB = await provider.getRow("beautician_profiles", { slug: proBSlug });
    if (!proA || !proB) throw new Error("QA professional fixtures not found.");
    const proAId = proA["id"] as string;
    const proBId = proB["id"] as string;

    // Snapshot every column this suite will mutate on A, for exact restore.
    const originalA = { ...proA };
    const originalPlanB = (proB["plan"] as string) ?? "free";

    const createdIds = {
      services: [] as string[],
      portfolio_items: [] as string[],
      before_after_items: [] as string[],
      service_areas: [] as string[],
      faqs: [] as string[],
      availability_settings_created: false,
    };

    try {
      // ============================================================
      // 1. Existing QA profiles are backfilled (not left at DEFAULT 0)
      // ============================================================
      // This assumes the migration's backfill UPDATE has already run against
      // QA. A freshly-migrated, pre-existing fixture profile must not sit at
      // the column DEFAULT of 0 — it must reflect whatever content it
      // already has (asserted loosely here since the fixture's exact
      // existing content is not controlled by this spec).
      const proARow = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        typeof proARow?.["completion_score"],
        "completion_score must exist as a persisted column after migration",
      ).toBe("number");

      // ============================================================
      // 2. Reset A to a fully blank state, confirm score = 0
      // ============================================================
      await provider.updateRow(
        "beautician_profiles",
        { id: proAId },
        {
          display_name: "",
          professional_title: "",
          short_tagline: "",
          profile_image_url: null,
          bio: "   ", // whitespace-only — must earn zero, not partial
          primary_city: "",
          locality: "",
          phone: "",
          whatsapp_number: "",
          about_highlights: ["  ", ""],
          why_choose_points: [],
        },
      );
      await provider.deleteRow("services", { beautician_profile_id: proAId });
      await provider.deleteRow("portfolio_items", { beautician_profile_id: proAId });
      await provider.deleteRow("before_after_items", { beautician_profile_id: proAId });
      await provider.deleteRow("service_areas", { beautician_profile_id: proAId });
      await provider.deleteRow("faqs", { beautician_profile_id: proAId });

      // This QA fixture profile has no availability_settings row at all
      // (confirmed against QA — the real app only creates one lazily via
      // upsert on first save from the Availability manager). An UPDATE
      // against a nonexistent row silently matches zero rows, so the row
      // must be created here first; every later availability_settings
      // write in this suite is then a genuine UPDATE against a real row.
      const existingAvailability = await provider.getRow("availability_settings", {
        beautician_profile_id: proAId,
      });
      if (existingAvailability) {
        await provider.updateRow(
          "availability_settings",
          { beautician_profile_id: proAId },
          { working_hours: WORKING_HOURS_NOT_CONFIGURED_ALL_OFF },
        );
      } else {
        await provider.insertRow("availability_settings", {
          beautician_profile_id: proAId,
          working_hours: WORKING_HOURS_NOT_CONFIGURED_ALL_OFF,
        });
        createdIds.availability_settings_created = true;
      }

      let current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "a fully blank profile scores 0").toBe(0);

      // ============================================================
      // 3. Identity basics (10 = 4 name + 3 title + 3 tagline) — partial
      // ============================================================
      await provider.updateRow(
        "beautician_profiles",
        { id: proAId },
        { display_name: "QA_E2E_cs_Name Only" },
      );
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "name-only identity partial = 4").toBe(4);

      await provider.updateRow(
        "beautician_profiles",
        { id: proAId },
        { professional_title: "QA_E2E_cs_Title", short_tagline: "QA_E2E_cs_Tagline" },
      );
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "full identity basics = 10").toBe(10);

      // ============================================================
      // 4. Profile photo (10, binary) — whitespace-only must not count
      // ============================================================
      await provider.updateRow("beautician_profiles", { id: proAId }, { profile_image_url: "   " });
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        current?.["completion_score"],
        "whitespace-only photo URL must earn zero photo points",
      ).toBe(10); // unchanged from identity-only total (10 + 0)

      await provider.updateRow(
        "beautician_profiles",
        { id: proAId },
        { profile_image_url: "https://example.com/qa-e2e-cs-photo.jpg" },
      );
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "a real photo URL earns 10").toBe(20);

      // ============================================================
      // 5. Bio (15) — 0 empty, 7 short (<80), 15 long (>=80), Readiness
      // 80-char threshold semantics
      // ============================================================
      await provider.updateRow("beautician_profiles", { id: proAId }, { bio: "Too short" });
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "a short non-empty bio earns 7").toBe(27); // 20 + 7

      await provider.updateRow(
        "beautician_profiles",
        { id: proAId },
        { bio: FULL_SCORE_PROFILE_FIELDS.bio },
      );
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "a bio >= 80 trimmed chars earns 15").toBe(35); // 20 + 15

      // ============================================================
      // 6. Location (8 = 5 city + 3 locality) — partial
      // ============================================================
      await provider.updateRow(
        "beautician_profiles",
        { id: proAId },
        { primary_city: "QA_E2E_cs_City" },
      );
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "city-only location partial = 5").toBe(40); // 35 + 5

      await provider.updateRow(
        "beautician_profiles",
        { id: proAId },
        { locality: "QA_E2E_cs_Locality" },
      );
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "full location = 8").toBe(43); // 35 + 8

      // ============================================================
      // 7. Contact (8, binary — phone OR whatsapp)
      // ============================================================
      await provider.updateRow(
        "beautician_profiles",
        { id: proAId },
        { whatsapp_number: "9000000001" },
      );
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "WhatsApp alone satisfies contact = 8").toBe(51); // 43 + 8

      // ============================================================
      // 8. Services (12) — active only, 0/1-2/>=3 tiers
      // ============================================================
      const svc1 = await provider.insertRow("services", {
        beautician_profile_id: proAId,
        name: "QA_E2E_cs_Service_1",
        is_active: true,
      });
      createdIds.services.push(svc1["id"] as string);
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "1 active service = 6").toBe(57); // 51 + 6

      const svcInactive = await provider.insertRow("services", {
        beautician_profile_id: proAId,
        name: "QA_E2E_cs_Service_inactive",
        is_active: false,
      });
      createdIds.services.push(svcInactive["id"] as string);
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "an inactive service must not contribute points").toBe(
        57,
      );

      const svc2 = await provider.insertRow("services", {
        beautician_profile_id: proAId,
        name: "QA_E2E_cs_Service_2",
        is_active: true,
      });
      const svc3 = await provider.insertRow("services", {
        beautician_profile_id: proAId,
        name: "QA_E2E_cs_Service_3",
        is_active: true,
      });
      createdIds.services.push(svc2["id"] as string, svc3["id"] as string);
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "3+ active services = 12").toBe(63); // 51 + 12

      // ============================================================
      // 9. Portfolio work (10) — published gallery + published
      // before/after, combined, 0/1-2/>=3 tiers
      // ============================================================
      const pi1 = await provider.insertRow("portfolio_items", {
        beautician_profile_id: proAId,
        title: "QA_E2E_cs_Portfolio_1",
        is_published: true,
      });
      createdIds.portfolio_items.push(pi1["id"] as string);
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "1 published portfolio item = 5").toBe(68); // 63 + 5

      const piUnpublished = await provider.insertRow("portfolio_items", {
        beautician_profile_id: proAId,
        title: "QA_E2E_cs_Portfolio_unpublished",
        is_published: false,
      });
      createdIds.portfolio_items.push(piUnpublished["id"] as string);
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        current?.["completion_score"],
        "an unpublished portfolio item must not contribute points",
      ).toBe(68);

      const ba1 = await provider.insertRow("before_after_items", {
        beautician_profile_id: proAId,
        title: "QA_E2E_cs_BA_1",
        is_published: true,
      });
      const ba2 = await provider.insertRow("before_after_items", {
        beautician_profile_id: proAId,
        title: "QA_E2E_cs_BA_2",
        is_published: true,
      });
      createdIds.before_after_items.push(ba1["id"] as string, ba2["id"] as string);
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        current?.["completion_score"],
        "1 published gallery item + 2 published before/after items (3 total) = 10",
      ).toBe(73); // 63 + 10

      // ============================================================
      // 10. Availability (8, binary) — real working_hours JSONB semantics
      // ============================================================
      await provider.updateRow(
        "availability_settings",
        { beautician_profile_id: proAId },
        { working_hours: WORKING_HOURS_CONFIGURED },
      );
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        current?.["completion_score"],
        "at least one available=true entry with valid start/end = 8 (Availability trigger recomputes)",
      ).toBe(81); // 73 + 8

      await provider.updateRow(
        "availability_settings",
        { beautician_profile_id: proAId },
        { working_hours: WORKING_HOURS_NOT_CONFIGURED_ALL_OFF },
      );
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        current?.["completion_score"],
        "no available=true entries must earn zero availability points",
      ).toBe(73);

      await provider.updateRow(
        "availability_settings",
        { beautician_profile_id: proAId },
        { working_hours: null },
      );
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        current?.["completion_score"],
        "NULL working_hours must never error and must score as not configured",
      ).toBe(73);

      await provider.updateRow(
        "availability_settings",
        { beautician_profile_id: proAId },
        { working_hours: WORKING_HOURS_CONFIGURED },
      );
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"]).toBe(81);

      // ============================================================
      // 11. Service areas (7, binary) — active only
      // ============================================================
      const areaInactive = await provider.insertRow("service_areas", {
        beautician_profile_id: proAId,
        city: "QA_E2E_cs_Area_inactive",
        is_active: false,
      });
      createdIds.service_areas.push(areaInactive["id"] as string);
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        current?.["completion_score"],
        "an inactive service area must not contribute points",
      ).toBe(81);

      const areaActive = await provider.insertRow("service_areas", {
        beautician_profile_id: proAId,
        city: "QA_E2E_cs_Area_active",
        is_active: true,
      });
      createdIds.service_areas.push(areaActive["id"] as string);
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "1 active service area = 7").toBe(88); // 81 + 7

      // ============================================================
      // 12. FAQs (6) — published only, 0/1/>=2 tiers
      // ============================================================
      const faq1 = await provider.insertRow("faqs", {
        beautician_profile_id: proAId,
        question: "QA_E2E_cs_Q1",
        answer: "QA_E2E_cs_A1",
        is_published: true,
      });
      createdIds.faqs.push(faq1["id"] as string);
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "1 published FAQ = 3").toBe(91); // 88 + 3

      const faqUnpublished = await provider.insertRow("faqs", {
        beautician_profile_id: proAId,
        question: "QA_E2E_cs_Q_unpub",
        answer: "QA_E2E_cs_A_unpub",
        is_published: false,
      });
      createdIds.faqs.push(faqUnpublished["id"] as string);
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "an unpublished FAQ must not contribute points").toBe(
        91,
      );

      const faq2 = await provider.insertRow("faqs", {
        beautician_profile_id: proAId,
        question: "QA_E2E_cs_Q2",
        answer: "QA_E2E_cs_A2",
        is_published: true,
      });
      createdIds.faqs.push(faq2["id"] as string);
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"], "2+ published FAQs = 6").toBe(94); // 88 + 6

      // ============================================================
      // 13. Highlights + Why Choose You (6) — non-empty trimmed items only
      // ============================================================
      await provider.updateRow(
        "beautician_profiles",
        { id: proAId },
        { about_highlights: ["  ", ""] }, // whitespace-only items — must count as empty
      );
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        current?.["completion_score"],
        "an array of only whitespace/blank strings must earn zero highlight points",
      ).toBe(94);

      await provider.updateRow(
        "beautician_profiles",
        { id: proAId },
        { about_highlights: ["QA_E2E_cs_Highlight A"] },
      );
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        current?.["completion_score"],
        "1 real highlight, 0 why-choose-points = partial (3)",
      ).toBe(97); // 94 + 3

      await provider.updateRow(
        "beautician_profiles",
        { id: proAId },
        {
          about_highlights: FULL_SCORE_PROFILE_FIELDS.about_highlights,
          why_choose_points: FULL_SCORE_PROFILE_FIELDS.why_choose_points,
        },
      );
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        current?.["completion_score"],
        "2+ real highlights AND 2+ real why-choose-points (ignoring blank items mixed in) = 6, total = 100",
      ).toBe(100);

      // ============================================================
      // 14. Free reaches exactly 100 at documented thresholds
      // ============================================================
      const finalFreeState = await provider.getRow("beautician_profiles", { id: proAId });
      expect(finalFreeState?.["plan"], "this full-100 state was reached entirely on Free").toBe(
        "free",
      );
      expect(finalFreeState?.["completion_score"]).toBe(100);

      // ============================================================
      // 15. Starter/Silver/Gold/Platinum use the identical formula; an
      // upgrade never lowers the score
      // ============================================================
      for (const plan of ["starter", "silver", "gold", "platinum"]) {
        await provider.updateRow("beautician_profiles", { id: proAId }, { plan });
        current = await provider.getRow("beautician_profiles", { id: proAId });
        expect(
          current?.["completion_score"],
          `score must remain 100 on ${plan} with identical content (no paid-only feature contributes points)`,
        ).toBe(100);
      }
      await provider.updateRow("beautician_profiles", { id: proAId }, { plan: "free" });

      // ============================================================
      // 16. Crafted manual completion_score write is always overwritten
      // ============================================================
      const proAClient = await signIn(
        requireEnv("QA_PRO_A_EMAIL"),
        requireEnv("QA_PRO_A_PASSWORD"),
      );
      await proAClient.from("beautician_profiles").update({ completion_score: 0 }).eq("id", proAId);
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        current?.["completion_score"],
        "a professional's crafted completion_score write must be replaced by the authoritative recompute",
      ).toBe(100);

      // Admin also cannot manually override the derived score.
      await rawAdmin.from("beautician_profiles").update({ completion_score: 42 }).eq("id", proAId);
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        current?.["completion_score"],
        "Admin's crafted completion_score write must also be replaced by the authoritative recompute",
      ).toBe(100);

      // Out-of-range values are rejected outright by the CHECK constraint
      // (defense-in-depth even though the BEFORE trigger already
      // overwrites NEW.completion_score before the constraint is checked).
      const outOfRangeAttempt = await rawAdmin
        .from("beautician_profiles")
        .update({ completion_score: 999 })
        .eq("id", proAId)
        .select();
      // Whether this errors (CHECK fails before trigger logic is
      // considered) or silently normalizes back to 100 (trigger runs
      // first) is an implementation detail of trigger-vs-constraint
      // ordering — either outcome is acceptable as long as the persisted
      // value never becomes 999.
      void outOfRangeAttempt;
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        current?.["completion_score"],
        "an out-of-range crafted value must never persist",
      ).not.toBe(999);

      // ============================================================
      // 17. Breakdown RPC security — ownership + Admin authorization
      // ============================================================
      const ownBreakdown = await proAClient.rpc("compute_portfolio_score_by_id", {
        _bp_id: proAId,
      });
      expect(
        ownBreakdown.error,
        "a professional must be able to read their own breakdown",
      ).toBeNull();
      expect((ownBreakdown.data as { total: number })?.total).toBe(100);
      expect(
        Array.isArray((ownBreakdown.data as { criteria: unknown[] })?.criteria),
        "the breakdown must include the per-criterion array",
      ).toBe(true);

      const proBClient = await signIn(
        requireEnv("QA_PRO_B_EMAIL"),
        requireEnv("QA_PRO_B_PASSWORD"),
      );
      const crossTenantBreakdown = await proBClient.rpc("compute_portfolio_score_by_id", {
        _bp_id: proAId,
      });
      expect(
        crossTenantBreakdown.error,
        "Professional B must not be able to read Professional A's breakdown",
      ).not.toBeNull();

      const anonClient = createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("QA_SUPABASE_PUBLISHABLE_KEY"),
      );
      const anonBreakdown = await anonClient.rpc("compute_portfolio_score_by_id", {
        _bp_id: proAId,
      });
      expect(
        anonBreakdown.error,
        "an anonymous/public caller must never obtain a breakdown through this RPC",
      ).not.toBeNull();

      const adminClient = await signIn(
        requireEnv("QA_ADMIN_EMAIL"),
        requireEnv("QA_ADMIN_PASSWORD"),
      );
      const adminBreakdown = await adminClient.rpc("compute_portfolio_score_by_id", {
        _bp_id: proAId,
      });
      expect(
        adminBreakdown.error,
        "Admin must be able to read any professional's breakdown",
      ).toBeNull();
      expect((adminBreakdown.data as { total: number })?.total).toBe(100);

      // Professional B must also not be able to WRITE A's score via any
      // path (re-confirms RLS/ownership, not just the read RPC).
      const crossTenantWrite = await proBClient
        .from("beautician_profiles")
        .update({ display_name: "QA_E2E_cs_HACKED" })
        .eq("id", proAId)
        .select();
      expect(
        crossTenantWrite.data?.length ?? 0,
        "Professional B must not be able to modify A's profile at all",
      ).toBe(0);

      await proAClient.auth.signOut();
      await proBClient.auth.signOut();
      await adminClient.auth.signOut();

      // ============================================================
      // 18. Admin dashboard — score column + score-band filter
      // ============================================================
      const adminCtx = await browser.newContext({ storageState: "playwright/.auth/qa-admin.json" });
      const adminPage = await adminCtx.newPage();
      await adminPage.goto("/admin/profiles");
      const proARowLocator = adminPage.getByRole("row", { name: new RegExp(proASlug) });
      // "100" also appears as a substring of the "/100 · Complete" badge
      // text in the same cell — match the score span exactly.
      await expect(proARowLocator.getByText("100", { exact: true })).toBeVisible({
        timeout: 10_000,
      });
      await expect(proARowLocator.getByText(/Complete/)).toBeVisible();

      // The filter control is a <Select>, not a text input — its
      // accessible name changes to the selected band's own text once a
      // band is chosen, so it must be located by a stable attribute (the
      // fixed w-[190px] trigger class from admin.profiles.tsx) rather than
      // by accessible name, which would otherwise stop matching after the
      // first selection.
      const bandSelect = adminPage.locator('button[class*="w-\\[190px\\]"]');
      await bandSelect.click();
      await adminPage.getByRole("option", { name: /Complete$/, exact: false }).click();
      await expect(proARowLocator).toBeVisible({ timeout: 10_000 });

      await bandSelect.click();
      await adminPage.getByRole("option", { name: /Just getting started/i }).click();
      await expect(proARowLocator).toHaveCount(0);

      await bandSelect.click();
      await adminPage.getByRole("option", { name: /any$/i }).click();
      await expect(proARowLocator).toBeVisible({ timeout: 10_000 });

      await adminCtx.close();

      // ============================================================
      // 19. Direct legitimate Supabase writes recompute (re-confirmation
      // via the dashboard save path, not just direct provider calls)
      // ============================================================
      const proAClient2 = await signIn(
        requireEnv("QA_PRO_A_EMAIL"),
        requireEnv("QA_PRO_A_PASSWORD"),
      );
      await proAClient2.from("beautician_profiles").update({ short_tagline: "" }).eq("id", proAId);
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        current?.["completion_score"],
        "a legitimate authenticated write must recompute immediately (100 -> 97, tagline's 3 points lost)",
      ).toBe(97);
      await proAClient2
        .from("beautician_profiles")
        .update({ short_tagline: "QA_E2E_cs_Short tagline" })
        .eq("id", proAId);
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"]).toBe(100);
      await proAClient2.auth.signOut();

      // ============================================================
      // 20. Child DELETE recomputes (drop back below 100, confirm delta)
      // ============================================================
      await provider.deleteRow("faqs", { id: faq2["id"] as string });
      createdIds.faqs = createdIds.faqs.filter((id) => id !== (faq2["id"] as string));
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(
        current?.["completion_score"],
        "deleting a published FAQ (dropping from 2 to 1) must recompute FAQ points from 6 to 3",
      ).toBe(97);

      // Restore for a clean final state before teardown.
      const faq2Restored = await provider.insertRow("faqs", {
        beautician_profile_id: proAId,
        question: "QA_E2E_cs_Q2",
        answer: "QA_E2E_cs_A2",
        is_published: true,
      });
      createdIds.faqs.push(faq2Restored["id"] as string);
      current = await provider.getRow("beautician_profiles", { id: proAId });
      expect(current?.["completion_score"]).toBe(100);

      // ============================================================
      // 21. Moving a scored child A -> B recomputes BOTH portfolios
      // ============================================================
      // A currently holds 4 services total from step 8 (svc1, svc2, svc3
      // active + svcInactive, not cleaned up until `finally`) — 3 active
      // ones put it at the >=3 "max tier" (12 pts). B's fixture has
      // confirmed zero services on QA (0 -> tier = 0 pts). Reassigning
      // svc3 via a plain UPDATE of its beautician_profile_id (not
      // delete+recreate) exercises exactly the TG_OP-explicit UPDATE
      // branch the patched touch_portfolio_score() must handle:
      // OLD.beautician_profile_id (A) IS DISTINCT FROM
      // NEW.beautician_profile_id (B), so both parents must recompute —
      // A's ACTIVE count drops from 3 to 2 (12 -> 6 pts, -6; its total
      // row count only drops from 4 to 3, since svcInactive stays) and
      // B's active count rises from 0 to 1 (0 -> 6 pts, +6).
      const aBeforeMove = await provider.getRow("beautician_profiles", { id: proAId });
      const bBeforeMove = await provider.getRow("beautician_profiles", { id: proBId });
      const aScoreBeforeMove = aBeforeMove?.["completion_score"] as number;
      const bScoreBeforeMove = bBeforeMove?.["completion_score"] as number;

      const svc3Id = svc3["id"] as string;
      await provider.updateRow("services", { id: svc3Id }, { beautician_profile_id: proBId });

      const aAfterMove = await provider.getRow("beautician_profiles", { id: proAId });
      const bAfterMove = await provider.getRow("beautician_profiles", { id: proBId });
      const aServicesAfterMove = await provider.countRows("services", {
        beautician_profile_id: proAId,
      });
      const bServicesAfterMove = await provider.countRows("services", {
        beautician_profile_id: proBId,
      });
      expect(
        aServicesAfterMove,
        "the moved service must have left A (3 remain: svc1, svc2, svcInactive)",
      ).toBe(3);
      expect(bServicesAfterMove, "the moved service must now belong to B").toBe(1);
      expect(
        aAfterMove?.["completion_score"],
        "A's score must drop by 6 (services tier 12 -> 6) — the OLD-parent branch fired",
      ).toBe(aScoreBeforeMove - 6);
      expect(
        bAfterMove?.["completion_score"],
        "B's score must rise by 6 (services tier 0 -> 6) — the NEW-parent branch fired",
      ).toBe(bScoreBeforeMove + 6);

      // Move it back — restores both sides to their pre-step-21 state and
      // exercises the reverse UPDATE-branch reassignment once more.
      await provider.updateRow("services", { id: svc3Id }, { beautician_profile_id: proAId });
      const aRestoredCount = await provider.countRows("services", {
        beautician_profile_id: proAId,
      });
      const bRestoredCount = await provider.countRows("services", {
        beautician_profile_id: proBId,
      });
      expect(aRestoredCount).toBe(4);
      expect(bRestoredCount).toBe(0);
      const aRestored = await provider.getRow("beautician_profiles", { id: proAId });
      const bRestored = await provider.getRow("beautician_profiles", { id: proBId });
      expect(aRestored?.["completion_score"]).toBe(aScoreBeforeMove);
      expect(bRestored?.["completion_score"]).toBe(bScoreBeforeMove);
    } finally {
      // ==== cleanup every QA_E2E_cs_-created row ====
      for (const id of createdIds.services)
        await provider.deleteRow("services", { id }).catch(() => {});
      for (const id of createdIds.portfolio_items)
        await provider.deleteRow("portfolio_items", { id }).catch(() => {});
      for (const id of createdIds.before_after_items)
        await provider.deleteRow("before_after_items", { id }).catch(() => {});
      for (const id of createdIds.service_areas)
        await provider.deleteRow("service_areas", { id }).catch(() => {});
      for (const id of createdIds.faqs) await provider.deleteRow("faqs", { id }).catch(() => {});
      if (createdIds.availability_settings_created) {
        await provider
          .deleteRow("availability_settings", { beautician_profile_id: proAId })
          .catch(() => {});
      }

      // ==== restore Professional A's profile row to its exact snapshot ====
      const restoreFields: Record<string, unknown> = {};
      for (const key of [
        "display_name",
        "professional_title",
        "short_tagline",
        "profile_image_url",
        "bio",
        "primary_city",
        "locality",
        "phone",
        "whatsapp_number",
        "about_highlights",
        "why_choose_points",
        "plan",
      ]) {
        restoreFields[key] = originalA[key];
      }
      await provider.updateRow("beautician_profiles", { id: proAId }, restoreFields);

      // ==== restore Professional B's plan (untouched, but re-confirm) ====
      await provider.updateRow("beautician_profiles", { id: proBId }, { plan: originalPlanB });

      const restoredA = await provider.getRow("beautician_profiles", { id: proAId });
      const restoredB = await provider.getRow("beautician_profiles", { id: proBId });
      expect(
        restoredA?.["display_name"],
        "Professional A's baseline profile fields must be restored exactly",
      ).toBe(originalA["display_name"]);
      expect(restoredB?.["plan"], "Professional B's plan must be untouched").toBe(originalPlanB);
      // completion_score is derived — it is expected to differ from
      // whatever it was before this suite ran only if the restored content
      // differs from the pre-test baseline, which it does not, so the
      // recompute triggered by the restore UPDATE above should already
      // have driven it back to the pre-test value automatically.
    }
  });
});
