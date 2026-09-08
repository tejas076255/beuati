import { describe, expect, it } from "vitest";
import { extractStoragePathFromPublicUrl } from "@/lib/storage-path";

describe("extractStoragePathFromPublicUrl", () => {
  it("extracts the raw object path from a valid BeautyFolio storage public URL", () => {
    const url =
      "https://ivbujlyilzmlublqzalu.supabase.co/storage/v1/object/public/portfolio-media/profiles/dharti-panchal/gallery/photo.jpg";

    expect(extractStoragePathFromPublicUrl(url)).toBe("profiles/dharti-panchal/gallery/photo.jpg");
  });

  it("decodes URL-encoded characters in the extracted path", () => {
    const url =
      "https://ivbujlyilzmlublqzalu.supabase.co/storage/v1/object/public/portfolio-media/profiles/dharti-panchal/gallery/photo%20one.jpg";

    expect(extractStoragePathFromPublicUrl(url)).toBe(
      "profiles/dharti-panchal/gallery/photo one.jpg",
    );
  });

  it("returns null for an external/random URL", () => {
    expect(extractStoragePathFromPublicUrl("https://evil.example.com/some/path")).toBeNull();
  });

  it("returns null for a malformed URL", () => {
    expect(extractStoragePathFromPublicUrl("not a url at all")).toBeNull();
  });

  it("does not treat a cross-bucket URL as an owned storage path", () => {
    const url =
      "https://ivbujlyilzmlublqzalu.supabase.co/storage/v1/object/public/some-other-bucket/profiles/dharti-panchal/gallery/photo.jpg";

    expect(extractStoragePathFromPublicUrl(url)).toBeNull();
  });

  it("returns null when the object path doesn't start with profiles/", () => {
    const url =
      "https://ivbujlyilzmlublqzalu.supabase.co/storage/v1/object/public/portfolio-media/other/photo.jpg";

    expect(extractStoragePathFromPublicUrl(url)).toBeNull();
  });

  it("respects a custom bucket argument", () => {
    const url =
      "https://ivbujlyilzmlublqzalu.supabase.co/storage/v1/object/public/custom-bucket/profiles/dharti-panchal/gallery/photo.jpg";

    expect(extractStoragePathFromPublicUrl(url, "custom-bucket")).toBe(
      "profiles/dharti-panchal/gallery/photo.jpg",
    );
  });
});
