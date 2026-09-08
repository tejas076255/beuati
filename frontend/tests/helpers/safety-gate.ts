// Generic, reusable destructive-test safety gate — not BeautyFolio-specific.
// Every future automated create/update/delete operation the QA tool ever
// runs, for any project, must pass through assertDestructiveQaAllowed()
// first. Fail-closed by design: every condition is independent and all must
// hold, missing/ambiguous evidence denies rather than assumes intent, and
// nothing here ever touches or logs secret material (only booleans, backend
// refs, and non-secret prefix strings flow through this module).
import { classifyEnvironment, type EnvironmentKind } from "./environment.ts";

export interface DestructiveQaRequest {
  /** QA_ALLOW_WRITES — the operator's explicit opt-in. */
  allowWrites: boolean;
  /** QA_ENVIRONMENT as configured — never trusted alone, see classifyEnvironment. */
  configuredEnvironment: string | null;
  /** QA_BASE_URL — corroborating evidence for local/qa classification. */
  baseUrl: string | null;
  /** The ACTUAL configured backend's identity (e.g. Supabase project ref). */
  backendRef: string | null;
  /** QA_EXPECTED_PROJECT_REF — the only backend identity writes may target. */
  expectedQaBackendRef: string | null;
  /** Project-supplied denylist of backends that must never receive destructive QA. */
  protectedBackendRefs: readonly string[];
  /** QA_RECORD_PREFIX — required so any future cleanup can never touch non-QA rows. */
  recordPrefix: string | null;
  /** QA_PROFILE_SLUG_PREFIX — same guarantee for profile/tenant-shaped records. */
  profileSlugPrefix: string | null;
}

export interface DestructiveQaDecision {
  allowed: boolean;
  environmentKind: EnvironmentKind;
  reasons: string[];
}

/**
 * Pure decision function — never throws, always returns a full explanation.
 * `reasons` lists every failing condition (or a single explanatory reason
 * once `allowed` is true), and never includes secret values because no
 * secret value is ever passed into this function's request shape.
 */
export function evaluateDestructiveQaRequest(request: DestructiveQaRequest): DestructiveQaDecision {
  const classification = classifyEnvironment({
    configuredEnvironment: request.configuredEnvironment,
    baseUrl: request.baseUrl,
    backendRef: request.backendRef,
    expectedQaBackendRef: request.expectedQaBackendRef,
  });

  const reasons: string[] = [];

  if (!request.allowWrites) {
    reasons.push("QA_ALLOW_WRITES is not enabled");
  }
  if (classification.kind !== "qa") {
    reasons.push(`environment classified as "${classification.kind}", not "qa"`);
  }
  if (!request.backendRef) {
    reasons.push("no backend identity is configured");
  }
  if (!request.expectedQaBackendRef) {
    reasons.push("no expected QA backend ref (QA_EXPECTED_PROJECT_REF) is configured");
  }
  if (
    request.backendRef &&
    request.expectedQaBackendRef &&
    request.backendRef !== request.expectedQaBackendRef
  ) {
    reasons.push("configured backend identity does not match the expected QA backend ref");
  }
  if (request.backendRef && request.protectedBackendRefs.includes(request.backendRef)) {
    reasons.push(`backend "${request.backendRef}" is on the protected backend denylist`);
  }
  if (!request.recordPrefix) {
    reasons.push("no QA record prefix (QA_RECORD_PREFIX) is configured");
  }
  if (!request.profileSlugPrefix) {
    reasons.push("no QA profile slug prefix (QA_PROFILE_SLUG_PREFIX) is configured");
  }

  if (reasons.length === 0) {
    return {
      allowed: true,
      environmentKind: classification.kind,
      reasons: ["all destructive-QA safety conditions satisfied"],
    };
  }

  return { allowed: false, environmentKind: classification.kind, reasons };
}

/**
 * Throwing form — the one every future destructive operation must call
 * before doing anything. Refuses (throws) rather than silently continuing
 * whenever any condition fails.
 */
export function assertDestructiveQaAllowed(request: DestructiveQaRequest): DestructiveQaDecision {
  const decision = evaluateDestructiveQaRequest(request);
  if (!decision.allowed) {
    throw new Error(`Destructive QA operation blocked: ${decision.reasons.join("; ")}`);
  }
  return decision;
}
