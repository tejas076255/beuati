// Phase 4.3A — centralized, explicit allow-list production-host
// classification for staging-index protection.
//
// VITE_SITE_URL intentionally always reads "https://beautyfolio.in" even
// while the app is actually being served from the temporary staging host
// (see src/lib/site-url.ts) — that's correct for canonical/OG/sitemap URL
// *generation*, but it means VITE_SITE_URL can never be used to detect the
// *actual* request host. Only the live request's own hostname can do that,
// so every caller here must pass in a hostname read from the real
// incoming Request (e.g. `new URL(request.url).hostname` in src/server.ts
// — the app's normal per-request abstraction), never a blindly-trusted
// forwarded-host header and never this app's own configured site URL.
const PRODUCTION_HOSTS = new Set(["beautyfolio.in", "www.beautyfolio.in"]);

/**
 * Positively identifies an approved production host — everything else
 * (beautyfolio-grow-digital.lovable.app, any other *.lovable.app, preview/
 * test hosts, localhost, 127.0.0.1, unknown hosts) is treated as
 * non-production. Exact-match only against the allow-list, never a
 * substring/`.includes("lovable")`-style check. Normalizes case and strips
 * an optional trailing port before comparing.
 */
export function isProductionHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().trim().split(":")[0] ?? "";
  return PRODUCTION_HOSTS.has(normalized);
}

/**
 * Resolves the real incoming hostname for a Request — the app's normal
 * per-request abstraction, not a blindly-trusted forwarded header. Prefers
 * the request's own `Host` header (the actual wire-level virtual-host
 * signal; what Cloudflare's edge — and any local dev/test harness — sets
 * from the real connection, never client-appended the way X-Forwarded-Host
 * can be through an untrusted hop), falling back to the request URL's own
 * hostname when no Host header is present.
 */
export function requestHostname(request: Request): string {
  return request.headers.get("host") ?? new URL(request.url).hostname;
}
