import { describe, expect, it } from "vitest";
import { classifyEnvironment } from "../helpers/environment";

describe("classifyEnvironment", () => {
  it("classifies an explicit production claim as production", () => {
    expect(classifyEnvironment({ configuredEnvironment: "production" }).kind).toBe("production");
  });

  it("classifies an explicit staging claim as staging", () => {
    expect(classifyEnvironment({ configuredEnvironment: "staging" }).kind).toBe("staging");
  });

  it("classifies an explicit development claim as development", () => {
    expect(classifyEnvironment({ configuredEnvironment: "development" }).kind).toBe("development");
  });

  it("classifies an explicit local claim as local", () => {
    expect(classifyEnvironment({ configuredEnvironment: "local" }).kind).toBe("local");
  });

  it("classifies a localhost base URL as local even without a configured environment", () => {
    const result = classifyEnvironment({ baseUrl: "http://localhost:8080" });
    expect(result.kind).toBe("local");
  });

  it("classifies a 127.0.0.1 base URL as local", () => {
    expect(classifyEnvironment({ baseUrl: "http://127.0.0.1:8080" }).kind).toBe("local");
  });

  it("does NOT trust a bare 'qa' claim with no corroborating backend ref", () => {
    const result = classifyEnvironment({ configuredEnvironment: "qa" });
    expect(result.kind).toBe("unknown");
  });

  it("does NOT trust a bare 'test' claim when the backend ref doesn't match the expected ref", () => {
    const result = classifyEnvironment({
      configuredEnvironment: "test",
      backendRef: "some-backend",
      expectedQaBackendRef: "a-different-backend",
    });
    expect(result.kind).toBe("unknown");
  });

  it("classifies as qa only when the configured claim IS corroborated by a matching backend ref", () => {
    const result = classifyEnvironment({
      configuredEnvironment: "qa",
      backendRef: "synthetic-qa-backend",
      expectedQaBackendRef: "synthetic-qa-backend",
    });
    expect(result.kind).toBe("qa");
  });

  it("classifies an unrecognized host/environment combination as unknown", () => {
    expect(classifyEnvironment({ baseUrl: "https://beautyfolio.in" }).kind).toBe("unknown");
  });
});
