// Opt-in LIVE test, same credential-gated pattern as the other files in
// this directory — see beautyfolio-trusted-read.test.ts. Verifies the
// QA-1D Step 2A bootstrap actually landed on the isolated QA backend:
// every expected application table is queryable, business-content tables
// stay empty, and the portfolio-media bucket exists with the expected
// public configuration. Never writes anything; never uploads/deletes
// storage objects.
//
// QA-1D Step 3B note: uses rowExists() (LIMIT-style, never errors on
// multiple matches), not getRow() (errors on >1 row via maybeSingle) —
// tables like profiles/user_roles/beautician_profiles now legitimately
// hold the persistent QA fixture rows created by
// qa-identity-provisioner.ts, so a plain unfiltered single-row fetch is
// no longer a safe reachability probe for every table.
import { describe, expect, it } from "vitest";
import { createSupabaseProviderFromEnv } from "../helpers/providers/supabase-provider";
import { beautyfolioProject } from "../projects/beautyfolio/project";

const provider = createSupabaseProviderFromEnv();

// The full 26-table inventory from the QA-1D Step 2A bootstrap audit.
const EXPECTED_TABLES = [
  "profiles",
  "user_roles",
  "beautician_profiles",
  "specializations",
  "service_categories",
  "beautician_specializations",
  "services",
  "packages",
  "package_services",
  "portfolio_items",
  "portfolio_images",
  "before_after_items",
  "before_after_images",
  "portfolio_videos",
  "reviews",
  "service_areas",
  "faqs",
  "availability_settings",
  "portfolio_seo",
  "leads",
  "portfolio_events",
  "audit_logs",
  "availability_blocked_dates",
  "lead_inquiries",
  "lead_inquiry_services",
  "lead_activities",
] as const;

// Business-content tables that must stay empty regardless of QA identity
// provisioning — none of these are created by ensureAuthUser()/
// handle_new_user()/the beautician_profiles bootstrap. beautician_profiles
// itself is intentionally NOT in this list any more: the QA fixture
// professionals legitimately have rows there (checked separately below).
const ZERO_ROW_SENTINEL_TABLES = ["services", "packages", "faqs", "reviews", "leads"] as const;

describe("QA schema reachability @live @provider @readonly", () => {
  it.skipIf(!provider)(
    "all 26 expected application tables are queryable",
    { timeout: 30_000 }, // 26 sequential network round-trips
    async () => {
      const results: { table: string; ok: boolean; error?: string }[] = [];
      for (const table of EXPECTED_TABLES) {
        try {
          await provider!.rowExists(table, {});
          results.push({ table, ok: true });
        } catch (err) {
          results.push({
            table,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        console.log("UNREACHABLE TABLES:", JSON.stringify(failed, null, 2));
      }
      expect(failed).toEqual([]);
    },
  );

  it.skipIf(!provider)("business-content tables are queryable and carry zero rows", async () => {
    for (const table of ZERO_ROW_SENTINEL_TABLES) {
      const exists = await provider!.rowExists(table, {});
      expect(exists, `expected ${table} to be empty`).toBe(false);
    }
  });

  it.skipIf(!provider)(
    "beautician_profiles contains only the QA-prefixed fixture professionals",
    async () => {
      const proA = await provider!.rowExists("beautician_profiles", {
        slug: beautyfolioProject.qaIdentities.professionalA.slug,
      });
      const proB = await provider!.rowExists("beautician_profiles", {
        slug: beautyfolioProject.qaIdentities.professionalB.slug,
      });
      const dharti = await provider!.rowExists("beautician_profiles", { slug: "dharti-panchal" });
      const janvi = await provider!.rowExists("beautician_profiles", { slug: "janvi-panchal" });

      expect(proA, "qa-test-professional-a should exist").toBe(true);
      expect(proB, "qa-test-professional-b should exist").toBe(true);
      expect(dharti, "the real dharti-panchal profile must never exist on QA").toBe(false);
      expect(janvi, "janvi-panchal must never exist on QA").toBe(false);
    },
  );

  it.skipIf(!provider)(
    "portfolio-media bucket exists, is public, and holds zero objects",
    async () => {
      const bucket = await provider!.getBucketInfo("portfolio-media");
      expect(bucket).not.toBeNull();
      expect(bucket?.public).toBe(true);

      const rootObjects = await provider!.listStorageObjects("portfolio-media");
      console.log("portfolio-media root entries:", JSON.stringify(rootObjects));
      expect(rootObjects).toEqual([]);
    },
  );

  if (!provider) {
    it.skip("SKIPPED — SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured; QA schema reachability check is opt-in", () => {});
  }
});
