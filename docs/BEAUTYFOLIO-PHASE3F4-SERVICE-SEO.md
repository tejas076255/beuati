# BeautyFolio — Phase 3F.4: Local SEO Landing Architecture + Scalable Service URL Strategy

Local development only. No hosting, deployment, Search Console, GBP, AI content, or landing-page-directory work.

## 1. Existing service architecture discovered

- `services.slug` **already existed** (TEXT, nullable) but had zero write path anywhere in the app — every real service's slug was `NULL` — and no format/uniqueness constraint at the DB level.
- `services.category` uses a distinct, curated free-text vocabulary ("Bridal Makeup", "Hair Services", etc.) that does **not** match `portfolio_items.category`'s short gallery-taxonomy vocabulary ("bridal", "hair", etc.) — confirming no safe deterministic category-based relationship between services and gallery items.
- Two **genuine, unpopulated FK relationships** were found: `portfolio_items.service_id` and `before_after_items.service_id` both reference `services.id` for real — but neither has ever been written to by any dashboard flow. `package_services` (a junction table linking packages to services) exists in the schema and is likewise never read or written anywhere in the app.
- `reviews.service_name` is a free-text field, not a foreign key — not a reliable per-review service relationship.
- The existing sitemap (`listSitemapPortfolios`), canonical helper (`absoluteUrl`), and JSON-LD `@id` strategy (`#business`/`#person`, Phase 3F.3) were all directly reusable without modification.

**Conclusion: a stable SEO service URL was not possible without a schema change** (a slug write path plus a uniqueness guarantee) — documented and implemented per §3 below, in line with "if genuinely required, document clearly before implementing."

## 2. URL architecture decision

`/portfolio/{profileSlug}/services/{serviceSlug}` — implemented exactly as specified, keeping SEO authority under the professional's own portfolio. Primary city is **not** baked into the URL (a professional's city can change); city appears in title, meta description, H1, and structured data only.

## 3. Service slug strategy

- `supabase/migrations/20260823180000_service_slugs.sql` (new) adds a format `CHECK` (mirroring the existing `beautician_profiles.slug` pattern) and a **per-profile** unique index (`(beautician_profile_id, slug) WHERE slug IS NOT NULL`) — not global, since the same slug string may legitimately recur across different professionals.
- `createService()` now generates a real slug from the service name at creation time, with a retry-on-conflict loop (same pattern as `ensureOwnPortfolio()` for profile slugs) — never a database UUID.
- `updateService()` **never regenerates an existing slug**, even when the name changes (stable, never-silently-broken URLs) — it only backfills a slug once, for a legacy row that still has `NULL`.
- `resolveServiceSlug(service)` (`slug ?? slugify(name)`) is a computed-fallback used everywhere a slug is needed (routing, sitemap, dashboard), so every service already works as a URL today even before its owner next saves it via the dashboard — the moment they do, a real slug is persisted and never changes again.
- Slug-history redirects are explicitly **flagged as a future requirement**, not built this phase.

**⚠️ Manual action needed from you**: I could not apply the migration to your live Supabase project myself — this environment has no Supabase access token (`supabase login` was not available). The migration file is written and ready; please apply it via the Supabase CLI or dashboard SQL editor. Until applied, slugs still work correctly (via the computed fallback and the write-path's graceful degradation), just without the database-level uniqueness guarantee.

## 4. Database changes

One migration (above) — additive only, touches no existing row's data, defaults to `NULL` exactly as before.

## 5. Files changed

New: `supabase/migrations/20260823180000_service_slugs.sql`, `src/data/service-page-query.server.ts`, `src/routes/portfolio.$slug_.services.$serviceSlug.tsx`.
Modified: `src/lib/seo-helpers.ts` (new pure helpers — see §6/§8/§9), `src/data/dashboard/services.server.ts` (slug write path), `src/data/portfolio-mapper.ts` / `src/data/portfolio.ts` (service `slug` field for internal links), `src/data/portfolio-query.server.ts` (exported `createReadOnlyClient`), `src/server.ts` (sitemap extension), `src/components/portfolio/portfolio-sections.tsx` (clickable service cards), `src/data/dashboard/seo.server.ts` + `src/routes/dashboard.seo.tsx` (Service Search Pages list), `src/routes/dashboard.services.tsx` (one-line description helper text).

## 6. Indexability eligibility rules

`evaluateServiceIndexability()` in `seo-helpers.ts` — deterministic, no arbitrary score:

```
noindex unless ALL of:
  - profile's portfolio_seo.robots_index !== false
  - primary city is set
  - service description (short_description ?? description) is at least 40 characters
```

Reused identically by the public route's own `<head>`, the sitemap generator, and the `/dashboard/seo` eligibility list — the three can never disagree. A `noindex` page still renders normally for a direct visitor; only an unpublished profile or an inactive/deleted service is a genuine 404 (see the route's `getPublishedServicePage()`).

## 7. Service page content architecture

Breadcrumb → H1 (service + city) → "Provided by {name}" (+ Verified badge) → CTAs (Check availability, WhatsApp) → real service description → real pricing → real service areas → relevant portfolio work (only if `service_id`-linked media exists — currently none, documented in §18) → professional-level trust summary (real aggregate rating) → link to the main FAQ section → back-link card to the portfolio (Work / Reviews / Availability).

## 8. Title/H1/meta rules

- `serviceSearchLabel()`: appends "Artist" only to makeup-related names that don't already end in a role word ("Bridal Makeup" → "Bridal Makeup Artist"; "Hair Styling"/"Nail Extensions" unchanged) — not blindly appended to every service.
- Title: `{label} in {city} | {name}`. H1: `{label} in {city}` (no "| name" suffix — the professional's name stays visible in the "Provided by" line instead, so the H1 doesn't just repeat the portfolio's own H1).
- Meta description: real service label + real name + real city, no unsupported claims ("best"/"top"/"#1").

## 9. Primary-city strategy

Primary city comes only from `beautician_profiles.primary_city`. Service areas (Ahmedabad + Satellite/Bodakdev/etc.) never override or get blended into the title/H1 — verified live: a service area outside the primary city never changes the page's targeted city (Test H equivalent, confirmed by code inspection — `buildServiceH1`/`buildServiceSeoTitle` only ever read `primaryCity`, never `serviceAreas`).

## 10. Service-area strategy

Displayed as a dedicated "Available in {city} and nearby areas" section, listing real configured `service_areas` rows only — never implying coverage that wasn't explicitly configured, and never generating a separate page per area (§4/§27 compliance — see §25 architecture-decision statement below).

## 11. Canonical implementation

Self-referencing absolute canonical via the centralized `absoluteUrl()` helper — live-verified: `https://beautyfolio.in/portfolio/dharti-panchal/services/hd-bridal-makeup`. No domain is hard-coded in the route.

## 12. Breadcrumb implementation

Visible nav and `BreadcrumbList` JSON-LD match exactly: BeautyFolio → Professional (real URL) → Services (**no `item` URL** — there's no real `/services` listing route, so no fake intermediate URL was invented) → Service name (real URL).

## 13. Service structured data

One `@graph`: `WebPage` → `Service` (`provider` references the **same** `#business` @id from the main portfolio, not a new one) → `BeautySalon+LocalBusiness` → `Person` → `BreadcrumbList` → any real `ImageObject`s. `@id`s for Business/Person are derived from the **main portfolio URL**, not the service page's own URL — confirmed live: `#business` = `https://beautyfolio.in/portfolio/dharti-panchal#business`, identical to the main portfolio page's own JSON-LD from Phase 3F.3. No duplicate/competing entity was created.

## 14. Pricing schema handling

Reuses `buildOfferPricing()` from Phase 3F.3 verbatim. Live-verified on two real services: `fixed` (HD Bridal Makeup, ₹18,000) → `Offer.price: 18000`; `starting_from` (Sider makeup, ₹5,000) → `Offer.priceSpecification.minPrice: 5000`, never a fixed price. A `custom_quote` service simply gets no `offers` property at all.

## 15. Internal-link architecture

Every service card on the main portfolio (`ServicesSection`, both the mobile accordion row and the desktop grid card) now links its title to its service page, plus a "View service" button on the desktop card — added without touching the existing "Enquire" CTA or card layout.

## 16. Sitemap changes

`listSitemapServicePages()` (new) — one join query (`services` ⋈ `beautician_profiles` ⋈ `portfolio_seo`), filters to `is_active` services on `published` profiles, then applies the exact same `evaluateServiceIndexability()` used everywhere else. Live-verified: 3 of the profile's services appear in `/sitemap.xml` (the ones with real descriptions); the 2 without a sufficient description are correctly excluded. `lastmod` uses real `services.updated_at`; no fabricated `priority`/`changefreq`.

## 17. SEO dashboard changes

New "Service Search Pages" card on `/dashboard/seo` — one row per active service, "✓ Ready for search" or the specific reasons it isn't yet, worded exactly per the spec ("BeautyFolio can create search-friendly service pages from your published services. Pages with insufficient information are kept out of search engines until they're ready.") — no "Google approved"/"will rank" language, no new analytics.

## 18. Duplicate-content safeguards

- Bio, all reviews, all FAQs, all gallery, all service areas are **not** copied wholesale onto the service page.
- Reviews: only a general professional-level rating summary is shown (no service-specific review filtering, since `reviews.service_name` is unreliable free text, not a real relationship).
- FAQs: never duplicated — the page links to the portfolio's own `#faq` section instead.
- Packages: **not shown at all** on service pages — `package_services` exists in schema but has zero real data (§1), so no relationship could be safely used; packages stay on the main portfolio only.
- Portfolio work: only shown via the real `service_id` FK match (§1) — currently empty for every service on every profile, since no dashboard UI sets `service_id` yet. This is documented as expected, not a bug (§24).

## 19. Thin-page safeguards

Covered by §6's indexability rule — a service with no meaningful description is `noindex, follow`, still viewable, excluded from the sitemap. Live-verified on "Nail Art" (no description) vs. "HD Bridal Makeup" (real description).

## 20. RLS/multi-tenancy verification

`service-page-query.server.ts` reuses the exact same anon/RLS-scoped client (`createReadOnlyClient()`, exported from `portfolio-query.server.ts`) as every other public read in this app — never the service-role key. Every query is scoped by `beautician_profile_id` derived from the looked-up profile row; a request for Profile A's slug can never return Profile B's service, reviews, service areas, or media. Live-verified: an invalid profile/service slug combination returns 404, not another profile's data.

## 21. SSR/performance findings

No client-side fetch is used for any SEO-relevant content — `<title>`, meta, canonical, robots, H1, breadcrumbs, service content, and the full JSON-LD `@graph` are all confirmed present in the raw SSR response (verified via direct `curl`, not browser hydration). The service page query batches its independent lookups via `Promise.all` (services + SEO + service areas + reviews + availability, then a second batch for service-linked media only after the matched service is known) — no N+1 across profiles or media.

## 22. Automated tests

- `tsc --noEmit` — clean
- ESLint — clean
- Production build — succeeds
- 9 routes smoke-tested — all 200 OK (or correct 404 for the two invalid-slug cases)

## 23. Manual tests you should perform

I live-verified Tests A, B, E, F, and the RLS/404 cases directly. These need your dashboard/admin session:
- **Test C**: deactivate a service, confirm its page is no longer publicly reachable.
- **Test G**: turn off "Allow search engines to show my portfolio" in `/dashboard/seo`, confirm all of that profile's service pages go `noindex` and drop out of the sitemap.
- Apply the migration (`supabase/migrations/20260823180000_service_slugs.sql`) — I could not do this myself in this environment.

## 24. Known limitations

- "Relevant portfolio work" will render empty for every current service, since `service_id` linking has no dashboard UI yet — the query and structured data are correctly wired to the real relationship, they just have no data to show until a future phase adds that write path (flagged, not built, per this phase's scope).
- The service-slug uniqueness migration has not been applied to the live database by me (no credentials available in this environment) — see §3.

## 25. Recommended next phase

**Explicit architecture-decision confirmation, as required:**

> **ONE PROFESSIONAL + ONE SERVICE = AT MOST ONE INDEXABLE SERVICE LANDING PAGE.**
> Service areas enrich that one page (displayed as a "serving these areas" list); they do **not** generate additional URLs. No `{service}×{area}` combinatorial page was built or is reachable through this implementation — confirmed by the route architecture itself: there is exactly one route pattern (`/portfolio/{profile}/services/{service}`), with no area segment anywhere in it.

If a future phase is warranted: add a dashboard UI to let a beautician link a gallery/before-after item to a specific service (populating the already-real `service_id` FK), which would make "Relevant portfolio work" start showing real content with zero further code changes to the service page itself.
