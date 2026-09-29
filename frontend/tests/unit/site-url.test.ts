import { describe, expect, it } from "vitest";
import { absoluteUrl, getSiteUrl, hasSiteUrl, CANONICAL_PRODUCTION_URL } from "@/lib/site-url";

describe("site-url canonical resolution", () => {
  it("exports CANONICAL_PRODUCTION_URL as https://beautyfolio.in", () => {
    expect(CANONICAL_PRODUCTION_URL).toBe("https://beautyfolio.in");
  });

  it("never resolves to localhost in production or normal usage", () => {
    const siteUrl = getSiteUrl();
    expect(siteUrl).not.toContain("localhost");
    expect(siteUrl).not.toContain("127.0.0.1");
    expect(siteUrl).toBe("https://beautyfolio.in");
  });

  it("hasSiteUrl returns true", () => {
    expect(hasSiteUrl()).toBe(true);
  });

  it("resolves root path to https://beautyfolio.in/", () => {
    expect(absoluteUrl("/")).toBe("https://beautyfolio.in/");
  });

  it("resolves portfolio slug path to https://beautyfolio.in/portfolio/dharti-panchal", () => {
    expect(absoluteUrl("/portfolio/dharti-panchal")).toBe(
      "https://beautyfolio.in/portfolio/dharti-panchal",
    );
  });

  it("resolves service landing path correctly", () => {
    expect(absoluteUrl("/portfolio/dharti-panchal/services/bridal-makeup")).toBe(
      "https://beautyfolio.in/portfolio/dharti-panchal/services/bridal-makeup",
    );
  });

  it("leaves already-absolute URLs untouched", () => {
    expect(absoluteUrl("https://example.com/test")).toBe("https://example.com/test");
  });
});
