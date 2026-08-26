// Shared SEO generation logic — pure functions only, safe to import from
// both the public portfolio route (src/routes/portfolio.$slug.tsx) and the
// dashboard SEO page (src/routes/dashboard.seo.tsx). This is the single
// source of truth for "what's the default title/description/target for
// this portfolio" so the dashboard's preview and the live <head> can never
// drift apart — see docs/BEAUTYFOLIO-PHASE3F1-SEO-AUDIT.md §5 for the
// ownership model this implements.
import { slugify } from "./slugify";

// ---------- opening hours (structured data) ----------

const WORKING_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const SCHEMA_DAY_URI: Record<(typeof WORKING_DAYS)[number], string> = {
  monday: "https://schema.org/Monday",
  tuesday: "https://schema.org/Tuesday",
  wednesday: "https://schema.org/Wednesday",
  thursday: "https://schema.org/Thursday",
  friday: "https://schema.org/Friday",
  saturday: "https://schema.org/Saturday",
  sunday: "https://schema.org/Sunday",
};

export interface OpeningHoursSpec {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string;
  opens: string;
  closes: string;
}

/**
 * Builds real schema.org OpeningHoursSpecification entries from
 * `availability_settings.working_hours` — a genuinely structured per-day
 * {day, available, start, end} JSONB array the beautician fills in on the
 * Availability page ("Turn on the days you work and set your usual
 * hours"). This is authored business-availability data, not a booking
 * slot/calendar system, so mapping it to openingHours is accurate — see
 * docs/BEAUTYFOLIO-PHASE3F2A-SEO-INFRASTRUCTURE.md §6 for the full CASE
 * A/B/C decision record. Returns [] (never fabricates) when the value
 * isn't the expected shape or no day is marked available — callers should
 * omit the `openingHoursSpecification` property entirely in that case
 * rather than emit an empty array.
 */
export function buildOpeningHoursSpecification(workingHours: unknown): OpeningHoursSpec[] {
  if (!Array.isArray(workingHours)) return [];
  const isValidTime = (v: unknown): v is string => typeof v === "string" && /^\d{2}:\d{2}/.test(v);

  const specs: OpeningHoursSpec[] = [];
  for (const entry of workingHours) {
    if (
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof (entry as Record<string, unknown>)["day"] === "string" &&
      (WORKING_DAYS as readonly string[]).includes(
        (entry as Record<string, unknown>)["day"] as string,
      ) &&
      (entry as Record<string, unknown>)["available"] === true &&
      isValidTime((entry as Record<string, unknown>)["start"]) &&
      isValidTime((entry as Record<string, unknown>)["end"])
    ) {
      const day = (entry as Record<string, unknown>)["day"] as (typeof WORKING_DAYS)[number];
      specs.push({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: SCHEMA_DAY_URI[day],
        opens: (entry as Record<string, unknown>)["start"] as string,
        closes: (entry as Record<string, unknown>)["end"] as string,
      });
    }
  }
  return specs;
}

export interface SeoServiceInput {
  name: string;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
}

/**
 * "Primary service" is never stored — it's derived live from the existing
 * `services` table so the SEO layer never becomes a second source of truth.
 * Preference order: the beautician's explicitly featured active service,
 * else their first active service by sort_order, else null (no services
 * configured yet).
 */
export function resolvePrimaryService(services: SeoServiceInput[]): string | null {
  const active = services.filter((s) => s.is_active);
  const featured = active.find((s) => s.is_featured);
  if (featured) return featured.name;
  const bySortOrder = [...active].sort((a, b) => a.sort_order - b.sort_order);
  return bySortOrder[0]?.name ?? null;
}

export interface SeoProfileInput {
  name: string;
  role: string;
  primaryCity: string;
  specializations: string[];
}

/**
 * "{Professional Title} in {City} | {Name}" — e.g. "Bridal Makeup Artist in
 * Ahmedabad | Dharti R Panchal". Deliberately built from `profile.role`
 * (the beautician's own authored professional title, e.g. "Bridal Makeup
 * Artist"), not the raw primary-service catalog name (e.g. "Bridal
 * Makeup") — the role is already phrased as a search-friendly job title,
 * while concatenating a bare service name would either drop the "Artist"/
 * "Specialist" wording or require guessing it. `primaryService` is used
 * only as a fallback when the profile has no role set yet.
 */
export function buildDefaultSeoTitle(
  profile: SeoProfileInput,
  primaryService: string | null,
): string {
  const title = (profile.role || primaryService || profile.specializations[0] || "").trim() || null;
  if (title && profile.primaryCity) {
    return `${title} in ${profile.primaryCity} | ${profile.name}`;
  }
  if (title) {
    return `${title} | ${profile.name}`;
  }
  return `${profile.name} | BeautyFolio`;
}

/** A short, factual description built only from data the profile actually
 * has — never invents a city, service, or credential that isn't set. */
export function buildDefaultMetaDescription(
  profile: SeoProfileInput,
  primaryService: string | null,
): string {
  const service = primaryService ?? profile.specializations[0] ?? null;
  const cityPart = profile.primaryCity ? ` in ${profile.primaryCity}` : "";
  if (service) {
    return `Explore ${service.toLowerCase()} services by ${profile.name}${cityPart}. View portfolio, packages, reviews and availability.`;
  }
  return `Discover ${profile.name}, a ${profile.role.toLowerCase()}${cityPart}. View portfolio, services, reviews and availability.`;
}

/** The short "what this portfolio is targeting" concept shown on the SEO
 * dashboard — e.g. "Bridal Makeup Artist in Ahmedabad". Purely descriptive;
 * never used to auto-generate location landing pages. */
export function buildPrimarySearchTarget(
  profile: SeoProfileInput,
  primaryService: string | null,
): string | null {
  if (!primaryService || !profile.primaryCity) return null;
  return `${primaryService} in ${profile.primaryCity}`;
}

// ---------- structured-data entity helpers (Phase 3F.3) ----------

/**
 * Real customer-facing social/portfolio URLs the beautician entered on
 * their own Profile page — the only legitimate source for schema.org
 * `sameAs`. Validates each is an actual http(s) URL and drops anything
 * blank/malformed rather than ever inventing a link.
 */
export function buildSameAs(profile: {
  instagramUrl: string | null;
  facebookUrl: string | null;
  youtubeUrl: string | null;
  websiteUrl: string | null;
}): string[] {
  const candidates = [
    profile.instagramUrl,
    profile.facebookUrl,
    profile.youtubeUrl,
    profile.websiteUrl,
  ];
  return candidates.filter((url): url is string => !!url && /^https?:\/\/.+/i.test(url.trim()));
}

export interface ReviewRatingInput {
  rating: number;
}

/**
 * The only legitimate source for schema.org `AggregateRating` is the real,
 * published `reviews` rows — never the separate `beautician_profiles.rating`/
 * `review_count` marketing columns, which are not guaranteed to reconcile
 * with what's actually rendered in the `review[]` array (see Phase 3F.3
 * §9/§20 trust-metric audit). Returns null when there are no reviews yet,
 * so callers omit `aggregateRating` entirely rather than emit a 0/0 value.
 */
export function computeAggregateRating(
  reviews: ReviewRatingInput[],
): { ratingValue: number; reviewCount: number } | null {
  if (reviews.length === 0) return null;
  const sum = reviews.reduce((total, r) => total + r.rating, 0);
  const ratingValue = Math.round((sum / reviews.length) * 10) / 10;
  return { ratingValue, reviewCount: reviews.length };
}

export interface ServicePriceInput {
  price: number | null;
  priceType: "fixed" | "starting_from" | "custom_quote";
  currency: string;
}

/**
 * Schema.org `Offer` pricing has real semantic meaning — `price` asserts a
 * single, fixed price. Only a genuinely `fixed` price_type may use it
 * directly. A `starting_from` price is represented via
 * `priceSpecification.minPrice` instead, so it's never misread as a fixed
 * price. A `custom_quote` service has no real price to assert, so this
 * returns null and callers must omit the `Offer` for that item entirely
 * rather than emit one with a fabricated/empty price.
 */
export function buildOfferPricing(
  input: ServicePriceInput,
):
  | { price: number; priceCurrency: string }
  | { priceSpecification: Record<string, unknown> }
  | null {
  if (input.price == null) return null;
  if (input.priceType === "custom_quote") return null;
  if (input.priceType === "fixed") {
    return { price: input.price, priceCurrency: input.currency };
  }
  return {
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      minPrice: input.price,
      priceCurrency: input.currency,
    },
  };
}

// Phase 3F.1's original scored 18-check "SEO Readiness" system
// (computeSeoReadiness/summarizeSeoReadiness/readinessLabel) has been
// retired as of Phase 3F.9 — audited and fully superseded by the unified
// evaluatePortfolioContentReadiness() model below, which reuses this exact
// MIN_BIO_LENGTH threshold and every genuinely-useful check from that list
// (recategorized into content/local/trust/technical, required-vs-
// recommended instead of a weighted percentage). See Phase 3F.9 §1/§21.
const MIN_BIO_LENGTH = 80;

// ---------- service SEO landing pages (Phase 3F.4) ----------

/**
 * `services.slug` is a real, stable column but has no write path yet for
 * services created before this phase (always NULL). Falls back to a
 * computed slug so existing services already work as service-page URLs;
 * the fallback is deterministic (same slugify() used when a real slug is
 * persisted), so a legacy service's URL never changes once the beautician
 * next saves it via the dashboard and a real slug gets written. See
 * docs/BEAUTYFOLIO-PHASE3F4-SERVICE-SEO.md §3.
 */
export function resolveServiceSlug(service: { slug: string | null; name: string }): string {
  return service.slug || slugify(service.name);
}

/**
 * "Bridal Makeup" → "Bridal Makeup Artist", but "Hair Styling" and "Nail
 * Extensions" are left as-is — "Artist" is only appended to makeup-related
 * service names that don't already end in a role word, matching natural
 * search phrasing without blindly appending "Artist" to every service
 * (Phase 3F.4 §8).
 */
export function serviceSearchLabel(serviceName: string): string {
  const trimmed = serviceName.trim();
  if (/makeup/i.test(trimmed) && !/artist$/i.test(trimmed)) {
    return `${trimmed} Artist`;
  }
  return trimmed;
}

export interface ServiceSeoInput {
  serviceName: string;
  professionalName: string;
  primaryCity: string | null;
}

/** "{Service search label} in {City} | {Name}" — falls back gracefully
 * when there's no city yet (in which case the page is noindex anyway, see
 * evaluateServiceIndexability, but must still render a sane title for a
 * direct-link visitor). */
export function buildServiceSeoTitle(input: ServiceSeoInput): string {
  const label = serviceSearchLabel(input.serviceName);
  if (input.primaryCity) return `${label} in ${input.primaryCity} | ${input.professionalName}`;
  return `${label} | ${input.professionalName}`;
}

/** Same H1 concept as the title, minus the "| Name" suffix — the
 * professional's name stays visible elsewhere on the page instead (Phase
 * 3F.4 §10), so the H1 doesn't just repeat the main portfolio's H1. */
export function buildServiceH1(input: ServiceSeoInput): string {
  const label = serviceSearchLabel(input.serviceName);
  return input.primaryCity ? `${label} in ${input.primaryCity}` : label;
}

/** Deterministic, real-data-only meta description — never inserts
 * unsupported claims like "best"/"top"/"#1" (Phase 3F.4 §9). */
export function buildServiceMetaDescription(input: ServiceSeoInput): string {
  const label = serviceSearchLabel(input.serviceName).toLowerCase();
  const cityPart = input.primaryCity ? ` in ${input.primaryCity}` : "";
  return `Book ${label} with ${input.professionalName}${cityPart}. View pricing, portfolio work and availability.`;
}

const MIN_SERVICE_DESCRIPTION_LENGTH = 40;

export interface ServiceIndexabilityInput {
  /** `portfolio_seo.robots_index`, defaulting to `true` like everywhere else. */
  profileRobotsIndex: boolean;
  primaryCity: string | null;
  /** `short_description ?? description`, whichever the service actually has. */
  serviceDescription: string | null;
  /** Phase 3F.8 §21 — a service's public URL should be stable before its
   * page is treated as search-ready. A legacy NULL slug still resolves and
   * renders correctly via the same computed fallback used everywhere
   * (resolveServiceSlug), so this never breaks the page — it only
   * withholds indexability until the beautician next saves the service and
   * a real slug gets persisted (services.server.ts already does this
   * automatically on every save). Every real service in production
   * already has a persisted slug (Phase 3F.4 backfill), so this condition
   * is not expected to ever fail today. */
  hasPersistedSlug: boolean;
}

export interface ServiceIndexabilityResult {
  indexable: boolean;
  /** Human-readable reasons for each failing check — empty when indexable.
   * Reused verbatim by the /dashboard/seo "Service Search Pages" list. */
  reasons: string[];
}

/**
 * Deterministic indexability rule for a service landing page — no
 * arbitrary score, just a small set of required signals. A page that
 * fails this still renders normally for a direct visitor (noindex,
 * follow) — it is never 404'd for being low-content; only an inactive/
 * deleted service or unpublished profile is 404 (see the route itself).
 * Phase 3F.4 §6/§7/§23.
 */
export function evaluateServiceIndexability(
  input: ServiceIndexabilityInput,
): ServiceIndexabilityResult {
  const reasons: string[] = [];
  if (!input.profileRobotsIndex) {
    reasons.push("Portfolio indexing is turned off in SEO settings.");
  }
  if (!input.primaryCity) {
    reasons.push("Add your city on your Profile page.");
  }
  const descLength = input.serviceDescription?.trim().length ?? 0;
  if (descLength < MIN_SERVICE_DESCRIPTION_LENGTH) {
    reasons.push("Add a more detailed service description (at least a couple of sentences).");
  }
  if (!input.hasPersistedSlug) {
    reasons.push("Save this service again to finish setting up its web address.");
  }
  return { indexable: reasons.length === 0, reasons };
}

// ---------- service content quality & publishing readiness (Phase 3F.8) ----------

export type ServiceReadinessCheckStatus = "pass" | "fail";

export interface ServiceReadinessCheck {
  id: string;
  label: string;
  status: ServiceReadinessCheckStatus;
  /** Shown when status is "fail" — what to do about it. */
  recommendation: string;
}

/**
 * Three deterministic states — deliberately not a percentage/score (Phase
 * 3F.8 §3). "not_eligible" means the service isn't currently reachable by
 * the public at all (inactive, or the profile itself isn't published);
 * "needs_improvement" means it IS publicly visible but doesn't yet satisfy
 * the content requirements search engines are shown; "ready" means both.
 */
export type ServiceContentReadinessState = "ready" | "needs_improvement" | "not_eligible";

export interface ServiceContentReadinessInput {
  profileIsPublished: boolean;
  profileRobotsIndex: boolean;
  serviceIsActive: boolean;
  serviceName: string;
  serviceCategory: string | null;
  serviceHasPersistedSlug: boolean;
  primaryCity: string | null;
  serviceDescription: string | null;
  // ---- recommended / customer-value signals — never block indexability ----
  priceConfigured: boolean;
  durationEntered: boolean;
  includedItemsCount: number;
  suitableForCount: number;
  hasPreparationNotes: boolean;
  linkedWorkCount: number;
  publishedReviewCount: number;
  serviceAreaCount: number;
}

export interface ServiceContentReadiness {
  state: ServiceContentReadinessState;
  /** Exactly the same value evaluateServiceIndexability() would produce for
   * this service once it's active on a published profile — the public
   * route's robots directive and the sitemap both derive from that same
   * function, so this can never disagree with what's actually served
   * (Phase 3F.8 §14). */
  indexable: boolean;
  criticalChecks: ServiceReadinessCheck[];
  recommendedChecks: ServiceReadinessCheck[];
  /** Human-readable reasons for the failing critical checks — reused
   * verbatim by the /dashboard/seo "Service Search Pages" list. */
  criticalReasons: string[];
}

/**
 * The one shared, deterministic service-readiness helper (Phase 3F.8 §4/
 * §14). Distinguishes SAVE VALIDATION (not this function's job — see
 * services.server.ts), PUBLICATION/VISIBILITY (serviceIsActive &&
 * profileIsPublished), and SEARCH READINESS (this function's `indexable`)
 * as three separate concepts, never merged into one score. Recommended
 * checks influence guidance only — never `indexable` or `state`.
 */
export function evaluateServiceContentReadiness(
  input: ServiceContentReadinessInput,
): ServiceContentReadiness {
  const visible = input.profileIsPublished && input.serviceIsActive;

  const { indexable: contentIndexable, reasons: contentReasons } = evaluateServiceIndexability({
    profileRobotsIndex: input.profileRobotsIndex,
    primaryCity: input.primaryCity,
    serviceDescription: input.serviceDescription,
    hasPersistedSlug: input.serviceHasPersistedSlug,
  });

  const indexable = visible && contentIndexable;
  const descLength = input.serviceDescription?.trim().length ?? 0;

  const criticalChecks: ServiceReadinessCheck[] = [
    {
      id: "profile_published",
      label: "Portfolio published",
      status: input.profileIsPublished ? "pass" : "fail",
      recommendation: "Publish your portfolio so this service page can be found.",
    },
    {
      id: "service_active",
      label: "Service visible on your portfolio",
      status: input.serviceIsActive ? "pass" : "fail",
      recommendation: 'Turn on "Show on my portfolio" for this service.',
    },
    {
      id: "indexing_enabled",
      label: "Search indexing enabled",
      status: input.profileRobotsIndex ? "pass" : "fail",
      recommendation: 'Turn on "Allow search engines to show my portfolio" in SEO settings.',
    },
    {
      id: "service_name",
      label: "Service name",
      status: input.serviceName.trim() ? "pass" : "fail",
      recommendation: "Add a service name.",
    },
    {
      id: "category",
      label: "Category",
      status: input.serviceCategory?.trim() ? "pass" : "fail",
      recommendation: "Choose a category for this service.",
    },
    {
      id: "city",
      label: "Primary city present",
      status: input.primaryCity ? "pass" : "fail",
      recommendation: "Add your primary city in Profile.",
    },
    {
      id: "description",
      label: "Meaningful description",
      status: descLength >= MIN_SERVICE_DESCRIPTION_LENGTH ? "pass" : "fail",
      recommendation: "Add a clearer service description.",
    },
    {
      id: "service_slug",
      label: "Stable web address",
      status: input.serviceHasPersistedSlug ? "pass" : "fail",
      recommendation: "Save this service again to finish setting up its web address.",
    },
  ];

  const recommendedChecks: ServiceReadinessCheck[] = [
    {
      id: "pricing",
      label: "Pricing configured",
      status: input.priceConfigured ? "pass" : "fail",
      recommendation: "Add a price, or leave it as a custom quote.",
    },
    {
      id: "duration",
      label: "Duration entered",
      status: input.durationEntered ? "pass" : "fail",
      recommendation: "Add the typical duration, if relevant to this service.",
    },
    {
      id: "included_items",
      label: "What's included added",
      status: input.includedItemsCount > 0 ? "pass" : "fail",
      recommendation: "List what's included in this service.",
    },
    {
      id: "suitable_for",
      label: "Suitable for added",
      status: input.suitableForCount > 0 ? "pass" : "fail",
      recommendation: "Add occasions this service is best suited for.",
    },
    {
      id: "preparation_notes",
      label: "Preparation notes added",
      status: input.hasPreparationNotes ? "pass" : "fail",
      recommendation: "Add preparation notes if clients should know something beforehand.",
    },
    {
      id: "linked_work",
      label: "Portfolio work linked",
      status: input.linkedWorkCount > 0 ? "pass" : "fail",
      recommendation: "Link Gallery or Before/After work to this service.",
    },
    {
      id: "reviews",
      label: "Reviews present",
      status: input.publishedReviewCount > 0 ? "pass" : "fail",
      recommendation: "Real client reviews build trust — add one when you have it.",
    },
    {
      id: "service_areas",
      label: "Service areas configured",
      status: input.serviceAreaCount > 0 ? "pass" : "fail",
      recommendation: "Add the areas you serve on the Service Areas page.",
    },
  ];

  const state: ServiceContentReadinessState = !visible
    ? "not_eligible"
    : indexable
      ? "ready"
      : "needs_improvement";

  return {
    state,
    indexable,
    criticalChecks,
    recommendedChecks,
    criticalReasons: visible
      ? contentReasons
      : [
          !input.profileIsPublished
            ? "Your portfolio isn't published yet."
            : "This service isn't shown on your portfolio yet.",
        ],
  };
}

/** Short badge text for compact contexts (service cards) — same three
 * states as ServiceContentReadinessState, phrased for a small badge. */
export function serviceReadinessBadgeLabel(state: ServiceContentReadinessState): string {
  if (state === "ready") return "Ready for search";
  if (state === "needs_improvement") return "Needs details";
  return "Not indexed";
}

/** Full-sentence status label for the readiness panel / SEO dashboard. */
export function serviceReadinessStateLabel(state: ServiceContentReadinessState): string {
  if (state === "ready") return "Ready for search";
  if (state === "needs_improvement") return "Needs improvement";
  return "Not eligible for search";
}

/** User-facing explanatory sentence (Phase 3F.8 §17) — deliberately never
 * mentions Google approving/rejecting/ranking anything. */
/**
 * `isPreview` (Phase 3F.8A §2/§7) — set only for the in-dialog live
 * checklist while it reflects unsaved form state. Never implies the public
 * page, robots directive, or sitemap have already changed — those only
 * ever reflect saved data (see the dialog's own "Preview based on unsaved
 * changes" note, shown alongside this message, not instead of it).
 */
export function serviceReadinessMessage(
  state: ServiceContentReadinessState,
  isPreview = false,
): string {
  if (state === "ready") {
    return isPreview ? "Will be ready for search once you save." : "Ready for search.";
  }
  if (state === "needs_improvement")
    return "Visible on your portfolio, but not ready for search yet.";
  return "Not currently visible on your public portfolio.";
}

// ---------- portfolio content quality & search readiness (Phase 3F.9) ----------

/**
 * The lean, required-signals-only rule — the single source of truth for
 * the public portfolio's robots directive and its sitemap eligibility, the
 * same architecture as evaluateServiceIndexability() (Phase 3F.4/3F.8).
 * evaluatePortfolioContentReadiness() below wraps this exact function for
 * its own `indexable` result, so the full dashboard checklist, the public
 * route's <meta name="robots">, and the sitemap query can never disagree
 * (Phase 3F.9 §23).
 *
 * Audit outcome (Phase 3F.9 §1/§4) on which signals are genuinely REQUIRED:
 * - `hasPersistedSlug` from the service model has no portfolio equivalent —
 *   a profile is only ever reachable BY its slug (the public route looks
 *   it up via `.eq("slug", slug)`), so "the page exists but has no slug" is
 *   not a real reachable state the way a legacy NULL service slug was.
 *   Deliberately omitted rather than included as a permanently-vacuous
 *   check.
 * - `profileImage` is a strongly-recommended trust/presentation signal, NOT
 *   required (Phase 3F.9 policy correction): a missing photo weakens
 *   public trust, the OG/social-share image fallback, and the Person
 *   entity's completeness, but does not by itself make an otherwise
 *   legitimate, complete portfolio unsuitable for search indexing —
 *   `hasProfileImage` is still tracked (see PortfolioReadinessInput) so it
 *   surfaces as a recommended checklist item, it just never gates
 *   `indexable`.
 * - `contactInfo` (phone/email) was DOWNGRADED from the Phase 3F.1 model's
 *   "critical" severity to a recommended/trust signal — a real, valid,
 *   crawlable page does not strictly need a phone number to be indexed;
 *   that was a business-completeness concern, not a genuine crawlability
 *   one (§13/§15).
 * - `canonicalUrl` is never required: it always resolves to a valid
 *   default (`portfolio_seo.canonical_url ?? absoluteUrl(path)`) even when
 *   the beautician has entered nothing — only a manually-entered invalid
 *   override can ever fail it, so it stays a technical hygiene check, not
 *   an indexability gate.
 */
export interface PortfolioIndexabilityInput {
  isPublished: boolean;
  robotsIndex: boolean;
  professionalName: string | null;
  professionalTitle: string | null;
  primaryCity: string | null;
  bio: string | null;
  activeServiceCount: number;
}

export interface PortfolioIndexabilityResult {
  indexable: boolean;
  reasons: string[];
}

export function evaluatePortfolioIndexability(
  input: PortfolioIndexabilityInput,
): PortfolioIndexabilityResult {
  const reasons: string[] = [];
  if (!input.isPublished) {
    reasons.push("Your portfolio isn't published yet.");
  }
  if (!input.robotsIndex) {
    reasons.push('Turn on "Allow search engines to show my portfolio" in SEO settings.');
  }
  if (!input.professionalName?.trim()) {
    reasons.push("Add your name on your Profile page.");
  }
  if (!input.professionalTitle?.trim()) {
    reasons.push("Add a professional title on your Profile page.");
  }
  if (!input.primaryCity) {
    reasons.push("Add your primary city in Profile.");
  }
  if ((input.bio?.trim().length ?? 0) < MIN_BIO_LENGTH) {
    reasons.push(
      "Add a clear introduction describing your experience, services, and the clients you work with.",
    );
  }
  if (input.activeServiceCount === 0) {
    reasons.push("Add and activate at least one service.");
  }
  return { indexable: reasons.length === 0, reasons };
}

export type PortfolioReadinessCategory = "content" | "local" | "trust" | "technical";

export interface PortfolioReadinessCheck {
  id: string;
  label: string;
  category: PortfolioReadinessCategory;
  /** true = part of evaluatePortfolioIndexability()'s required set (blocks
   * search readiness); false = recommended/enhancement guidance only —
   * never blocks `indexable` or `state` (Phase 3F.9 §5). */
  required: boolean;
  status: "pass" | "fail";
  recommendation: string;
}

export type PortfolioReadinessState = "ready" | "needs_improvement" | "not_eligible";

export interface PortfolioReadinessInput extends PortfolioIndexabilityInput {
  /** Strongly-recommended trust/presentation signal, not required (Phase
   * 3F.9 policy correction) — see evaluatePortfolioIndexability's doc
   * comment. Still surfaces as a checklist item, just never gates
   * `indexable`. */
  hasProfileImage: boolean;
  locality: string | null;
  serviceAreaCount: number;
  isVerified: boolean;
  yearsExperience: number | null;
  publishedGalleryImageCount: number;
  galleryImagesWithAltCount: number;
  publishedBeforeAfterCount: number;
  publishedReviewCount: number;
  publishedFaqCount: number;
  publishedVideoCount: number;
  hasValidSocialLink: boolean;
  hasContactInfo: boolean;
  availabilityConfigured: boolean;
  seoTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
}

export interface PortfolioReadiness {
  state: PortfolioReadinessState;
  /** Identical to evaluatePortfolioIndexability(input).indexable — reused,
   * not re-derived, so this can never disagree with the public route/
   * sitemap (§14/§23). */
  indexable: boolean;
  checks: PortfolioReadinessCheck[];
  requiredFailedCount: number;
  /** Human-readable reasons for the failing required checks — reused
   * verbatim by the SEO dashboard's top "Search Visibility" section. */
  reasons: string[];
}

/**
 * The one shared, deterministic portfolio-readiness helper (Phase 3F.9
 * §3/§14). Consumes existing per-service readiness results rather than
 * recomputing them (§18) — `activeServiceCount` is the only service signal
 * this function itself needs. Never merges required and recommended checks
 * into one score; `checks` carries every item with an explicit `category`
 * (content/local/trust/technical, §22) and `required` flag so callers can
 * render them grouped without re-deriving that split themselves.
 */
export function evaluatePortfolioContentReadiness(
  input: PortfolioReadinessInput,
): PortfolioReadiness {
  const { indexable, reasons } = evaluatePortfolioIndexability(input);
  const bioLength = input.bio?.trim().length ?? 0;

  const checks: PortfolioReadinessCheck[] = [
    // ---- Content ----
    {
      id: "professional_name",
      label: "Professional name",
      category: "content",
      required: true,
      status: input.professionalName?.trim() ? "pass" : "fail",
      recommendation: "Add your name on your Profile page.",
    },
    {
      id: "professional_title",
      label: "Professional title",
      category: "content",
      required: true,
      status: input.professionalTitle?.trim() ? "pass" : "fail",
      recommendation: "Add a professional title on your Profile page.",
    },
    {
      id: "about_bio",
      label: "About / introduction",
      category: "content",
      required: true,
      status: bioLength >= MIN_BIO_LENGTH ? "pass" : "fail",
      recommendation:
        "Add a clear introduction describing your experience, services, and the clients you work with.",
    },
    {
      id: "profile_image",
      label: "Profile photo",
      category: "content",
      required: false,
      status: input.hasProfileImage ? "pass" : "fail",
      recommendation:
        "Add a profile photo to strengthen trust and how your portfolio appears when shared.",
    },
    // ---- Local relevance ----
    {
      id: "primary_city",
      label: "Primary city",
      category: "local",
      required: true,
      status: input.primaryCity ? "pass" : "fail",
      recommendation: "Add your primary city in Profile.",
    },
    {
      id: "active_services",
      label: "At least one active service",
      category: "local",
      required: true,
      status: input.activeServiceCount > 0 ? "pass" : "fail",
      recommendation: "Add and activate at least one service.",
    },
    {
      id: "locality",
      label: "Locality / area",
      category: "local",
      required: false,
      status: input.locality ? "pass" : "fail",
      recommendation: "Add your locality/area for more precise local search.",
    },
    {
      id: "service_areas",
      label: "Service areas configured",
      category: "local",
      required: false,
      status: input.serviceAreaCount > 0 ? "pass" : "fail",
      recommendation: "Add the areas you serve on the Service Areas page.",
    },
    // ---- Trust / customer value ----
    {
      id: "verified",
      label: "Verified professional",
      category: "trust",
      required: false,
      status: input.isVerified ? "pass" : "fail",
      recommendation: "Verification is reviewed and managed by BeautyFolio.",
    },
    {
      id: "years_experience",
      label: "Years of experience",
      category: "trust",
      required: false,
      status: input.yearsExperience != null ? "pass" : "fail",
      recommendation: "Add your years of experience on your Profile page.",
    },
    {
      id: "gallery_work",
      label: "Published Gallery work",
      category: "trust",
      required: false,
      status: input.publishedGalleryImageCount > 0 ? "pass" : "fail",
      recommendation: "Publish photos of your work in the Gallery.",
    },
    {
      id: "gallery_alt_text",
      label: "Gallery photo descriptions",
      category: "trust",
      required: false,
      status:
        input.publishedGalleryImageCount === 0 ||
        input.galleryImagesWithAltCount >= input.publishedGalleryImageCount
          ? "pass"
          : "fail",
      recommendation: "Add descriptions to your Gallery photos.",
    },
    {
      id: "before_after",
      label: "Before & After work",
      category: "trust",
      required: false,
      status: input.publishedBeforeAfterCount > 0 ? "pass" : "fail",
      recommendation: "Add a Before & After transformation.",
    },
    {
      id: "reviews",
      label: "Published reviews",
      category: "trust",
      required: false,
      status: input.publishedReviewCount > 0 ? "pass" : "fail",
      recommendation: "Real client reviews build trust — add one when you have it.",
    },
    {
      id: "faqs",
      label: "FAQs",
      category: "trust",
      required: false,
      status: input.publishedFaqCount > 0 ? "pass" : "fail",
      recommendation: "Add a few frequently asked questions.",
    },
    {
      id: "videos",
      label: "Video content",
      category: "trust",
      required: false,
      status: input.publishedVideoCount > 0 ? "pass" : "fail",
      recommendation: "Add a video of your work to the Videos page.",
    },
    {
      id: "availability",
      label: "Availability configured",
      category: "trust",
      required: false,
      status: input.availabilityConfigured ? "pass" : "fail",
      recommendation: "Set your working hours on the Availability page.",
    },
    {
      id: "contact",
      label: "Contact path available",
      category: "trust",
      required: false,
      status: input.hasContactInfo ? "pass" : "fail",
      recommendation: "Add a phone number, email, or WhatsApp number on your Profile page.",
    },
    {
      id: "social_link",
      label: "Social link added",
      category: "trust",
      required: false,
      status: input.hasValidSocialLink ? "pass" : "fail",
      recommendation:
        "Add your Instagram, Facebook, YouTube, or website link on your Profile page.",
    },
    // ---- Technical ----
    {
      id: "indexing_enabled",
      label: "Search indexing enabled",
      category: "technical",
      required: true,
      status: input.robotsIndex ? "pass" : "fail",
      recommendation: 'Turn on "Allow search engines to show my portfolio" in SEO settings.',
    },
    {
      id: "meta_title_valid",
      label: "Meta title length",
      category: "technical",
      required: false,
      status: (input.seoTitle?.length ?? 0) <= 60 ? "pass" : "fail",
      recommendation: "Keep your SEO title under ~60 characters so it isn't truncated in search.",
    },
    {
      id: "meta_description_valid",
      label: "Meta description length",
      category: "technical",
      required: false,
      status:
        !input.metaDescription ||
        (input.metaDescription.length >= 50 && input.metaDescription.length <= 160)
          ? "pass"
          : "fail",
      recommendation: "Keep your meta description between 50–160 characters.",
    },
    {
      id: "canonical_valid",
      label: "Canonical URL",
      category: "technical",
      required: false,
      status: !input.canonicalUrl || /^https?:\/\//.test(input.canonicalUrl) ? "pass" : "fail",
      recommendation:
        "Canonical URL should be a full https:// link, or left blank to use the default.",
    },
  ];

  const requiredFailedCount = checks.filter((c) => c.required && c.status === "fail").length;
  const state: PortfolioReadinessState = !input.isPublished
    ? "not_eligible"
    : indexable
      ? "ready"
      : "needs_improvement";

  return { state, indexable, checks, requiredFailedCount, reasons };
}

/** Short badge text for compact contexts — same three states as
 * PortfolioReadinessState, phrased for a small badge (Phase 3F.9 §19). */
export function portfolioReadinessBadgeLabel(state: PortfolioReadinessState): string {
  if (state === "ready") return "Ready for search";
  if (state === "needs_improvement") return "Needs improvement";
  return "Not indexed";
}

/** Full-sentence status label for the readiness panel / SEO dashboard. */
export function portfolioReadinessStateLabel(state: PortfolioReadinessState): string {
  if (state === "ready") return "Ready for search";
  if (state === "needs_improvement") return "Needs improvement";
  return "Not indexed";
}

/** User-facing explanatory sentence (Phase 3F.9 §25) — deliberately never
 * mentions Google approving/rejecting/ranking anything. `isPreview` mirrors
 * the service-readiness panel's unsaved-changes wording (Phase 3F.8A). */
export function portfolioReadinessMessage(
  state: PortfolioReadinessState,
  isPreview = false,
): string {
  if (state === "ready") {
    return isPreview ? "Will be ready for search once you save." : "Ready for search.";
  }
  if (state === "needs_improvement") {
    return isPreview
      ? "Your portfolio is visible, but would still need one or more improvements before it's ready for search."
      : "Your portfolio is visible, but needs one or more improvements before it is ready for search.";
  }
  return "Your portfolio isn't published, so it isn't visible to search engines yet.";
}
