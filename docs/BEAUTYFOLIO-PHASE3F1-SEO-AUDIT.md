# BeautyFolio — Phase 3F.1: SEO Manager Foundation + Architecture Audit

Architecture-first sub-phase. Audits the existing SEO implementation, defines the ownership model, ships the generation/readiness logic, and rebuilds `/dashboard/seo` as the minimum non-technical foundation. Does **not** build sitemap.xml, expand structured data, or touch media/cover-image modules — those are documented as proposals for 3F.2, per the explicit "return the proposed graph before expanding" instruction.

## 1. Existing SEO architecture discovered

BeautyFolio already had substantially more SEO infrastructure in place than a typical "first SEO pass" — this materially changed the scope of this phase from "build a data model" to "audit, connect, and fix what's there."

| Area | Status | Notes |
|---|---|---|
| `portfolio_seo` table | **WORKING** | Full override table already exists (`seo_title`, `meta_description`, `canonical_url`, `og_title`, `og_description`, `og_image_url`, `primary_keyword`, `robots_index`, `robots_follow`). RLS already correct: owner-all + public read of published profiles only. |
| `/dashboard/seo` page | **PARTIAL** | Existed as a flat form exposing every `portfolio_seo` field with no defaults shown, no readiness feedback, no search preview, no explanation of ON/OFF indexing. |
| Document `<title>` | **WORKING** (now improved) | Generated in `portfolio.$slug.tsx`'s `buildHead()`. Previously an inline ad-hoc template; now calls the shared `buildDefaultSeoTitle()` helper. |
| Meta description | **WORKING** (now improved) | Same file/function; now shared with the dashboard preview via `buildDefaultMetaDescription()`. |
| Canonical URL | **PARTIAL → FIXED** | Was always a **relative** path (`/portfolio/slug`) — canonical tags should be absolute per Google's own guidance. Now resolves through `absoluteUrl()`, which honors a `SITE_URL`/`VITE_SITE_URL` env var if set and falls back to the previous relative behavior (non-breaking) if not. |
| Robots meta (index/follow) | **WORKING** | Correctly wired to `robots_index`/`robots_follow`, only emits the tag when non-default. |
| robots.txt | **WORKING**, missing one line | Static file in `/public`, allow-all for major crawlers. **MISSING**: no `Sitemap:` directive (there's no sitemap yet to point to — see §11). |
| Sitemap.xml | **MISSING** | No sitemap route/generator found anywhere in the codebase. |
| Open Graph tags | **PARTIAL → FIXED** | `og:title`/`og:description`/`og:type`/`og:url` existed; `og:image` only appeared when manually overridden — most shares would have **no preview image**. Now defaults to the profile photo when no override is set. |
| Twitter/social metadata | **WORKING** | `twitter:card`, `twitter:title`, `twitter:description` present. |
| Structured data / JSON-LD | **WORKING, with an UNSAFE issue found and fixed** | A genuinely solid graph already existed: `BeautySalon`/`LocalBusiness` (with `address`, `areaServed`, `founder`, `aggregateRating`, `review[]`, `makesOffer[]`), `FAQPage`, `BreadcrumbList`. **UNSAFE**: `priceRange: "₹₹"` and `openingHours: "Mo-Su 08:00-21:00"` were hardcoded placeholder values not backed by any real stored data — a direct violation of "all structured data must come from real stored data." **Removed** (not replaced with different fabricated values) — see §9 for how to source these for real later. |
| Public portfolio route metadata | **WORKING** | `head()` is wired correctly on the `/portfolio/$slug` route; SSR renders the full `<head>` server-side (confirmed via direct `curl`, no client-only rendering gap). |
| SSR/static rendering | **WORKING** | TanStack Start SSR; verified live output includes fully-rendered title/meta/JSON-LD in the raw HTML response, not injected client-side. |
| Portfolio slug handling | **WORKING** | `beautician_profiles.slug`, unique, used consistently as the route param and in all generated URLs. |
| Image alt text | **DUPLICATED responsibility / mostly DEAD column** | See §11 — full finding there. |
| Heading hierarchy | **WORKING** (not audited line-by-line this phase; no h1/h2 issues surfaced during review of `portfolio-sections.tsx`) | Out of scope to fully re-audit every section this phase; no action taken. |
| Internal linking | **WORKING**, minimal | Portfolio page links out to `tel:`/`wa.me`/social profile URLs; no internal cross-portfolio linking exists (expected — BeautyFolio doesn't have a portfolio directory/browse page yet). |
| Location/service info in metadata | **PARTIAL → IMPROVED** | Already used in the JSON-LD `address`/`areaServed`; the meta title/description previously used ad-hoc inline logic not reused anywhere else. Now centralized. |

## 2. Files changed

- `src/lib/seo-helpers.ts` **(new)** — `resolvePrimaryService()`, `buildDefaultSeoTitle()`, `buildDefaultMetaDescription()`, `buildPrimarySearchTarget()`, `computeSeoReadiness()`, `summarizeSeoReadiness()`, `readinessLabel()`. Pure functions, no I/O — the single source of truth for every generated SEO value.
- `src/data/dashboard/seo.server.ts` — added `getSeoOverview()`, assembling profile/services/service-areas/gallery/before-after/reviews/faqs/seo-overrides into one dashboard-ready object. `getOwnSeo`/`saveOwnSeo` (pre-existing) untouched.
- `src/routes/dashboard.seo.tsx` — rebuilt per the Step 6 layout (Search Visibility, SEO Readiness, Search Preview, Primary Search Target, SEO Title, Meta Description, Indexing, Advanced/canonical+social-image, Recommendations).
- `src/routes/portfolio.$slug.tsx` — `buildHead()` now calls the shared helpers instead of inline duplicated logic; added `absoluteUrl()`/`SITE_URL` handling; added a default `og:image` fallback; removed the two fabricated JSON-LD fields.
- `docs/BEAUTYFOLIO-PHASE3F1-SEO-AUDIT.md` **(new, this file)**.

## 3. Database changes

**None.** The existing `portfolio_seo` table already covers every field the task's suggested model proposed (see §4) — confirmed before writing any code, per the "do not blindly implement this schema, first inspect" instruction.

## 4. SEO ownership model

| Suggested field | Where it actually lives | Action taken |
|---|---|---|
| `seo_title_override` | `portfolio_seo.seo_title` | Reused as-is |
| `meta_description_override` | `portfolio_seo.meta_description` | Reused as-is |
| `index_enabled` | `portfolio_seo.robots_index` | Reused as-is (also has a bonus `robots_follow`, kept) |
| `canonical_override` | `portfolio_seo.canonical_url` | Reused as-is |
| `primary_service_id` | **Not needed** | Derived live from `services.is_featured` (falls back to first active service by `sort_order`) via `resolvePrimaryService()` — no new column, no second source of truth |
| `primary_target_location` | **Not needed** | Derived live from `beautician_profiles.primary_city` |
| `social_title_override` | `portfolio_seo.og_title` | Reused as-is |
| `social_description_override` | `portfolio_seo.og_description` | Reused as-is |
| `social_image` | `portfolio_seo.og_image_url` | Reused as-is, now with a computed fallback when unset |
| `updated_at` | `portfolio_seo.updated_at` | Already present, trigger-maintained |

Every other input to SEO generation (name, professional title, bio, city, locality, services, service areas, reviews, gallery, FAQs) is read live from its existing owning table via the existing owner-scoped `dashboard/*.server.ts` functions — `getSeoOverview()` composes these, it does not duplicate them.

## 5. Automatic metadata rules

Implemented in `src/lib/seo-helpers.ts`, shared by both the dashboard preview and the live `<head>`:

- **Primary service**: featured active service → first active service by sort order → `null`.
- **Default title**: `"{professional title} in {city} | {name}"` — built from the beautician's own authored `professional_title` (e.g. "Bridal Makeup Artist"), not a concatenated service-name guess, so it never has to invent a job-title suffix. Falls back to primary service name, then to just `"{name} | BeautyFolio"` when the profile is still incomplete.
- **Default description**: `"Explore {service} services by {name} in {city}. View portfolio, packages, reviews and availability."` when a primary service is known, else a generic-but-honest fallback naming only what's actually set.
- **Primary Search Target** (dashboard display only, never used to generate pages): `"{primary service} in {city}"`.

All three degrade gracefully — a profile missing a city, service, or title never gets a fabricated placeholder; the sentence just narrows to what's actually known.

## 6. SEO readiness/checklist rules

`computeSeoReadiness()` returns 18 checks, each a plain boolean derived from real data, classified `critical` / `recommended` / `enhancement`:

**Critical**: Portfolio published · Indexing enabled · Professional title present · City present · Primary service identified · Contact information present.
**Recommended**: Bio sufficiently descriptive (≥80 chars) · Locality present · Services published · Service areas configured · Gallery contains published work · Reviews present · Meta title valid (≤60 chars) · Meta description valid (50–160 chars).
**Enhancement**: Gallery images have alt text · Before & After content present · FAQs present · Canonical URL valid.

`summarizeSeoReadiness()` turns this into a 0–100 score (critical checks weighted 3×, recommended 2×, enhancement 1×) and a label (`readinessLabel()`: Excellent / Good foundation / Needs attention / Just getting started). **Explicitly and consistently called "SEO Readiness" everywhere in the UI and code — never "Google Ranking Score."**

## 7. Indexing implementation

Reuses the existing `portfolio_seo.robots_index` column end-to-end — nothing new. The dashboard's "Allow search engines to show my portfolio" switch is the same boolean that already drove the `<meta name="robots" content="noindex">` tag in `buildHead()`; this phase only made the UI explain the ON/OFF distinction clearly and separated it visually from "portfolio published" (Search Visibility card shows both as two separate rows, per the explicit instruction not to confuse the two concepts).

## 8. Search-preview implementation

A plain, clearly-labeled "Search Preview" card in `/dashboard/seo` rendering the *effective* title/description (override if set, else the live default) in a Google-style desktop layout (URL, blue title, gray snippet), with the required disclaimer: "Google may rewrite titles and descriptions depending on the search." Desktop-only, per instruction — no mobile preview variant built this phase.

## 9. Current structured-data implementation

As found (see §1) — `BeautySalon`/`LocalBusiness` + `FAQPage` + `BreadcrumbList`, all in one `<script type="application/ld+json">` array in `portfolio.$slug.tsx`. Fixed this phase: removed the fabricated `priceRange`/`openingHours`; made every `url`/`item` field absolute via `absoluteUrl()`.

**Not fabricated, left as-is because they're real**: `aggregateRating`/`review[]` (from real `reviews` rows), `makesOffer[]` (real `services` rows with real prices), `address` (real profile fields), `founder`/`knowsAbout` (real profile + specializations).

## 10. Proposed structured-data graph (for 3F.2 — not implemented)

Recommend, in priority order:
1. **Fix `openingHours` for real** — `availability_settings.working_hours` (JSONB, already built in the Availability module) can be mapped to schema.org's `OpeningHoursSpecification` array. Currently unused for this purpose.
2. **`ImageObject`** for gallery/before-after images once alt text is genuinely populated (see §11) — improves Google Images eligibility.
3. **`VideoObject`** for the Videos module (title/description already exist there — see §11).
4. Consider **`ProfessionalService`** as an additional/alternate `@type` alongside `BeautySalon` for beauticians who work travel-only with no fixed studio address (current schema assumes a physical location).
5. **Do not** add `Person`-as-primary-entity, `AggregateRating` restructuring, or price-range guessing — current data doesn't support these safely yet.

## 11. Local SEO architecture findings

Current entity relationships (already correct, no changes made):
`beautician_profiles.primary_city/locality/state` (where the business is based) is already deliberately separate from `service_areas` (where they travel to serve clients) — this distinction was built correctly in the Service Areas phase (3B) and reused as-is by SEO's `primary_target_location` derivation.

`services.category`/`category_id` + `services.name` are the existing service taxonomy; there is no additional "specialization" table beyond `beautician_profiles.about_highlights`/`why_choose_points` (free text, not structured).

**Architecture that could safely support a future service×location strategy** (e.g. "Bridal Makeup Artist in Satellite"): the combination already exists relationally today — `services` (or `service_areas`) × `beautician_profiles.primary_city`/`service_areas.area_name` — nothing new needs to be built to *compute* these combinations. What would need to be built in a later phase, deliberately not now: a landing-page route template, a decision on which combinations are real/worth a page (to avoid the explicitly-forbidden keyword-stuffed auto-generated pages), and canonical/duplicate-content handling between a beautician's main portfolio page and any per-area page.

## 12. Media SEO gaps (report only — Media modules not touched)

| Model | Alt text? | Caption/description? | UI to set it? |
|---|---|---|---|
| `portfolio_images` (Gallery) | Column exists (`alt_text`) | `caption` column also exists | **No** — no form field anywhere in `dashboard.gallery.tsx` to set either. Column is always null in practice. |
| `before_after_images` | Column exists (`alt_text`) | No caption column | **No** — same gap. |
| `portfolio_items`/`before_after_items` (parent record) | n/a | `title`/`description` columns exist and **are** editable | Working |
| Videos | n/a | `title`/`description` are editable (Step 2B, already built) | Working |

**Important nuance**: the public portfolio does **not** actually render a blank `alt=""` when `alt_text` is empty — `src/data/portfolio.ts`'s `imageAlt()` helper always *generates* a reasonable alt string (`"{item title} by {name}, {role} in {city}"`) regardless of the DB column. So there is a real accessibility/SEO baseline already in place. The gap is that the **stored `alt_text`/`caption` columns are effectively dead** — no write path, and the read path (public render) doesn't consult them either. Recommend for 3F.2: either (a) wire a simple alt-text/caption input into the Gallery/Before-After upload forms (reusing the existing prominent dropzone UI, per the standing convention) and have the public render prefer the real value when present, or (b) if the auto-generated alt is judged sufficient, drop the unused columns instead of leaving dead schema. Do not do either without your decision — flagging only.

## 13. Cover-image SEO recommendation

Per your explicit instruction, the public hero was **not** redesigned this phase. Audited what exists:
- `beautician_profiles.cover_image_url` exists in the schema and dashboard upload flow, but is **not** currently rendered anywhere on the public portfolio hero (confirmed via `portfolio-mapper.ts` — only `profile_image_url` → `portrait` is mapped through).
- No crop/aspect-ratio enforcement found for either `profile_image_url` or `cover_image_url` at upload time.
- No responsive `srcset`/size variants generated — images are served at original upload size.

**Recommendation for the eventual Variant B (hero with cover image)**: source image **16:9** (1600×900 minimum) for a wide hero band, or **21:9** (2100×900) if the design wants a shorter, more banner-like crop — both are standard, crop-safe ratios for a responsive full-bleed hero. For Open Graph/social sharing specifically (separate from the on-page hero), the ideal is **1200×630** (1.91:1) — this is already usable today as the `og:image` fallback source once a beautician has a cover image, independent of whatever the on-page hero decision ends up being.
Loading priority: whichever image is used as the hero should be marked high-priority/eager-loaded (it's the LCP element); gallery/below-the-fold images should stay lazy-loaded (not audited in detail this phase — flagged in §14 below).

## 14. Performance / Core Web Vitals risks (report only)

- **LCP risk**: the hero/portrait image's loading priority was not verified this phase — worth confirming it's not lazy-loaded (a lazy-loaded LCP element is a common, easy-to-fix CWV regression).
- **CLS risk**: image dimensions (`width`/`height`) exist on `portfolio_images`/`before_after_images` DB rows but weren't verified as actually being passed to the rendered `<img>` elements — if omitted, layout shift is possible while images load.
- **Font loading**: not audited this phase.
- **Unused client JS**: not audited this phase — no obvious large unused bundle flagged during this pass, but no bundle-analysis was run.
- **Metadata generation cost**: negligible — `buildHead()` and the new `getSeoOverview()` are simple synchronous/already-parallelized reads, no N+1 risk introduced.
- **SSR output**: confirmed working correctly (§1) — no risk found there.

None of the above were fixed this phase — explicitly out of scope ("do not perform unrelated performance refactoring"). Recommend a dedicated pass in a later phase if these are confirmed as real regressions via Lighthouse/PageSpeed.

## 15. Tests performed

- `tsc --noEmit` — clean.
- ESLint — clean (Prettier-only auto-fixes applied).
- Production build — succeeds.

## 16. Regression results

Full smoke test, all 200 OK: `/dashboard/seo`, `/dashboard/leads`, `/dashboard/profile`, `/dashboard/gallery`, `/dashboard/before-after`, `/dashboard/videos`, `/dashboard/services`, `/dashboard/packages`, `/dashboard/faqs`, `/dashboard/reviews`, `/dashboard/availability`, `/dashboard/areas`, and the public portfolio route. Verified live HTML output directly: title now reads `"Bridal Makeup Artist in Ahmedabad | Dharti R Panchal"` (matches the brief's own example exactly), meta description auto-generates correctly, the two fabricated JSON-LD fields are confirmed gone, canonical still resolves safely (relative, since no `SITE_URL` is configured yet — see §17). No other module's code was touched.

## 17. Deferred items

- **Production domain**: no `SITE_URL`/`VITE_SITE_URL` env var exists anywhere in this codebase, and "beautyfolio.in" only appears as marketing copy text, never as a configured value. Canonical/`og:url`/JSON-LD `url` fields are wired to become absolute automatically the moment this env var is set — **this needs your input**, not a guess, since shipping a wrong hardcoded domain is worse than the current safe relative-URL fallback.
- Sitemap.xml generation + robots.txt `Sitemap:` line (§1).
- Gallery/Before-After alt-text and caption input UI (§12).
- Cover-image hero A/B variant (§13) — explicitly deferred per your instruction, not just by omission.
- Expanded structured data per the §10 proposal (OpeningHoursSpecification from real availability data, ImageObject, VideoObject).
- Local SEO service×location landing-page strategy (§11) — architecture confirmed ready, no pages built.
- Performance/CWV fixes (§14) — reported only, not verified via Lighthouse or fixed.
- Everything explicitly listed as out-of-scope in the brief: Search Console/Analytics API, rank tracking, AI SEO writing/keyword research, competitor analysis, backlink tools, automatic city pages, blogging, Google Business Profile API.

## 18. Recommended Phase 3F.2 scope

In priority order:
1. Confirm the production domain and set `SITE_URL` — unlocks fully-correct canonical/OG/JSON-LD URLs with zero further code changes (the plumbing is already done).
2. Wire real `availability_settings.working_hours` into `openingHours` structured data (real fix for a currently-omitted field, not new fabrication).
3. Gallery/Before-After alt-text + caption UI (closes the dead-column gap in §12), using the existing prominent-dropzone upload convention.
4. Sitemap.xml (dynamic, published-slugs-only) + robots.txt `Sitemap:` line.
5. Decide and implement the cover-image hero variant (§13) as an actual A/B test, once you're ready to revisit the public hero design.
6. `ImageObject`/`VideoObject` structured data once #3 closes the alt-text gap.
