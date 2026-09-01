// Generic, reusable environment classifier — not BeautyFolio-specific.
// Deliberately does NOT trust a bare configured-environment string alone: a
// "qa"/"test" claim must be corroborated by a matching backend identity
// before it is trusted, so a misconfigured or spoofed QA_ENVIRONMENT value
// can never, by itself, unlock destructive behavior (see safety-gate.ts).
export type EnvironmentKind = "local" | "development" | "qa" | "staging" | "production" | "unknown";

export interface EnvironmentEvidence {
  configuredEnvironment?: string | null;
  baseUrl?: string | null;
  backendRef?: string | null;
  expectedQaBackendRef?: string | null;
}

export interface EnvironmentClassification {
  kind: EnvironmentKind;
  reasons: string[];
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function hostnameOf(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) return null;
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function classifyEnvironment(evidence: EnvironmentEvidence): EnvironmentClassification {
  const configured = evidence.configuredEnvironment?.trim().toLowerCase() || null;
  const hostname = hostnameOf(evidence.baseUrl);
  const isLocalHost = hostname !== null && LOCAL_HOSTS.has(hostname);

  if (configured === "production" || configured === "prod") {
    return { kind: "production", reasons: ["configured environment explicitly production"] };
  }

  if (configured === "staging") {
    return { kind: "staging", reasons: ["configured environment explicitly staging"] };
  }

  if (configured === "qa" || configured === "test") {
    const backendCorroborates =
      !!evidence.backendRef &&
      !!evidence.expectedQaBackendRef &&
      evidence.backendRef === evidence.expectedQaBackendRef;

    if (backendCorroborates) {
      return {
        kind: "qa",
        reasons: ["configured environment qa/test, corroborated by matching expected backend ref"],
      };
    }

    return {
      kind: "unknown",
      reasons: [
        'configured environment claims "qa"/"test" but the configured backend ref does not match the expected QA backend ref (or either is missing) — a bare string claim is never trusted alone',
      ],
    };
  }

  if (configured === "development" || configured === "dev") {
    return { kind: "development", reasons: ["configured environment explicitly development"] };
  }

  if (configured === "local" || isLocalHost) {
    return {
      kind: "local",
      reasons: [
        configured === "local"
          ? "configured environment explicitly local"
          : "base URL hostname is a local loopback address",
      ],
    };
  }

  return { kind: "unknown", reasons: ["no corroborated evidence classified this environment"] };
}
