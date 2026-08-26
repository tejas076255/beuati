// Pure XML builder for /sitemap.xml — no framework or DB dependency, so it's
// safe to import from the raw SSR server entry (src/server.ts), which serves
// this route directly rather than through a TanStack Router file route. See
// docs/BEAUTYFOLIO-PHASE3F2A-SEO-INFRASTRUCTURE.md §8 for why: throwing a
// Response from a route `loader` in the installed @tanstack/react-start
// version fails at request time with a seroval serialization error (the
// router tries to serialize the thrown Response for the client bundle
// before the top-level fetch handler can treat it as a raw HTTP response),
// and no createServerFileRoute/createAPIFileRoute export exists in this
// version to define a proper non-page API route. Intercepting the request
// in the custom server.ts entry — which already wraps the framework's
// fetch handler for error normalization — sidesteps the router entirely for
// this one path.

export interface SitemapUrlEntry {
  loc: string;
  lastmod?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** changefreq/priority are deliberately never emitted — neither this
 * function nor the underlying data has a trustworthy basis for either
 * value, and inventing one would violate the "never fabricate SEO data"
 * rule carried over from Phase 3F.1. lastmod is included only when the
 * caller supplies one from a real timestamp. */
export function buildSitemapXml(entries: SitemapUrlEntry[]): string {
  const urlBlocks = entries
    .map((entry) => {
      const lastmod = entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : "";
      return `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>${lastmod}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlBlocks}\n</urlset>\n`;
}
