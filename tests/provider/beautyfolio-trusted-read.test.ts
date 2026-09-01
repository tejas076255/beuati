// Opt-in LIVE test — requires real SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// credentials (see .env.test.example). Tagged @live @provider @readonly:
// never runs as part of test:unit/test:security/test:e2e/test:qa, only via
// the dedicated `npm run test:provider` script, and skips gracefully rather
// than failing when credentials aren't configured — the rest of the QA
// suite must stay runnable with zero service-role secrets.
import { describe, expect, it } from "vitest";
import { createSupabaseProviderFromEnv } from "../helpers/providers/supabase-provider";
import { beautyfolioProject } from "../projects/beautyfolio/project";

const provider = createSupabaseProviderFromEnv();

describe("beautyfolio trusted read @live @provider @readonly", () => {
  it.skipIf(!provider)(
    "confirms the known sample portfolio exists and is published (read-only)",
    async () => {
      const row = await provider!.getRow(beautyfolioProject.sampleProfile.table, {
        slug: beautyfolioProject.sampleProfile.slug,
      });

      expect(row).not.toBeNull();
      expect(row?.[beautyfolioProject.sampleProfile.publishedColumn]).toBe(true);
    },
  );

  if (!provider) {
    it.skip("SKIPPED — SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured; this live trusted-read check is opt-in and was not invented or requested", () => {});
  }
});
