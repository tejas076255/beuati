import { describe, expect, it } from "vitest";
import {
  assertDestructiveQaAllowed,
  evaluateDestructiveQaRequest,
  type DestructiveQaRequest,
} from "../helpers/safety-gate";
import { beautyfolioProject } from "../projects/beautyfolio/project";

// A fully valid, self-consistent SYNTHETIC configuration — a fake backend
// ref that is never the real BeautyFolio project, used only to prove the
// gate opens when every condition genuinely holds.
const validSyntheticRequest: DestructiveQaRequest = {
  allowWrites: true,
  configuredEnvironment: "qa",
  baseUrl: "https://qa-synthetic.example.test",
  backendRef: "synthetic-qa-backend-ref",
  expectedQaBackendRef: "synthetic-qa-backend-ref",
  protectedBackendRefs: beautyfolioProject.protectedBackendRefs,
  recordPrefix: "QA_E2E_",
  profileSlugPrefix: "qa-test-",
};

describe("evaluateDestructiveQaRequest — fail-closed defaults", () => {
  it("denies when writes are disabled by default (no allowWrites field set explicitly false)", () => {
    const result = evaluateDestructiveQaRequest({ ...validSyntheticRequest, allowWrites: false });
    expect(result.allowed).toBe(false);
    expect(result.reasons.join(" ")).toContain("QA_ALLOW_WRITES is not enabled");
  });

  it("denies when QA_ALLOW_WRITES=false explicitly", () => {
    const result = evaluateDestructiveQaRequest({ ...validSyntheticRequest, allowWrites: false });
    expect(result.allowed).toBe(false);
  });

  it("denies when writes are enabled but the environment is production", () => {
    const result = evaluateDestructiveQaRequest({
      ...validSyntheticRequest,
      configuredEnvironment: "production",
    });
    expect(result.allowed).toBe(false);
    expect(result.environmentKind).toBe("production");
  });

  it("denies when writes are enabled but the environment is development", () => {
    const result = evaluateDestructiveQaRequest({
      ...validSyntheticRequest,
      configuredEnvironment: "development",
    });
    expect(result.allowed).toBe(false);
    expect(result.environmentKind).toBe("development");
  });

  it("denies when environment claims test but the backend ref doesn't match the expected ref", () => {
    const result = evaluateDestructiveQaRequest({
      ...validSyntheticRequest,
      configuredEnvironment: "test",
      backendRef: "some-other-backend",
    });
    expect(result.allowed).toBe(false);
  });

  it("denies when environment claims test but the expected QA project ref is missing", () => {
    const result = evaluateDestructiveQaRequest({
      ...validSyntheticRequest,
      configuredEnvironment: "test",
      expectedQaBackendRef: null,
    });
    expect(result.allowed).toBe(false);
  });

  it("denies when environment claims test but the QA record/profile prefixes are missing", () => {
    const result = evaluateDestructiveQaRequest({
      ...validSyntheticRequest,
      configuredEnvironment: "test",
      recordPrefix: null,
      profileSlugPrefix: null,
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons.join(" ")).toContain("QA_RECORD_PREFIX");
    expect(result.reasons.join(" ")).toContain("QA_PROFILE_SLUG_PREFIX");
  });
});

describe("evaluateDestructiveQaRequest — protects the real BeautyFolio backend", () => {
  it("DENIES destructive QA against the current BeautyFolio backend (ivbujlyilzmlublqzalu) even with writes enabled and a qa environment claim", () => {
    const result = evaluateDestructiveQaRequest({
      ...validSyntheticRequest,
      backendRef: "ivbujlyilzmlublqzalu",
      expectedQaBackendRef: "ivbujlyilzmlublqzalu",
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons.join(" ")).toContain("protected backend denylist");
  });
});

describe("evaluateDestructiveQaRequest — allows only a fully valid synthetic QA configuration", () => {
  it("ALLOWS when every independent condition genuinely holds against a synthetic backend", () => {
    const result = evaluateDestructiveQaRequest(validSyntheticRequest);
    expect(result.allowed).toBe(true);
    expect(result.environmentKind).toBe("qa");
  });
});

describe("assertDestructiveQaAllowed — throwing form", () => {
  it("throws rather than silently continuing when denied", () => {
    expect(() =>
      assertDestructiveQaAllowed({ ...validSyntheticRequest, allowWrites: false }),
    ).toThrow(/Destructive QA operation blocked/);
  });

  it("returns the decision instead of throwing when allowed", () => {
    const decision = assertDestructiveQaAllowed(validSyntheticRequest);
    expect(decision.allowed).toBe(true);
  });
});
