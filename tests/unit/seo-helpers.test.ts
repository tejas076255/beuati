import { describe, expect, it } from "vitest";
import {
  buildDefaultSeoTitle,
  buildOpeningHoursSpecification,
  resolvePrimaryService,
  serviceSearchLabel,
} from "@/lib/seo-helpers";

describe("buildOpeningHoursSpecification", () => {
  it("maps a valid available working-hours entry to schema.org OpeningHoursSpecification", () => {
    const result = buildOpeningHoursSpecification([
      { day: "monday", available: true, start: "09:00", end: "17:00" },
    ]);

    expect(result).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "https://schema.org/Monday",
        opens: "09:00",
        closes: "17:00",
      },
    ]);
  });

  it("skips days marked unavailable", () => {
    const result = buildOpeningHoursSpecification([
      { day: "sunday", available: false, start: "09:00", end: "17:00" },
    ]);

    expect(result).toEqual([]);
  });

  it("returns an empty array rather than fabricating data when the shape is invalid", () => {
    expect(buildOpeningHoursSpecification(null)).toEqual([]);
    expect(buildOpeningHoursSpecification("not an array")).toEqual([]);
    expect(buildOpeningHoursSpecification([{ day: "monday", available: true }])).toEqual([]);
  });
});

describe("resolvePrimaryService", () => {
  it("prefers the featured active service", () => {
    const result = resolvePrimaryService([
      { name: "Basic Facial", is_active: true, is_featured: false, sort_order: 0 },
      { name: "Bridal Makeup", is_active: true, is_featured: true, sort_order: 1 },
    ]);
    expect(result).toBe("Bridal Makeup");
  });

  it("falls back to the first active service by sort order when none is featured", () => {
    const result = resolvePrimaryService([
      { name: "Second", is_active: true, is_featured: false, sort_order: 2 },
      { name: "First", is_active: true, is_featured: false, sort_order: 1 },
    ]);
    expect(result).toBe("First");
  });

  it("returns null when there are no active services", () => {
    expect(
      resolvePrimaryService([
        { name: "Inactive", is_active: false, is_featured: true, sort_order: 0 },
      ]),
    ).toBeNull();
  });
});

describe("buildDefaultSeoTitle", () => {
  it("builds '{Title} in {City} | {Name}' when role and city are present", () => {
    const title = buildDefaultSeoTitle(
      {
        name: "Dharti R Panchal",
        role: "Bridal Makeup Artist",
        primaryCity: "Ahmedabad",
        specializations: [],
      },
      null,
    );
    expect(title).toBe("Bridal Makeup Artist in Ahmedabad | Dharti R Panchal");
  });

  it("falls back to the primary service when role is unset", () => {
    const title = buildDefaultSeoTitle(
      { name: "Dharti R Panchal", role: "", primaryCity: "Ahmedabad", specializations: [] },
      "Bridal Makeup",
    );
    expect(title).toBe("Bridal Makeup in Ahmedabad | Dharti R Panchal");
  });

  it("falls back to a generic title when nothing else is set", () => {
    const title = buildDefaultSeoTitle(
      { name: "Dharti R Panchal", role: "", primaryCity: "", specializations: [] },
      null,
    );
    expect(title).toBe("Dharti R Panchal | BeautyFolio");
  });
});

describe("serviceSearchLabel", () => {
  it("appends 'Artist' to a makeup service name that doesn't already end with a role word", () => {
    expect(serviceSearchLabel("Bridal Makeup")).toBe("Bridal Makeup Artist");
  });

  it("leaves a non-makeup service name unchanged", () => {
    expect(serviceSearchLabel("Hair Styling")).toBe("Hair Styling");
  });

  it("doesn't double-append Artist when the name already ends with it", () => {
    expect(serviceSearchLabel("Makeup Artist")).toBe("Makeup Artist");
  });
});
