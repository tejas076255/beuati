# BeautyFolio — Phase 3F.3: Semantic + Local SEO Authority

Local development only. Establishes one coherent structured-data entity graph per professional; does not build local landing pages, Search Console integration, rank tracking, AI SEO, a blog system, or GBP integration.

## 1. Existing semantic architecture discovered

Before writing code, the current entity graph was audited directly against the schema and the live JSON-LD output:

- `beautician_profiles` already carries real individual **and** business-shaped data in one row: `display_name`/`professional_title`/`bio`/`years_experience`/`profile_image_url` (individual), plus `business_name`/`address`/`working_hours`/social URLs (`instagram_url`, `facebook_url`, `youtube_url`, `website_url`) (business-like). No table separates "person" from "business."
- The public JSON-LD (`portfolio.$slug.tsx`) emitted a flat array of independent objects (`BeautySalon`/`LocalBusiness`, `FAQPage`, `BreadcrumbList`, plus the Phase 3F.2B `ImageObject`/`VideoObject` entries) with **no shared `@id`** — every node was a disconnected island, and `founder`/`creator`/`provider` each re-declared a duplicate inline `Person` object instead of referencing one entity.
- `areaServed` (service areas) and `address` (primary location) were already correctly distinguished — no change needed there (§5/§6 confirmed pre-existing, not new).
- `sameAs` was never populated even though `instagram_url`/`facebook_url`/`youtube_url`/`website_url` exist and are already collected on the Profile page — a real, ready-to-use data source that was simply never read (Phase 3F.2A had already flagged this gap).
- **Critical finding**: `aggregateRating` was built from `beautician_profiles.rating`/`review_count` — static columns with no dashboard UI to edit them and no trigger syncing them from the real `reviews` table. Live-verified: the test profile showed `ratingValue: 4.9, reviewCount: 214` while the actual published `review[]` array (real `reviews` rows) contained only **3** reviews averaging **4.33**. This is a real schema.org/Google Rich Results policy risk — structured review counts must reconcile with the reviews actually shown.
- **Critical finding**: `makesOffer` derived `Offer.price` by regex-stripping non-digits from the already-formatted display string (e.g. `"Custom quote".replace(/[^0-9]/g,"")` → `""`, an Offer with an empty/invalid price; `"From ₹5,000"` → `"5000"`, misrepresenting a starting price as a single fixed price).
- Homepage (`src/routes/index.tsx`) canonical/`og:url`/JSON-LD `url` were present but **relative** (`"/"`), not absolute — the same class of issue Phase 3F.2A fixed on the portfolio page, just missed on the homepage.
- FAQPage and Reviews were already correctly scoped to `is_published` rows only (confirmed via the existing `getPublishedPortfolioBySlug` query filters) — no fix needed.
- Semantic HTML: exactly one `<h1>` (hero, the professional's name) and consistent `<h2>` section headings via the shared `SectionHead` component — confirmed correct, no change made.

## 2. Primary entity decision

**Hybrid model (Person + LocalBusiness), kept as two connected nodes rather than switching to a single new type.** A BeautyFolio profile always carries individual-professional data (bio, years of experience, portrait, professional title) *and* business-like data (studio address, working hours, a service catalog) — collapsing to just `Person` would drop the business-side data (address, hours, offers); collapsing to just a business type would drop the individual identity the "WHO" objective asks for. The existing `["BeautySalon","LocalBusiness"]` type was **kept as-is** — not changed "because it sounds better" — since the seeded/test profile (and the schema in general) already assumes a studio address consistent with a LocalBusiness. A future phase could reconsider `ProfessionalService` for travel-only profiles with no fixed address, but that's a data-driven decision for later, not made here.

## 3. Canonical entity @id strategy

One stable `@id` per entity, derived from the portfolio's own canonical URL:
- Business: `https://beautyfolio.in/portfolio/{slug}#business`
- Person: `https://beautyfolio.in/portfolio/{slug}#person`

`Business.founder` → `{"@id": "#person"}`, `Person.worksFor` → `{"@id": "#business"}`, every `Service.provider` and every `ImageObject`/`VideoObject.creator` references `{"@id": "#person"}` — no entity is duplicated inline anywhere in the graph.

## 4. Files changed

- `src/lib/seo-helpers.ts` — added `buildSameAs()`, `computeAggregateRating()`, `buildOfferPricing()`; added 2 readiness checks (`social_link`, `videos`).
- `src/data/portfolio.ts` — added optional `businessName`/`sameAs` on `BeauticianProfile`; added optional `priceValue`/`priceType`/`currency` on `ServiceItem` and packages; added optional `description` on packages.
- `src/data/portfolio-mapper.ts` — populates the new fields from real `beautician_profiles`/`services`/`packages` columns.
- `src/routes/portfolio.$slug.tsx` — rebuilt the JSON-LD into one `@graph`; fixed `aggregateRating`; fixed `Offer` price semantics; connected media/services to the Person/Business `@id`s.
- `src/routes/index.tsx` — homepage canonical/`og:url`/JSON-LD `url` now absolute via `absoluteUrl()`.
- `src/data/dashboard/seo.server.ts` — wires `secondaryServiceNames`/`serviceAreaNames`/`hasValidSocialLink`/`publishedVideoCount` into the SEO overview.
- `src/routes/dashboard.seo.tsx` — "Related portfolio context" added under Primary Search Target.

## 5. Database changes

**None.** Every field used already existed (`business_name`, `instagram_url`, `facebook_url`, `youtube_url`, `website_url`, `services.price`/`price_type`/`currency`, `packages.price`/`price_type`/`currency`).

## 6. Service semantic implementation

Published services are represented as `Service` entities nested in `Offer.itemOffered`, with `provider: {"@id": businessId}`. Price semantics now match the real `price_type`:
- `fixed` → `Offer.price` + `priceCurrency`.
- `starting_from` → `Offer.priceSpecification.minPrice` (never asserted as a single fixed price).
- `custom_quote` → **no Offer emitted at all** for that service — visible page content is unchanged, only the fabricated/empty structured-data price is removed.

## 7. Packages implementation (decision documented per §8)

Packages reuse the exact same `Service`+conditional-`Offer` builder as services, rather than a dedicated `OfferCatalog`. A package has the identical real shape (`name`/`description`/`price`/`price_type`/`currency`) as a service — introducing a second schema type for it would add complexity with no new data to justify it. Both lists merge into one `makesOffer` array on the business entity.

## 8. Review/AggregateRating audit — critical fix

`aggregateRating` is now computed live from the real, published `reviews` rows via `computeAggregateRating()` (average rounded to 1 decimal, count = `reviews.length`), and is **omitted entirely** when there are no reviews yet rather than emitting a 0/0 value. Live-verified before/after on the test profile:

| | Before this phase | After this phase |
|---|---|---|
| `aggregateRating` | `{ratingValue: 4.9, reviewCount: 214}` (static column, unrelated to real reviews) | `{ratingValue: 4.7, reviewCount: 3}` (matches the 3 real published reviews, avg of [4,5,5]) |

The visible marketing copy on the public page (hero trust bar, "600+ clients" etc.) was **not changed** — only the structured-data claim, which search engines can validate against the visible `review[]` array, was corrected. See §15 for the flagged-not-fixed product recommendation.

## 9. FAQ audit

Confirmed already correct: `getPublishedPortfolioBySlug()` filters FAQs to `is_published: true` before they ever reach the mapper or the JSON-LD, so hidden FAQs were never exposed and no duplicate `FAQPage` block existed. No code change was needed; the graph now simply omits the `FAQPage` node entirely when a profile has zero published FAQs (previously it would emit `FAQPage` with an empty `mainEntity` array).

## 10. ImageObject/VideoObject relationship changes

`creator` on every `ImageObject`/`VideoObject` now references `{"@id": personId}` instead of a duplicate inline `{"@type":"Person","name":...}` object. No inference of a service/category relationship was added — the spec explicitly warned against inferring a service link merely because image text mentions a keyword, so none was added.

## 11. sameAs implementation

`buildSameAs()` validates each of `instagram_url`/`facebook_url`/`youtube_url`/`website_url` as a real `http(s)://` URL and returns only the ones that pass; invalid/blank fields are dropped silently. Populated on the `Person` node. The test profile currently has none of these fields filled in, so `sameAs` is correctly omitted from its output — verified live, not fabricated.

## 12. Opening-hours integration

Unchanged from Phase 3F.2A — still sourced from `availability_settings.working_hours`, still omitted when no day is configured. Now lives on the `#business` node inside the `@graph` instead of a bare top-level object.

## 13. Primary search-focus logic

Unchanged — `resolvePrimaryService()` (Phase 3F.1) remains the single deterministic rule (featured active service → first active service by sort order → null), used identically by the dashboard SEO page and the public page's default-title generator. No second, independently-guessed "primary service" was introduced anywhere.

## 14. SEO readiness changes

Added two checks: **"Valid social link added"** (recommended) and **"Video content present"** (enhancement) — both deterministic booleans from real data, weighted identically to the existing checklist (critical=3, recommended=2, enhancement=1). No existing check's weight or wording was changed, and the score is still explicitly framed as "SEO Readiness," never a ranking prediction.

## 15. Trust-metric audit findings

| Metric | Classification | Action |
|---|---|---|
| `beautician_profiles.rating` / `review_count` | **Not reconciled with real review data** — no dashboard field, no admin field, no sync trigger found; likely seeded once and never revisited | Removed from structured data (§8 fix); **flagged for product cleanup** — recommend either wiring a trigger to keep these in sync with real `reviews` rows, or removing the columns/hero display if they're meant to be purely aspirational |
| `beautician_profiles.client_count` | Same status as above — read-only everywhere in the app, no write path found | Was never in structured data to begin with (not part of any JSON-LD node) — no change needed, but same product-cleanup flag applies to its public hero display ("600+ clients") |
| `years_experience` | **Database-backed, user-entered** on the Profile form | Legitimate; not touched |
| Reviews (`client_name`, `rating`, `review_text`, `review_date`) | **Database-backed**, real rows | Used as-is (unchanged) |
| Services/packages `price`/`price_type` | **Database-backed**, user-entered | Used as-is with corrected Offer semantics (§6/§7) |

No visible marketing copy on the public page was silently overwritten — this section only flags the discrepancy and fixes what actually reached structured data.

## 16. Semantic HTML findings

Audited `portfolio-sections.tsx`: exactly one `<h1>` (the hero, the professional's name), consistent `<h2>` section headings via the shared `SectionHead` component used by About/Services/Packages/Reviews/FAQ/etc., and reasonable `<h3>` usage for card-level titles (trust bar labels, package names). **No change made** — the existing hierarchy was already correct.

## 17. Final JSON-LD graph

One `<script type="application/ld+json">` containing `{"@context": "https://schema.org", "@graph": [...]}`. Live-verified node list on `/portfolio/dharti-panchal`:

```
BeautySalon+LocalBusiness  #business
Person                     #person
FAQPage
BreadcrumbList
ImageObject × 5
VideoObject × 3
```

`#business.founder` → `{"@id":"#person"}`; `#person.worksFor` → `{"@id":"#business"}`; every `ImageObject`/`VideoObject.creator` → `{"@id":"#person"}`; every `Offer.itemOffered.provider` → `{"@id":"#business"}`.

## 18. Performance/query behaviour

No new query was added. Every field used in the graph (`business_name`, social URLs, `services.price_type`, `packages.price_type`) was already fetched by the existing single-batch `Promise.all()` in `getPublishedPortfolioBySlug()` — the JSON-LD build remains a pure, synchronous transform of already-loaded data, same as before this phase. No N+1 was introduced.

## 19. RLS/multi-tenancy verification

No new query, no new write path — every field this phase reads was already RLS-scoped exactly as documented in prior phases (`owns_beautician_profile()` for dashboard writes, `is_published`/`status='published'` filters for public reads). `sameAs`, `business_name`, and every other newly-surfaced field are columns on the same already-profile-scoped `beautician_profiles` row; no cross-profile leakage path was introduced.

## 20. Homepage canonical fix

`src/routes/index.tsx`: canonical `<link>`, `og:url`, and the `Organization` JSON-LD `url` now use `absoluteUrl("/")` instead of the literal relative string `"/"`. Live-verified: both now render as `https://beautyfolio.in/`. No other homepage metadata was touched.

## 21. Automated tests

- `tsc --noEmit` — clean
- ESLint (all changed files) — clean
- `npm run build` — succeeds

## 22. Manual tests you should perform

I verified the JSON-LD output directly against the raw SSR response (not just component code), so the following are already confirmed working on the live dev server for `dharti-panchal`:
- `@graph` structure, `@id` cross-references, fixed `aggregateRating` (4.7/3, matching real reviews), correct Offer price semantics (fixed vs. starting-from vs. omitted), media `creator` references, homepage absolute canonical.

Still worth you checking directly:
1. Add/verify an Instagram or website URL on your Profile page, then confirm `sameAs` appears on the `Person` node.
2. Add a service with "Contact for quote" pricing and confirm it does **not** appear in `makesOffer` (by design), while still showing normally on the public Services section.
3. Review the "Related portfolio context" chips on `/dashboard/seo` for accuracy.

## 23. Known limitations

- `client_count`/`rating`/`review_count` on `beautician_profiles` remain unaddressed at the product level (still shown in the public hero as marketing copy) — flagged in §15, not fixed, per the "don't silently overwrite user content" instruction.
- `sameAs`/`businessName` have no dedicated dashboard editor beyond the existing Profile page fields (which already existed pre-phase) — no new UI was added or was needed.
- The Person `@id` node currently omits `telephone`/`email` (kept only on the Business node) to avoid duplicating already-public contact info across two entities — a deliberate simplification, reconsider only if a future audit shows search engines specifically expect contact fields on the Person node.

## 24. Recommended next SEO phase

Address the `rating`/`review_count`/`client_count` trust-metric gap identified in §15/§20 at the product level (either a real-time sync trigger from `reviews`, or removing the unverified marketing figures from the public hero) — this is a data-integrity fix, not a new SEO feature, and was explicitly out of scope for structured-data-only work in this phase.
