import { describe, expect, it } from "vitest";
import {
  validateRequiredEnv,
  validateSupabaseProviderEnv,
} from "../helpers/providers/env-validation";
import {
  assertDestructiveQaAllowed,
  evaluateDestructiveQaRequest,
  type DestructiveQaRequest,
} from "../helpers/safety-gate";

const FAKE_SECRET = "sb_secret_totally-fake-value-should-never-leak-123";

describe("validateSupabaseProviderEnv — never echoes credential values", () => {
  it("reports missing variable NAMES only when unset", () => {
    const result = validateRequiredEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], {});
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  });

  it("never includes the actual credential value anywhere in its result, even when present", () => {
    const env = {
      SUPABASE_URL: "https://fake.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: FAKE_SECRET,
    };
    const result = validateSupabaseProviderEnv(env);
    expect(result.valid).toBe(true);
    expect(JSON.stringify(result)).not.toContain(FAKE_SECRET);
  });
});

describe("safety-gate — cannot leak secret material because it never accepts any", () => {
  const requestWithoutSecrets: DestructiveQaRequest = {
    allowWrites: false,
    configuredEnvironment: "test",
    baseUrl: "https://qa-synthetic.example.test",
    backendRef: "synthetic-qa-backend-ref",
    expectedQaBackendRef: "synthetic-qa-backend-ref",
    protectedBackendRefs: ["ivbujlyilzmlublqzalu"],
    recordPrefix: "QA_E2E_",
    profileSlugPrefix: "qa-test-",
  };

  it("the request shape carries no key/token/secret/password fields", () => {
    const keys = Object.keys(requestWithoutSecrets);
    for (const key of keys) {
      expect(key.toLowerCase()).not.toMatch(/key|token|secret|password/);
    }
  });

  it("a denial's thrown message never contains a fake secret value even if the caller's environment happens to hold one", () => {
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = FAKE_SECRET;
    try {
      let thrown: unknown;
      try {
        assertDestructiveQaAllowed(requestWithoutSecrets);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).not.toContain(FAKE_SECRET);
    } finally {
      delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    }
  });

  it("a denial's reasons array never contains a fake secret value", () => {
    const result = evaluateDestructiveQaRequest(requestWithoutSecrets);
    expect(result.reasons.join(" ")).not.toContain(FAKE_SECRET);
  });
});
