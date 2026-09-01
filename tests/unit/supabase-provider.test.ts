import { describe, expect, it } from "vitest";
import {
  createSupabaseProviderFromEnv,
  projectRefFromSupabaseUrl,
} from "../helpers/providers/supabase-provider";

describe("projectRefFromSupabaseUrl", () => {
  it("extracts the project ref from a standard Supabase project URL", () => {
    expect(projectRefFromSupabaseUrl("https://ivbujlyilzmlublqzalu.supabase.co")).toBe(
      "ivbujlyilzmlublqzalu",
    );
  });

  it("returns null for a malformed URL", () => {
    expect(projectRefFromSupabaseUrl("not a url")).toBeNull();
  });
});

describe("createSupabaseProviderFromEnv", () => {
  it("returns null (never throws) when credentials are absent", () => {
    expect(createSupabaseProviderFromEnv({})).toBeNull();
  });

  it("returns null when only one of the two required variables is present", () => {
    expect(createSupabaseProviderFromEnv({ SUPABASE_URL: "https://fake.supabase.co" })).toBeNull();
  });

  it("constructs a provider instance when both variables are present", () => {
    const provider = createSupabaseProviderFromEnv({
      SUPABASE_URL: "https://fake.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "fake-key-for-construction-test-only",
    });
    expect(provider).not.toBeNull();
    expect(provider?.identity()).toEqual({ providerType: "supabase", backendRef: "fake" });
  });
});
