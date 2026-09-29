// Centralized production site origin — the ONE place "https://beautyfolio.in"
// (or wherever this app is actually deployed) is read from. Every canonical
// URL, og:url, og:image, JSON-LD url/@id/BreadcrumbList entry, and the
// sitemap must go through absoluteUrl()/getSiteUrl() here rather than
// hardcoding or re-deriving the domain locally — see
// docs/BEAUTYFOLIO-PHASE3F2A-SEO-INFRASTRUCTURE.md §1–2.
//
// Env convention matches the existing Supabase pattern in this codebase
// (src/integrations/supabase/client.ts): a VITE_-prefixed var for Vite's
// build-time client replacement (works in both the browser bundle and SSR,
// since Vite statically inlines import.meta.env.* everywhere), with a
// plain-named process.env fallback for parity with the server-only vars
// used elsewhere (SUPABASE_URL, etc).
//
export const CANONICAL_PRODUCTION_URL = "https://beautyfolio.in";

function isDevelopmentOrLocalHost(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(url.trim());
}

function resolveSiteUrl(): string {
  const envUrl = (import.meta.env["VITE_SITE_URL"] ?? process.env["SITE_URL"] ?? "")
    .trim()
    .replace(/\/+$/, "");

  // Automated test environments (Vitest / Playwright QA) may explicitly supply
  // a local test server URL (e.g. QA_BASE_URL / http://localhost:8080) for testing.
  const isTest =
    process.env.NODE_ENV === "test" ||
    Boolean(process.env["VITEST"]) ||
    Boolean(process.env["PLAYWRIGHT_TEST"]);

  if (isTest && envUrl) {
    return envUrl;
  }

  // In production builds and live environments, never allow localhost or dev URLs
  // to leak into canonical links, metadata, or the sitemap.
  const isProd = import.meta.env.PROD || process.env.NODE_ENV === "production";
  if (isProd) {
    if (!envUrl || isDevelopmentOrLocalHost(envUrl)) {
      return CANONICAL_PRODUCTION_URL;
    }
    return envUrl;
  }

  // In development, if an explicit non-localhost URL is provided, use it.
  // Otherwise, default to the canonical production URL so that local SSR/prerender
  // generates correct canonical/OG/JSON-LD and sitemap tags without localhost pollution.
  if (envUrl && !isDevelopmentOrLocalHost(envUrl)) {
    return envUrl;
  }

  return CANONICAL_PRODUCTION_URL;
}

const configuredSiteUrl = resolveSiteUrl();

/** The bare origin, e.g. "https://beautyfolio.in" — never localhost in production. */
export function getSiteUrl(): string {
  return configuredSiteUrl;
}

/**
 * Resolves a site-relative path (must start with "/") to an absolute URL
 * using the configured site origin. Already-absolute input (http/https) is
 * returned unchanged. Falls back to the relative path unchanged when no
 * site URL is configured — never fabricates a domain.
 */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return configuredSiteUrl ? `${configuredSiteUrl}${normalized}` : normalized;
}

/** True only when a real absolute origin is configured — sitemap
 * generation uses this to decide whether it can safely emit spec-valid
 * (i.e. always-absolute) <loc> entries. */
export function hasSiteUrl(): boolean {
  return configuredSiteUrl.length > 0;
}
