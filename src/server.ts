import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { buildSitemapXml } from "./lib/sitemap-xml";
import { absoluteUrl } from "./lib/site-url";

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
      const sitemapResponse = await tryServeSitemap(request);
      if (sitemapResponse) return sitemapResponse;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
