// Opt-in LIVE test — requires real SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// credentials (see .env.test.example). Tagged @live @provider @readonly:
// never runs as part of test:unit/test:security/test:e2e/test:qa, only via
// the dedicated `npm run test:provider` script, and skips gracefully rather
// than failing when credentials aren't configured — the rest of the QA
// suite must stay runnable with zero service-role secrets.
//
// QA-1D Step 2C correction: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY now point
// at the dedicated, isolated QA backend (tidymcyhgxzqhpbmcmyr), not the real
// BeautyFolio production backend. This test previously expected the real
// "dharti-panchal" profile to exist — that assumption is now wrong by
// design: QA started from a schema-only bootstrap with zero business rows,
// and it must stay that way until deliberate QA fixtures are created later.
// This test now asserts the opposite: the bootstrapped table is queryable,
// AND no production profile identity is present. No profile is created to
// make this pass.
import { describe, expect, it } from "vitest";
import { createSupabaseProviderFromEnv } from "../helpers/providers/supabase-provider";
import { beautyfolioProject } from "../projects/beautyfolio/project";

const provider = createSupabaseProviderFromEnv();

describe("QA schema trusted read @live @provider @readonly", () => {
  it.skipIf(!provider)(
    "beautician_profiles is queryable on the isolated QA backend and carries zero production profiles",
    async () => {
      // Query succeeding at all (vs. throwing "table not found in schema
      // cache", the pre-bootstrap failure from QA-1D Step 1) proves the
      // table is queryable — this is the reachability assertion.
      const dharti = await provider!.getRow(beautyfolioProject.sampleProfile.table, {
        slug: beautyfolioProject.sampleProfile.slug,
      });
      // The real production profile must never exist on the QA backend.
      expect(dharti).toBeNull();

      const janvi = await provider!.getRow(beautyfolioProject.sampleProfile.table, {
        slug: "janvi-panchal",
      });
      expect(janvi).toBeNull();
    },
  );

  if (!provider) {
    it.skip("SKIPPED — SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured; this live trusted-read check is opt-in and was not invented or requested", () => {});
  }
});
