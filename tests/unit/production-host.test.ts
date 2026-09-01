import { describe, expect, it } from "vitest";
import { isProductionHost, requestHostname } from "@/lib/production-host";

describe("isProductionHost", () => {
  it("identifies beautyfolio.in as production", () => {
    expect(isProductionHost("beautyfolio.in")).toBe(true);
  });

  it("identifies www.beautyfolio.in as production", () => {
    expect(isProductionHost("www.beautyfolio.in")).toBe(true);
  });

  it("treats the Lovable staging host as non-production", () => {
    expect(isProductionHost("beautyfolio-grow-digital.lovable.app")).toBe(false);
  });

  it("treats localhost as non-production", () => {
    expect(isProductionHost("localhost")).toBe(false);
  });

  it("treats 127.0.0.1 as non-production", () => {
    expect(isProductionHost("127.0.0.1")).toBe(false);
  });

  it("treats an unknown host as non-production", () => {
    expect(isProductionHost("beautyfolio.evil.com")).toBe(false);
  });

  it("normalizes case and strips a trailing port before comparing", () => {
    expect(isProductionHost("BeautyFolio.in:8080")).toBe(true);
  });
});

describe("requestHostname", () => {
  it("prefers the request's Host header over the URL hostname", () => {
    const request = new Request("http://localhost:8080/", {
      headers: { host: "beautyfolio.in" },
    });
    expect(requestHostname(request)).toBe("beautyfolio.in");
  });

  it("falls back to the request URL's hostname when no Host header is present", () => {
    const request = new Request("http://example.com/", { headers: {} });
    expect(requestHostname(request)).toBe("example.com");
  });
});
