// QA-1E — reusable destructive-suite preflight. The ONE place the FAQ CRUD
// pilot (and any future business-CRUD pilot) resolves the actual backend
// identity and calls assertDestructiveQaAllowed() before a single browser
// mutation happens. Node-only; safe to call at the top of a Playwright
// spec file (which runs in Node) — never call from inside page.evaluate.
import {
  createSupabaseProviderFromEnv,
  type SupabaseQaProvider,
} from "../../helpers/providers/supabase-provider.ts";
import { assertDestructiveQaAllowed } from "../../helpers/safety-gate.ts";
import { beautyfolioProject } from "./project.ts";

export interface DestructiveQaPreflightResult {
  provider: SupabaseQaProvider;
  /** Deterministic per-run identifier used to prefix every temporary
   * record this suite creates (QA_RECORD_PREFIX + runId + ...). */
  runId: string;
}

/**
 * Throws (refuses to proceed) unless every independent safety condition
 * holds: backend resolves to the QA project (never the protected one),
 * writes are explicitly enabled for this one process only (never the
 * persistent .env.test default), and the QA record/slug prefixes are
 * configured. Never relies on Playwright's baseURL alone — resolves the
 * actual configured backend identity from the provider.
 */
export function runDestructiveQaPreflight(): DestructiveQaPreflightResult {
  const provider = createSupabaseProviderFromEnv();
  if (!provider) {
    throw new Error(
      "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured in .env.test — destructive QA suite cannot run.",
    );
  }

  const identity = provider.identity();
  const allowWrites = process.env["QA_ALLOW_WRITES_OVERRIDE"] === "true";

  // Throws with a full explanation if any condition fails — see
  // tests/helpers/safety-gate.ts. Never silently continues.
  assertDestructiveQaAllowed({
    allowWrites,
    configuredEnvironment: process.env["QA_ENVIRONMENT"] ?? null,
    baseUrl: process.env["QA_BASE_URL"] ?? null,
    backendRef: identity.backendRef,
    expectedQaBackendRef: process.env["QA_EXPECTED_PROJECT_REF"] ?? null,
    protectedBackendRefs: beautyfolioProject.protectedBackendRefs,
    recordPrefix: process.env["QA_RECORD_PREFIX"] ?? null,
    profileSlugPrefix: process.env["QA_PROFILE_SLUG_PREFIX"] ?? null,
  });

  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { provider, runId };
}

/** Builds the deterministic, run-specific FAQ content this suite must use
 * for every temporary record — never generic human-looking content that
 * could be mistaken for real data. */
export function buildQaFaqContent(runId: string) {
  const prefix = `${process.env["QA_RECORD_PREFIX"] ?? "QA_E2E_"}${runId}_`;
  return {
    prefix,
    question: `${prefix} What is the automated FAQ test?`,
    initialAnswer: `${prefix} Initial answer`,
    editedAnswer: `${prefix} Edited answer`,
  };
}

/** QA-1F — deterministic, run-specific Service content. Names/descriptions
 * are always QA_E2E_<runId>_-prefixed, never human-looking production data. */
export function buildQaServiceContent(runId: string) {
  const prefix = `${process.env["QA_RECORD_PREFIX"] ?? "QA_E2E_"}${runId}_`;
  return {
    prefix,
    name: `${prefix}Bridal Service`,
    description: `${prefix}Initial service description that is long enough to satisfy indexability checks.`,
    editedDescription: `${prefix}Edited service description that is long enough to satisfy indexability checks.`,
    category: "Bridal Makeup",
    price: "1500",
    durationMinutes: "90",
    includedItems: [`${prefix}Item A`, `${prefix}Item B`],
    suitableFor: [`${prefix}Bride`, `${prefix}Engagement`],
    preparationNotes: `${prefix}Preparation note`,
    // Focused pricing-regression case (§18) — a second, separate temporary
    // service exercising the custom_quote transition, cleanup-scoped like
    // the primary one.
    quoteName: `${prefix}Quote Service`,
    quoteDescription: `${prefix}Custom quote service description, long enough for indexability checks.`,
  };
}

/** QA-1G — deterministic, run-specific Package content. Names/inclusions
 * are always QA_E2E_<runId>_-prefixed, never human-looking production data. */
export function buildQaPackageContent(runId: string) {
  const prefix = `${process.env["QA_RECORD_PREFIX"] ?? "QA_E2E_"}${runId}_`;
  return {
    prefix,
    name: `${prefix}Bridal Package`,
    bestFor: `${prefix}Brides with one main function`,
    price: "15000",
    inclusions: [`${prefix}Makeup`, `${prefix}Hairstyle`, `${prefix}Draping`],
    note: `${prefix}Most popular`,
    editedNote: `${prefix}Most popular edited`,
    // §19 focused pricing-regression case — a second, separate temporary
    // package exercising the custom_quote transition, cleanup-scoped like
    // the primary one.
    quoteName: `${prefix}Quote Package`,
    quotePrice: "25000",
    quoteInclusions: [`${prefix}Consultation`, `${prefix}Trial`],
    // §20 optional second price-type transition, applied to the companion
    // quote package before its cleanup.
    quoteTransitionPrice: "27000",
  };
}

/** QA-1H — deterministic, run-specific Gallery content. Title is always
 * QA_E2E_<runId>_-prefixed, never human-looking production data. The
 * uploaded storage object's path is timestamp-based (app behavior, not
 * runId-based), so run-attribution happens via the DB row's stored path,
 * never by parsing the filename for the runId. */
export function buildQaGalleryContent(runId: string) {
  const prefix = `${process.env["QA_RECORD_PREFIX"] ?? "QA_E2E_"}${runId}_`;
  return {
    prefix,
    title: `${prefix}Gallery`,
    category: "bridal",
  };
}

/** QA-1I — deterministic, run-specific Before & After content. Title is
 * always QA_E2E_<runId>_-prefixed, never human-looking production data. */
export function buildQaBeforeAfterContent(runId: string) {
  const prefix = `${process.env["QA_RECORD_PREFIX"] ?? "QA_E2E_"}${runId}_`;
  return {
    prefix,
    title: `${prefix}BeforeAfter`,
    eventType: "Bridal",
    location: "QA Location",
    description: `${prefix}Initial description`,
    editedDescription: `${prefix}Edited description`,
  };
}

/** QA-1J — deterministic, run-specific Video content. Title is always
 * QA_E2E_<runId>_-prefixed, never human-looking production data. The
 * YouTube video ID is a synthetic-but-format-valid 11-char id derived from
 * the runId (never a real/reachable video) — this suite only proves URL
 * validation/provider-detection/embed-URL-construction, never real
 * third-party playback (per the phase's explicit no-flaky-network-
 * dependency instruction). */
export function buildQaVideoContent(runId: string) {
  const prefix = `${process.env["QA_RECORD_PREFIX"] ?? "QA_E2E_"}${runId}_`;
  const youtubeId = `${runId}00000000000`.replace(/[^\w-]/g, "0").slice(0, 11);
  return {
    prefix,
    title: `${prefix}Video`,
    category: "Bridal",
    description: `${prefix}Initial description`,
    editedDescription: `${prefix}Edited description`,
    durationSeconds: "120",
    youtubeId,
    youtubeWatchUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
    youtubeShortUrl: `https://youtu.be/${youtubeId}`,
    expectedEmbedSrc: `https://www.youtube.com/embed/${youtubeId}?autoplay=1&playsinline=1`,
    invalidTitle: `${prefix}InvalidVideo`,
  };
}

/** QA-1O — deterministic, run-specific Review content. There is no public
 * review-submission flow in this product (reviews are curated testimonials
 * the beautician records from external sources) and no admin-side create
 * function either — so QA seeds a review directly via the provider's
 * insertRow, exactly like a beautician using their own dashboard would,
 * then exercises admin moderation against it. client_name is always
 * QA_E2E_<runId>_-prefixed, never a human-looking name. */
export function buildQaReviewContent(runId: string) {
  const prefix = `${process.env["QA_RECORD_PREFIX"] ?? "QA_E2E_"}${runId}_`;
  return {
    prefix,
    clientName: `${prefix}Client`,
    rating: 5,
    reviewText: `${prefix}Absolutely loved the bridal makeup — professional, punctual, and stunning results.`,
    serviceName: "Bridal Makeup",
  };
}

/** QA-1P — deterministic, run-specific Lead content. Submitted through the
 * REAL public "Check availability" form (submit_lead RPC), not seeded
 * directly — this is the one module in the Portfolio Builder with a
 * genuine public-facing creation path. client_name is always
 * QA_E2E_<runId>_-prefixed; phone is a synthetic-but-valid-format
 * (10-digit) number derived from the current timestamp, never a real
 * number. A temporary QA service is also seeded so the form's required
 * "Service" <select> has a real option to choose (a clean QA fixture
 * profile otherwise has zero services). */
export function buildQaLeadContent(runId: string) {
  const prefix = `${process.env["QA_RECORD_PREFIX"] ?? "QA_E2E_"}${runId}_`;
  return {
    prefix,
    clientName: `${prefix}Client`,
    phone: `90000${Date.now().toString().slice(-5)}`,
    location: `${prefix}Test Location`,
    message: `${prefix}Please share your availability for a bridal booking enquiry.`,
    serviceName: `${prefix}Bridal Makeup`,
  };
}
