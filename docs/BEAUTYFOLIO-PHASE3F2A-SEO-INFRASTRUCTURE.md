# BeautyFolio — Phase 3F.2A: Production SEO Infrastructure

Focused technical-SEO phase following the Phase 3F.1 architecture audit. Implements the authoritative production site URL, absolute canonical/social/structured-data URLs, a dynamic sitemap, the robots.txt sitemap declaration, and real availability-derived opening hours. No media SEO, no cover/hero changes, no schema changes.

## 1. Existing production URL architecture discovered

No `SITE_URL`/domain concept existed anywhere before this phase. The established env-var convention in this codebase (`src/integrations/supabase/client.ts`) is: a `VITE_`-prefixed variable for Vite's build-time client replacement (works in both browser and SSR bundles, since Vite statically inlines `import.meta.env.*` everywhere it appears), with a plain-named `process.env` variable as a server-only fallback for parity with the other server-only secrets (`SUPABASE_URL`, etc). This phase's `SITE_URL` handling follows that exact same pattern.

## 2. SITE_URL implementation

`src/lib/site-url.ts` — the one centralized module:
- `getSiteUrl()` — returns the configured origin (e.g. `https://beautyfolio.in`), or `""` if unset.
- `absoluteUrl(path)` — resolves a relative path to an absolute URL using the configured origin; passes already-absolute URLs through unchanged; **falls back to the relative path unchanged when no origin is configured** — it never fabricates a domain and never falls back to `localhost` or `window.location`.
- `hasSiteUrl()` — boolean check for callers (like the sitemap) that need to know whether absolute output is actually possible.

**Development behavior**: `.env`'s `VITE_SITE_URL` is now set to `https://beautyfolio.in` (the real production domain), so local dev SSR output already produces fully correct absolute canonical/OG/JSON-LD URLs — this is intentional and correct: a canonical URL identifies the one true public address of the content, independent of which server you're currently browsing it from, so pointing to production from a local dev session is the right behavior, not a bug.

**Production behavior**: identical code path — reads the same env var. Requires the hosting platform to have it configured (see §3).

**Missing-env behavior**: every helper degrades to relative-path output (the same behavior this app had before this phase) rather than claiming any domain. A sitemap with no site URL configured would emit relative `<loc>` values, which are technically invalid per the sitemap protocol (search engines require absolute URLs) — this is a known, accepted edge case rather than a masked failure, since the alternative (fabricating a domain) is worse.

## 3. Environment variable required

| | |
|---|---|
| **Variable name** | `VITE_SITE_URL` |
| **Value** | `https://beautyfolio.in` |
| **Where configured (local)** | Already set in `.env` at the project root (this file is tracked in this repo's git history, consistent with how `VITE_SUPABASE_URL` etc. are already committed there) |
| **Where it must ALSO be configured** | Your hosting/deployment platform's environment variable panel (Hostinger, Vercel, Cloudflare, or wherever the production build actually runs) — **I cannot access or configure that panel myself**, so this is a manual action for you. Local `.env` is not guaranteed to be read by every deployment pipeline. |

I did not and cannot claim this was configured in your actual hosting environment — only that the application code is ready to use it the moment it's set there.

## 4. Files changed

- `src/lib/site-url.ts` **(new)** — centralized origin resolver.
- `src/lib/sitemap-xml.ts` **(new)** — pure XML builder, no framework/DB dependency.
- `src/lib/seo-helpers.ts` — added `buildOpeningHoursSpecification()`.
- `src/data/portfolio-query.server.ts` — added `listSitemapPortfolios()` (one query, RLS-scoped anon client).
- `src/server.ts` — intercepts `/sitemap.xml` before the TanStack Router (see §8 for why).
- `src/routes/portfolio.$slug.tsx` — uses the shared `absoluteUrl()`; added `@id`; wired real opening hours; threads `working_hours` through the loader.
- `src/routes/dashboard.seo.tsx` — replaced a hardcoded `"beautyfolio.in"` string with `absoluteUrl()`.
- `public/robots.txt` — added `Sitemap:` directive.
- `.env` — added `VITE_SITE_URL="https://beautyfolio.in"`.
- `docs/BEAUTYFOLIO-PHASE3F2A-SEO-INFRASTRUCTURE.md` **(new, this file)**.

## 5. Database changes

**None.**

## 6. Canonical rules

`https://beautyfolio.in/portfolio/{slug}` — no trailing slash, no query parameters ever appended. An explicit `portfolio_seo.canonical_url` override, if set, always wins over the computed default.

**Audited risks**:
- **Trailing slash**: never produced; `absoluteUrl()` normalizes the configured origin (strips trailing slashes) and paths are always built with a single leading slash.
- **Query parameters**: the portfolio route has none today; nothing strips or canonicalizes them because nothing generates them.
- **Alternate URLs**: none exist (no `www.`/non-`www.` duplicate, no HTTP variant configured).
- **Slug generation/changes**: slugs are set once via the existing Profile flow; there is no slug-history/redirect table. **Risk**: if a beautician changes their slug, the old URL 404s with no redirect — pre-existing behavior, not introduced or fixed this phase. Flagged, not built (explicitly out of scope: "do not build redirects or slug-history infrastructure unless already supported").
- **Unpublished portfolios**: canonical is still computed (harmless — the page itself 404s per existing `getPublishedPortfolioBySlug` behavior, so the canonical tag is moot since there's no page to have it on).
- **Indexing-disabled portfolios** (`robots_index = false`): canonical is still emitted (correct — canonical and indexing are separate concerns; a noindex page can still declare its canonical).

## 7. Absolute URL verification

| Field | Status |
|---|---|
| canonical | ✅ Absolute (verified live: `https://beautyfolio.in/portfolio/dharti-panchal`) |
| og:url | ✅ Absolute (verified live) |
| og:image | ✅ Absolute (either the real Supabase storage URL when set, or the profile photo fallback resolved through `absoluteUrl()`) |
| Twitter image | N/A — no separate Twitter image field exists; `twitter:card` uses `summary_large_image` which reads `og:image` |
| JSON-LD `@id` | ✅ Added this phase, absolute |
| JSON-LD `url` | ✅ Absolute |
| BreadcrumbList URLs | ✅ All three entries (home, `/portfolio`, the profile) now absolute |
| Sitemap URLs | ✅ Absolute (verified live) |

Internal navigation links (nav menu anchors, `tel:`/`wa.me:` links, dashboard links) were **not** touched — those are correctly relative/internal and out of scope for this SEO-metadata-only step.

## 8. Sitemap implementation

**Not** a TanStack Router file route in the end. A route at `src/routes/sitemap[.]xml.tsx` was tried first (using the `[.]`-escape file-naming convention this router version confirmed supports, verified via the generated `routeTree.gen.ts`), with its `loader` throwing a `Response` — the pattern documented for this framework family. **This failed at request time** with a `seroval` serialization error: the router's loader-result serialization path (which prepares `loaderData` for client hydration) attempted to serialize the thrown `Response` object itself before the top-level fetch handler got a chance to treat it as a raw HTTP short-circuit, and a `Response` (bodies, streams) isn't seroval-serializable. No `createServerFileRoute`/`createAPIFileRoute` export exists in the installed `@tanstack/react-start` version to define a proper non-page API route instead (checked directly against the package's exports map).

**Actual implementation**: `/sitemap.xml` is intercepted in `src/server.ts` — the project's existing custom SSR entry point (already configured via `vite.config.ts`'s `tanstackStart.server.entry: "server"`) — before the request reaches the TanStack Router at all. This is the same file that already wraps the framework's handler for error normalization, so adding one narrowly-scoped path check here is consistent with the existing architecture rather than a new mechanism. Verified working end-to-end (see §17).

## 9. Sitemap inclusion/exclusion rules

Included:
- Homepage (`/`) — always.
- Portfolios where **all** of: `beautician_profiles.status = 'published'`, a non-empty `slug` exists, and `portfolio_seo.robots_index` is not explicitly `false` (i.e. `true` or no `portfolio_seo` row at all — the column defaults to `true`).

Excluded (by construction, not a separate blocklist): dashboard/admin/auth routes (never queried for), draft/unpublished/suspended profiles (`status != 'published'` filter), any profile with `robots_index = false`, any row with a null/empty slug.

**lastmod**: uses `beautician_profiles.updated_at` (trigger-maintained, confirmed via `trg_bp_updated`). This reflects changes to the **profile row itself** — not gallery, review, service, or FAQ edits, which live in separate tables with their own `updated_at` columns not aggregated here. This is a real, honest, non-fabricated timestamp, just a partial signal — documented rather than either omitted or replaced with an expensive cross-table `MAX()`.

**Sitemap scale**: at current/foreseeable BeautyFolio scale (a beauty-portfolio SaaS, not a marketplace with millions of listings), a single flat sitemap is correct. The sitemap protocol's hard limit is 50,000 URLs / 50MB uncompressed per file — recommend moving to a sitemap index (multiple child sitemaps) well before that, at roughly **10,000–20,000 published portfolios**, to keep generation time and payload size comfortable. Not built now — no genuine technical need yet.

## 10. robots.txt implementation

Preserved every existing directive (Googlebot/Bingbot/Twitterbot/facebookexternalhit/`*` all `Allow: /`) — nothing blocks `/`, portfolio pages, or public assets. Added exactly one line: `Sitemap: https://beautyfolio.in/sitemap.xml`.

**Distinction explained (per instruction)**: robots.txt controls *crawling* (can a bot fetch a URL at all) at a site-wide level; it is **not** used and must never be used for per-portfolio noindex. Individual portfolio indexing is controlled entirely through the `<meta name="robots">` tag driven by `portfolio_seo.robots_index`, generated per-page in `buildHead()` — this was already correct before this phase and is unchanged.

## 11. Availability/opening-hours decision

**CASE A applies** — proper structured hours exist. Inspected `availability_settings.working_hours`: a genuinely structured JSONB array of `{day, available, start, end}` (one entry per weekday), authored by the beautician on the Availability dashboard page under the label "Turn on the days you work and set your usual hours." This is authored **business availability data** (which days/hours they generally work), not a booking-slot/calendar system — `accepting_bookings` and the blocked-dates table are the separate concepts that represent booking-specific state, and neither was used here.

`buildOpeningHoursSpecification()` (in `src/lib/seo-helpers.ts`) converts only entries where `available === true` and both `start`/`end` are validly-shaped time strings into `OpeningHoursSpecification` objects using the standard `https://schema.org/{Day}` URI form for `dayOfWeek`. Returns `[]` (never a fabricated placeholder) when the shape doesn't match or the beautician hasn't configured any days — callers omit the property entirely in that case (verified: the JSON-LD only includes `openingHoursSpecification` when the array is non-empty).

**Verified live** on the real Dharti Panchal test profile: 6 real days (Monday–Saturday, 10:00–19:00), Sunday correctly absent (marked unavailable in her real settings) — not a template, not a guess.

## 12. JSON-LD changes

- Added `@id` (absolute portfolio URL) to the `BeautySalon`/`LocalBusiness` block.
- `url` now absolute (was relative).
- Added `openingHoursSpecification` from real data (§11) — only when non-empty.
- `priceRange` remains removed (Phase 3F.1 finding, not reintroduced).
- `sameAs` (social profile links) was **audited but not added**: `beautician_profiles.facebook_url`/`instagram_url`/`youtube_url`/`website_url` exist in the database but are **not currently mapped through** the public-facing `BeauticianProfile` client type at all (confirmed via `portfolio-mapper.ts`) — wiring that through would be a mapper/type change outside this URL-infrastructure-scoped phase. Documented as a gap, not fabricated, not built.
- Every other field (`name`, `description`, `telephone`, `email`, `address`, `areaServed`, `founder`, `aggregateRating`, `review[]`, `makesOffer[]`, `FAQPage`, `BreadcrumbList`) was re-validated against real stored data and left as-is — all already correctly sourced, none fabricated.

## 13. Homepage SEO findings

The homepage (`src/routes/index.tsx`) was audited, not modified (per instruction: "do not redesign homepage SEO content"). It **already has** a `head()` with title/description/OG/Twitter meta, but **has no explicit `<link rel="canonical">` tag**. Since `absoluteUrl("/")` is now available from the shared helper, this is a one-line, low-risk fix — flagged here rather than made, since the instruction was to audit and report architectural problems, not to expand homepage metadata. The homepage **is** included in the sitemap (§9) and is indexable (nothing blocks it in robots.txt or via meta robots).

## 14. RLS/security approach

`listSitemapPortfolios()` uses the exact same anon/publishable-key client (`createReadOnlyClient()`) as every other public portfolio read in `portfolio-query.server.ts` — **no service-role key, no RLS bypass, no new client type introduced**. The existing RLS policies (`bp_public_read_published` on `beautician_profiles`, `seo_public_read` on `portfolio_seo`) already restrict this client to published-profile rows only; the explicit `.eq("status", "published")` filter in the query is kept anyway so the query is self-documenting and correct even if someone later loosens RLS, rather than silently depending on RLS alone. This function is called only from server-only code (`portfolio-query.server.ts` is dynamically imported inside `src/server.ts`'s request handler and inside the (now-removed) route loader) — it is never reachable from the client bundle.

## 15. Sitemap query/performance approach

**One query**, with `portfolio_seo` embedded via PostgREST's relationship syntax (`select("slug, updated_at, portfolio_seo(robots_index)")`) rather than a second round trip. No Gallery, Reviews, Services, or any other content table is queried — confirmed by reading the function: it touches exactly `beautician_profiles` (with the embedded `portfolio_seo` join), nothing else. This scales linearly with the number of published profiles, not with their content volume.

## 16. Cache/revalidation strategy

`/sitemap.xml` is served with `Cache-Control: public, max-age=0, s-maxage=3600, stale-while-revalidate=86400` — browsers always revalidate, but a CDN/edge cache (Cloudflare, matching this project's existing Nitro `cloudflare` build target) can serve a cached copy for up to an hour before regenerating, with a further day of stale-while-revalidate grace. This means a newly published portfolio appears in the sitemap **within roughly an hour** in the worst case, not instantly — an accepted, documented MVP trade-off rather than querying the database on every single crawler hit. `/robots.txt` is a static file (unchanged mechanism) served with whatever default static-asset caching Nitro/Cloudflare already applies — not modified this phase.

## 17. Automated tests performed

- `tsc --noEmit` — clean.
- ESLint — clean.
- Production build — succeeds.
- Live dev-server verification (not just HTTP-200 checks): fetched `/sitemap.xml` and confirmed absolute URLs + real `lastmod` dates for both currently-published test profiles; fetched `/robots.txt` and confirmed the `Sitemap:` line; fetched the Dharti Panchal portfolio page and confirmed `canonical`, `og:url`, `og:image`, JSON-LD `@id`, and `openingHoursSpecification` are all correct and absolute in the raw HTML response.

## 18. Regression results

All 16 smoke-tested paths return 200: `/`, `/sitemap.xml`, `/robots.txt`, `/dashboard/seo`, `/dashboard/leads`, `/dashboard/profile`, `/dashboard/gallery`, `/dashboard/before-after`, `/dashboard/videos`, `/dashboard/services`, `/dashboard/packages`, `/dashboard/faqs`, `/dashboard/reviews`, `/dashboard/availability`, `/dashboard/areas`, `/portfolio/dharti-panchal`. No other module's code was touched.

## 19. Manual actions required from you

1. **Set `VITE_SITE_URL=https://beautyfolio.in`** in your actual hosting/deployment platform's environment variable settings (Hostinger/Vercel/Cloudflare/wherever the production build runs) — I cannot access that panel. It's already set in the repo's `.env` for local/dev use.
2. Decide whether to add a canonical tag to the homepage (§13) — flagged, not built.
3. Decide whether/when to wire `sameAs` social links through the mapper (§12) — flagged, not built.

## 20. Manual browser verification checklist

1. Visit `/sitemap.xml` directly — confirm it's valid XML listing the homepage and only published, indexing-enabled portfolios.
2. Visit `/robots.txt` — confirm the `Sitemap:` line is present and correct.
3. View-source on a published portfolio page — search for `rel="canonical"` and confirm it's a full `https://beautyfolio.in/...` URL.
4. Search the same page source for `application/ld+json` — confirm `"@id"` and `"url"` are both absolute.
5. On the SEO dashboard (`/dashboard/seo`), toggle indexing OFF for a test profile, then re-check `/sitemap.xml` — confirm that profile disappears from it.
6. Re-check the same profile's page source — confirm `<meta name="robots" content="noindex...">` now appears.
7. Toggle indexing back ON, confirm the profile reappears in the sitemap (allow up to the cache window in §16 in production; instant in local dev, which has no CDN cache in front of it).

## 21. Known limitations

- Sitemap freshness in production is bounded by the 1-hour edge cache (§16), not instant.
- No slug-history/redirect mechanism — a slug change 404s the old URL (pre-existing, not introduced or fixed here).
- Homepage has no explicit canonical tag yet (§13).
- `sameAs` social links are not yet in the JSON-LD graph because the underlying profile fields aren't mapped through to the public client type yet (§12).
- `lastmod` reflects only profile-row edits, not content-table edits (§9) — documented, not fabricated as a workaround.
- Local dev now always renders production (`beautyfolio.in`) URLs in metadata by design (§2) — this is intentional but worth knowing if you're ever confused why a local screenshot shows the production domain.

## 22. Recommended Phase 3F.2B scope

Per the original Phase 3F.1 recommendation, still valid: Gallery/Before-After alt-text + caption input UI (closing the dead-column gap), followed by `ImageObject`/`VideoObject` structured data once that gap is closed.
