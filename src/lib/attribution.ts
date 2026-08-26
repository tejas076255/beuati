// Phase 3G.3A — the ONE centralized attribution helper. It captures a
// single conversion-session attribution snapshot (recognized UTM
// parameters, landing pathname, external referrer host, last-clicked CTA
// location) in sessionStorage and hands it to the public availability form
// at submit time. No React/UI logic lives here — pure browser-storage
// reads/writes, safe to import from both route components and the form.
//
// SCOPE (§12): one conversion-session snapshot per enquiry — explicitly NOT
// multi-touch attribution, not a first-touch/last-touch chain. A fresh
// explicit UTM set on a later page load overwrites the campaign context
// (§11); internal SPA navigation never does (§10).

const STORAGE_KEY = "bf_attribution_v1";

const MAX_UTM_SOURCE = 120;
const MAX_UTM_MEDIUM = 120;
const MAX_UTM_CAMPAIGN = 200;
const MAX_UTM_CONTENT = 200;
const MAX_UTM_TERM = 200;
const MAX_LANDING_PATH = 500;
const MAX_REFERRER_HOST = 253;
const MAX_CTA_LOCATION = 80;

interface StoredAttribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  landing_path?: string;
  referrer_host?: string;
  cta_location?: string;
  // Scopes cta_location to the profile it was recorded on (§16 note) — a
  // CTA click on one professional's page must never attribute an enquiry
  // submitted on a different professional's page later in the same
  // browser session.
  cta_profile_slug?: string;
}

/** Trims, length-caps, and strips control characters — client-side defense
 * only; submit_lead() re-applies the authoritative version of this
 * server-side (§6/§13/§25), since this is untrusted input either way. */
function sanitize(value: string, maxLength: number): string {
  const withoutControlChars = value.replace(
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1F\x7F]/g,
    "",
  );
  return withoutControlChars.trim().slice(0, maxLength);
}

function readStored(): StoredAttribution {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAttribution) : {};
  } catch {
    return {};
  }
}

function writeStored(next: StoredAttribution): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Attribution must never break the app — sessionStorage can throw in
    // private-browsing/storage-restricted contexts.
  }
}

function getExternalReferrerHost(): string | undefined {
  if (typeof document === "undefined" || !document.referrer) return undefined;
  try {
    const referrerUrl = new URL(document.referrer);
    if (referrerUrl.host === window.location.host) return undefined;
    return sanitize(referrerUrl.host, MAX_REFERRER_HOST);
  } catch {
    return undefined;
  }
}

/**
 * Call once per real page load (root component mount) — never on internal
 * SPA navigation, so it naturally satisfies §10 ("internal navigation
 * preserves original landing attribution") without any route-change
 * tracking. Behavior (§11):
 * - a recognized UTM parameter is present -> treat this as a new campaign
 *   touch: overwrite utm_*, landing_path, and referrer_host for it.
 * - no UTM parameters and no attribution stored yet -> this is the
 *   session's true landing page: capture landing_path + referrer_host only.
 * - no UTM parameters and attribution already stored -> no-op, preserve it.
 */
export function initAttribution(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const rawUtmSource = params.get("utm_source");
  const rawUtmMedium = params.get("utm_medium");
  const rawUtmCampaign = params.get("utm_campaign");
  const rawUtmContent = params.get("utm_content");
  const rawUtmTerm = params.get("utm_term");
  const hasNewUtm = !!(
    rawUtmSource ||
    rawUtmMedium ||
    rawUtmCampaign ||
    rawUtmContent ||
    rawUtmTerm
  );
  const stored = readStored();

  if (!hasNewUtm && stored.landing_path) return;

  const externalReferrerHost = getExternalReferrerHost();
  const landingPath = sanitize(window.location.pathname, MAX_LANDING_PATH);

  if (hasNewUtm) {
    // A fresh campaign touch supersedes whichever CTA was clicked before it
    // — that click belonged to the prior touch, not this new one, so
    // cta_location/cta_profile_slug are simply omitted (never set to
    // `undefined` explicitly — exactOptionalPropertyTypes).
    writeStored({
      ...(rawUtmSource ? { utm_source: sanitize(rawUtmSource, MAX_UTM_SOURCE) } : {}),
      ...(rawUtmMedium ? { utm_medium: sanitize(rawUtmMedium, MAX_UTM_MEDIUM) } : {}),
      ...(rawUtmCampaign ? { utm_campaign: sanitize(rawUtmCampaign, MAX_UTM_CAMPAIGN) } : {}),
      ...(rawUtmContent ? { utm_content: sanitize(rawUtmContent, MAX_UTM_CONTENT) } : {}),
      ...(rawUtmTerm ? { utm_term: sanitize(rawUtmTerm, MAX_UTM_TERM) } : {}),
      landing_path: landingPath,
      ...(externalReferrerHost ? { referrer_host: externalReferrerHost } : {}),
    });
    return;
  }

  writeStored({
    ...stored,
    landing_path: landingPath,
    ...(externalReferrerHost ? { referrer_host: externalReferrerHost } : {}),
  });
}

/** Records the most recently clicked "Check availability" CTA, scoped to
 * the profile it was clicked on. Called from the shared CTA-tracking
 * helpers alongside their existing trackEvent() call — one integration
 * point covers every CTA instance across both the portfolio and service
 * detail pages. */
export function recordCtaClick(ctaLocation: string, profileSlug: string): void {
  const stored = readStored();
  writeStored({
    ...stored,
    cta_location: sanitize(ctaLocation, MAX_CTA_LOCATION),
    cta_profile_slug: profileSlug,
  });
}

export interface AttributionSnapshot {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  landing_path?: string;
  referrer_host?: string;
  /** Only present when the last recorded CTA click happened on this same
   * profile — otherwise omitted, so callers fall back to a truthful
   * default (§17) rather than misattributing a different professional's
   * CTA. */
  cta_location?: string;
}

/** The snapshot to send with a new enquiry submission for `profileSlug`. */
export function getAttributionSnapshot(profileSlug: string): AttributionSnapshot {
  const stored = readStored();
  const ctaLocation = stored.cta_profile_slug === profileSlug ? stored.cta_location : undefined;
  return {
    ...(stored.utm_source ? { utm_source: stored.utm_source } : {}),
    ...(stored.utm_medium ? { utm_medium: stored.utm_medium } : {}),
    ...(stored.utm_campaign ? { utm_campaign: stored.utm_campaign } : {}),
    ...(stored.utm_content ? { utm_content: stored.utm_content } : {}),
    ...(stored.utm_term ? { utm_term: stored.utm_term } : {}),
    ...(stored.landing_path ? { landing_path: stored.landing_path } : {}),
    ...(stored.referrer_host ? { referrer_host: stored.referrer_host } : {}),
    ...(ctaLocation ? { cta_location: ctaLocation } : {}),
  };
}

/** The pathname the enquiry is actually being submitted from (§18) — always
 * read fresh, never stored, since it describes this specific submission
 * rather than the browsing session. */
export function getConversionPath(): string {
  if (typeof window === "undefined") return "";
  return sanitize(window.location.pathname, MAX_LANDING_PATH);
}
