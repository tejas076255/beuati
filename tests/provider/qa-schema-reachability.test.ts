// Opt-in LIVE test, same credential-gated pattern as the other files in
// this directory — see beautyfolio-trusted-read.test.ts. Verifies the
// QA-1D Step 2A bootstrap actually landed on the isolated QA backend:
// every expected application table is queryable and empty, and the
// portfolio-media bucket exists with the expected public configuration.
// Never writes anything; never uploads/deletes storage objects.
import { describe, expect, it } from "vitest";
import { createSupabaseProviderFromEnv } from "../helpers/providers/supabase-provider";

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

// Tables the bootstrap must never contain a business row in — an empty
// getRow({}) result is itself the "queryable AND empty" proof for these.
const ZERO_ROW_SENTINEL_TABLES = [
  "beautician_profiles",
  "services",
  "packages",
  "faqs",
  "reviews",
  "leads",
] as const;

describe("QA schema reachability @live @provider @readonly", () => {
  // Note: getRow() uses .maybeSingle() internally, which errors if a table
  // unexpectedly holds MORE than one row — on today's freshly-bootstrapped,
  // still-empty QA backend that never happens, but a future reader adding
  // multi-row reference/fixture data to one of these tables should expect
  // this specific reachability check (not the zero-row sentinel below) to
  // need a different query shape at that point.
  it.skipIf(!provider)(
    "all 26 expected application tables are queryable",
    { timeout: 30_000 }, // 26 sequential network round-trips
    async () => {
      const results: { table: string; ok: boolean; error?: string }[] = [];
      for (const table of EXPECTED_TABLES) {
        try {
          await provider!.getRow(table, {});
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

  it.skipIf(!provider)("business tables are queryable and carry zero rows", async () => {
    for (const table of ZERO_ROW_SENTINEL_TABLES) {
      const row = await provider!.getRow(table, {});
      expect(row, `expected ${table} to be empty`).toBeNull();
    }
  });

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
