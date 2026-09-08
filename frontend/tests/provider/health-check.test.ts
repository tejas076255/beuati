// Opt-in LIVE test, same credential-gated pattern as
// beautyfolio-trusted-read.test.ts. Generic — exercises the provider
// contract's healthCheck()/identity(), not any BeautyFolio schema.
import { describe, expect, it } from "vitest";
import { createSupabaseProviderFromEnv } from "../helpers/providers/supabase-provider";

const provider = createSupabaseProviderFromEnv();

describe("supabase provider health check @live @provider @readonly", () => {
  it.skipIf(!provider)(
    "reports a connected, read-only health status with no secret material",
    async () => {
      const health = await provider!.healthCheck();

      expect(health.identity.providerType).toBe("supabase");
      expect(
        typeof health.identity.backendRef === "string" || health.identity.backendRef === null,
      ).toBe(true);
      expect(health.connected).toBe(true);
    },
  );

  if (!provider) {
    it.skip("SKIPPED — SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured; provider health check is opt-in", () => {});
  }
});
