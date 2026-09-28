import { describe, expect, it } from "vitest";
import { getGtmId, isAnalyticsConfigured } from "@/lib/analytics";

describe("Google Tag Manager configuration", () => {
  it("has analytics configured with the target GTM ID", () => {
    expect(isAnalyticsConfigured()).toBe(true);
    expect(getGtmId()).toBe("GTM-W73HLNH4");
  });
});
