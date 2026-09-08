import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { buildSitemapXml } from "./lib/sitemap-xml";
import { absoluteUrl } from "./lib/site-url";
import { isProductionHost, requestHostname } from "./lib/production-host";

// Phase 4.3A — /robots.txt is generated dynamically per-request (same
// pattern as /sitemap.xml below) instead of being a static public/ file,
// specifically so it can be host-aware: the temporary staging deployment
// (beautyfolio-grow-digital.lovable.app, or any non-production host) must
// stay crawlable — Disallow: / would hide the page-level noindex directives
// from bots entirely — but must never advertise the production sitemap, so
// search engines never discover staging content through it. The production
// host keeps the exact prior behavior (allow-all + the real sitemap line).
// A static public/robots.txt would otherwise be served directly by
// Cloudflare's asset binding before this Worker's fetch() ever runs (see
// wrangler.json's "assets" config — no run_worker_first override exists),
// so the static file was removed for this to take effect at all.
function buildRobotsTxt(isProd: boolean): string {
  const bots = ["Googlebot", "Bingbot", "Twitterbot", "facebookexternalhit", "*"];
  const lines = bots.flatMap((ua) => [`User-agent: ${ua}`, "Allow: /", ""]);
  if (isProd) lines.push("Sitemap: https://beautyfolio.in/sitemap.xml");
  return `${lines.join("\n").trimEnd()}\n`;
}

async function tryServeRobots(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (url.pathname !== "/robots.txt") return undefined;

  return new Response(buildRobotsTxt(isProductionHost(requestHostname(request))), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

// Phase 4.3A — for any non-production host, force every HTML response's
// robots directive to noindex,nofollow at server-render time, regardless of
// what the page's own per-route SEO/readiness logic computed. This is a
// downstream override, not a replacement: production-host requests are
// returned completely untouched, so the existing readiness logic (search-
// ready vs not-ready portfolios/services) keeps deciding index/noindex
// exactly as before — see src/routes/portfolio.$slug.tsx and
// portfolio.$slug_.services.$serviceSlug.tsx. Route-level `head()` callbacks
// have no access to the incoming Request's hostname in this framework
// version, so this can only be done centrally, here, where the real
// Request is available — never via client-side JS (the directive must be
// present in the initial HTML for a crawler that doesn't execute scripts).
const ROBOTS_META_RE = /(<meta[^>]*name=["']robots["'][^>]*content=["'])([^"']*)(["'][^>]*\/?>)/i;
const STAGING_ROBOTS_CONTENT = "noindex, nofollow";

async function applyHostAwareRobotsOverride(
  request: Request,
  response: Response,
): Promise<Response> {
  const hostname = requestHostname(request);
  if (isProductionHost(hostname)) return response;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const patched = ROBOTS_META_RE.test(html)
    ? html.replace(ROBOTS_META_RE, `$1${STAGING_ROBOTS_CONTENT}$3`)
    : html.replace(
        /<head(\s[^>]*)?>/i,
        `<head$1><meta name="robots" content="${STAGING_ROBOTS_CONTENT}" />`,
      );

  return new Response(patched, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

// /sitemap.xml is served directly here, before the request ever reaches the
// TanStack Router — see src/lib/sitemap-xml.ts for why a normal file route
// doesn't work in the installed framework version. This intercept must stay
// narrowly scoped to exactly this one path so every other route keeps going
// through the normal SSR handler unchanged.
async function tryServeSitemap(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (url.pathname !== "/sitemap.xml") return undefined;

  const { listSitemapPortfolios } = await import("./data/portfolio-query.server");
  const { listSitemapServicePages } = await import("./data/service-page-query.server");
  const [portfolios, servicePages] = await Promise.all([
    listSitemapPortfolios(),
    listSitemapServicePages(),
  ]);

  const xml = buildSitemapXml([
    { loc: absoluteUrl("/") },
    ...portfolios.map((p) => ({
      loc: absoluteUrl(`/portfolio/${p.slug}`),
      lastmod: p.updatedAt.slice(0, 10),
    })),
    // Only eligible (indexable) service landing pages — see
    // evaluateServiceIndexability() in src/lib/seo-helpers.ts, the exact
    // same rule the pages themselves use for their own robots directive.
    // Phase 3F.4 §16.
    ...servicePages.map((s) => ({
      loc: absoluteUrl(`/portfolio/${s.profileSlug}/services/${s.serviceSlug}`),
      lastmod: s.updatedAt.slice(0, 10),
    })),
  ]);

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // Short, revalidatable cache — see
      // docs/BEAUTYFOLIO-PHASE3F2A-SEO-INFRASTRUCTURE.md §12. A newly
      // published portfolio appears within this window rather than
      // instantly, an acceptable MVP trade-off against querying the
      // database on every single crawler hit.
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const robotsResponse = await tryServeRobots(request);
      if (robotsResponse) return robotsResponse;

      const sitemapResponse = await tryServeSitemap(request);
      if (sitemapResponse) return sitemapResponse;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      return await applyHostAwareRobotsOverride(request, normalized);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
