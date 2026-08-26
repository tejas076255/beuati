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
// Deliberately NO fallback to window.location / a hardcoded domain / a
// localhost default: if the env var isn't set, every helper below degrades
// to a relative path (the same behavior this app already had before this
// phase) rather than either (a) claiming localhost is the production
// domain, or (b) baking a guessed production domain into the source that
// would silently apply even to a fork/staging deploy with a different URL.
const configuredSiteUrl = (import.meta.env["VITE_SITE_URL"] ?? process.env["SITE_URL"] ?? "")
  .trim()
  .replace(/\/+$/, "");

/** The bare origin, e.g. "https://beautyfolio.in" — "" if not configured. */
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
