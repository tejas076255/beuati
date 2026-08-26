# BeautyFolio — Phase 3F.3A: Public Trust Metric Data Integrity

Local development only. Fixes the product-level (public UI) counterpart of the structured-data fix made in Phase 3F.3 — no landing pages, no AI SEO, no hosting/deployment, no cover-image A/B test.

## 1. All trust metrics discovered

Audited every numeric/quantitative claim on the public portfolio (hero, About stats, trust bar, Reviews section header, footer, SEO metadata, JSON-LD):

| Metric | Where shown (before) | Value (before, live) |
|---|---|---|
| Rating | Hero chip, About stat, Reviews section header, trust bar | `4.9` (from `beautician_profiles.rating`) |
| Review count | Hero chip (mislabeled "clients"), Reviews section header | `214` (from `beautician_profiles.review_count`) |
| Client count | About "Brides" stat, trust bar "Clients" chip | `600+` (from `beautician_profiles.client_count`) |
| Years of experience | Hero chip, About stat, trust bar | `8+ years` (from `beautician_profiles.years_experience`) — already consistent everywhere via one shared `profile.experience` field |
| Verified status | **Nowhere** — no profile-level badge existed at all | n/a |

No footer trust metrics were found. SEO metadata/dashboard (`/dashboard/seo`) does not display any of these numbers — confirmed no consistency issue there.

## 2. Source-of-truth matrix

| Metric | Classification | Source | Notes |
|---|---|---|---|
| Rating | **1. SYSTEM-CALCULATED** | Average of `reviews.rating` for the profile's published rows only | Same `computeAggregateRating()` helper as JSON-LD (Phase 3F.3) |
| Review count | **1. SYSTEM-CALCULATED** | Count of published `reviews` rows | Same helper, same call |
| Published work count | **1. SYSTEM-CALCULATED** | Count of published `portfolio_items` rows | New — replaces the old client_count-derived "Brides" stat |
| Years of experience | **2. USER-ENTERED WITH CLEAR MEANING** | `beautician_profiles.years_experience`, editable on the Profile page | Legitimate, unchanged |
| Verified badge | **3. VERIFIED / ADMIN-MANAGED** | `beautician_profiles.is_verified`, toggled only in `/admin/profiles` (audit-logged) | Newly surfaced publicly this phase — see §10 |
| Client count | **4. NOT RELIABLE ENOUGH TO DISPLAY** | `beautician_profiles.client_count` | See §8 — no dashboard field, no admin verification, no sync mechanism found |
| `metrics_verified` column | (not a metric itself) | — | Confirmed via `supabase/migrations/20260819123937_...sql` comment: gates only the original **demo profile's** stat display, unrelated to real professional verification. Never set to `true` anywhere in current app code for real profiles. |

## 3. Files changed

- `src/lib/seo-helpers.ts` — no change this phase (`computeAggregateRating()` from Phase 3F.3 reused as-is).
- `src/data/portfolio.ts` — `rating` is now `number | null`; removed `looksDelivered`/`clients` (both unreliable, both confirmed to have zero other consumers by a full-codebase grep before removal); added `publishedWorkCount: number` and `isVerified: boolean`.
- `src/data/portfolio-mapper.ts` — computes `rating`/`reviewCount` via `computeAggregateRating(bundle.reviews)` (published reviews only, from the same query filter used for JSON-LD); `publishedWorkCount` from `bundle.portfolioItems.length` (already `is_published`-filtered at the query layer); `isVerified` from `profile.is_verified`; trust bar no longer includes a "Clients" entry, adds "Reviews" only when real reviews exist.
- `src/components/portfolio/portfolio-sections.tsx` — hero rating chip hidden when `rating == null`, wording corrected from "+ clients" to "N review(s)" (no "+"); Verified badge added next to the `<h1>` name when `isVerified`; About stat grid replaces the old "Brides" cell with real `publishedWorkCount`, omits the rating cell entirely when null; `ReviewsSection` now returns `null` when there are zero published reviews (matches the existing `VideosSection` empty-state convention).

## 4. Database changes

**None**, per the phase's explicit expectation. `rating`, `review_count`, and `client_count` columns on `beautician_profiles` are untouched and not dropped — they're simply no longer *consumed* by public UI or structured data.

## 5. Rating calculation

`computeAggregateRating(reviews)` — average of `rating` across the profile's published `reviews` rows, rounded to 1 decimal, `null` when there are zero reviews. This is the exact same function and the exact same `bundle.reviews` array (already filtered to `is_published: true` at the query layer) used for the Phase 3F.3 JSON-LD `AggregateRating` — one shared calculation, not two implementations that could drift.

## 6. Review-count calculation

`reviews.length` from the same published-reviews array — always a real, honest count (`0` is an accurate value, never hidden as a number, only its *presentation* as a prominent hero metric is conditional).

## 7. Zero-review behavior

- Hero rating chip: not rendered at all when `rating == null`.
- About "Average rating" stat: omitted from the grid entirely when `rating == null` (grid degrades gracefully from 4 to 3 cells — no layout hack needed).
- `ReviewsSection`: returns `null` (whole section hidden) when there are zero published reviews — no "0.0 ★ / 0 reviews" block, no empty review grid.
- Trust bar: "Rating"/"Reviews" entries only pushed when a real `ratingSummary` exists.

No default/fabricated rating is ever substituted.

## 8. client_count finding and final decision

Audited per Step 5:
1. **Where it came from** — appears to be seed/demo data (the migration-era comment confirms `client_count=600` was a known-good *demo profile* value, gated only by the unrelated `metrics_verified` flag).
2. **User-editable?** — No. `dashboard.profile.tsx` has no `client_count` field anywhere.
3. **Admin-verifiable?** — No. `admin.profiles.tsx` only displays it read-only (`{profile.review_count} / {profile.client_count}`), no edit/verify action.
4. **Sync logic?** — None found; no trigger, no server function writes to it.
5. **Historical client data?** — None in this schema; the CRM (`leads`/`lead_inquiries`) only covers BeautyFolio-era enquiries, not a beautician's full career history, and per the phase's explicit instruction was **not** used as a substitute.
6. **CRM-derived alternative?** — Deliberately not used, per instruction, since it would misrepresent partial CRM data as complete client history.

**Decision: CASE B.** No reliable write/verification/sync path exists → `client_count` is removed from all public trust-metric display. No new dashboard field was added to "preserve" it, per the explicit instruction not to add an input just to keep a legacy metric alive. Replaced with a real, system-calculated signal instead: published portfolio-work count (§1/§6 of the spec's own preferred-signals list).

## 9. years_experience consistency

Audited every consumer: hero trust chip, About stat, and the trust bar all read the single `profile.experience` computed field (itself built once in the mapper from `years_experience`) — already consistent by construction before this phase, confirmed unchanged. The stored value itself was never rewritten.

## 10. Verified badge semantics

`beautician_profiles.is_verified` is admin-only (toggled exclusively in `/admin/profiles`, with an audit-log entry per the Phase-1 admin work) — a genuine **3. VERIFIED / ADMIN-MANAGED** signal, safe to surface. Added a small, restrained "Verified" badge next to the professional's name in the hero, with a `title` tooltip reading *"Reviewed and approved by BeautyFolio"* — deliberately not implying government ID verification, license checks, or background checks, since BeautyFolio doesn't perform those. `metrics_verified` (a different, unrelated column that only ever gated the original demo profile's stat display) was **not** repurposed — confirmed via the Phase 1 admin migration's own comment that it's unrelated to professional verification.

## 11. Public hero changes

Minimal, scoped exactly to inaccurate-value replacement:
- Rating chip: hidden when no reviews; wording fixed from "(N+ clients)" to "(N reviews)"; no "+" on the exact review count.
- Verified badge: new, small, inline next to the name — the only net-new hero element this phase.
- Layout, CTA hierarchy, portrait, spacing, and responsive behavior are otherwise byte-for-byte unchanged. No cover-image A/B test, no redesign.

## 12. Reviews-section changes

Section now returns `null` for zero published reviews (previously always rendered, showing a stale "4.9 / out of 5" header even with no real reviews). When reviews exist, the header now shows the real computed average and real count — live-verified as `4.7` / `3 reviews` against the actual 3 published rows (ratings 4, 5, 5).

## 13. Structured-data verification

Confirmed Phase 3F.3's fix is untouched and still correct: `computeAggregateRating(profile.reviews)` in `portfolio.$slug.tsx`'s `buildHead()` was already independent of `beautician_profiles.rating`/`review_count` before this phase, so no code change was needed there. Audited every other JSON-LD property for `client_count`/marketing-statistic leakage — none found; `makesOffer`, `areaServed`, `founder`, `sameAs` all already source from real per-item/per-profile data, unrelated to the metrics fixed here.

## 14. SEO dashboard consistency

Audited `/dashboard/seo` (and its data source `seo.server.ts`) — confirmed it never displays rating, review count, or client count in any form. No inconsistency existed there; no change was needed.

## 15. Legacy/deprecated fields

| Column | Classification | Disposition |
|---|---|---|
| `beautician_profiles.rating` | **LEGACY** | No longer read by public UI or structured data. Left in the schema — may still be read by internal admin views. |
| `beautician_profiles.review_count` | **LEGACY** | Same as above. |
| `beautician_profiles.client_count` | **UNVERIFIED** | No longer read by public UI. Still visible read-only in `/admin/profiles` (an internal admin moderation view, not a public trust claim) — left unchanged since admin's own internal display of raw stored values is outside this phase's "public portfolio" scope. |
| `beautician_profiles.metrics_verified` | **DEPRECATED** (already, per the Phase 1 admin work) | Confirmed unrelated to professional verification; not repurposed; not read anywhere in current app code. |

No column was dropped, per the phase's explicit "expected database schema changes: NONE."

## 16. Tests performed

- Live-fetched the raw SSR response for `/portfolio/dharti-panchal` and confirmed, byte-for-byte in the rendered HTML:
  - Hero rating chip: `4.7` / `(3 reviews)` — real, matches published reviews.
  - Verified badge: present (profile `is_verified: true`).
  - About stat: "Published looks" cell present with a real count; "Average rating" cell present (since reviews exist).
  - Reviews section header: `4.7` / `3 reviews` — matches.
  - Trust bar (inspected via the loader's serialized data in the HTML): `{label:"Experience",value:"10+ Years"}, {label:"Rating",value:"4.7★"}, {label:"Reviews",value:"3"}, {label:"Based in",...}` — no "Clients" entry.
  - JSON-LD `aggregateRating`: `{ratingValue: 4.7, reviewCount: 3}` — unchanged from Phase 3F.3, confirmed still correct and now matching every UI location exactly.
  - Confirmed absence of the old fabricated values: no `214`, no `600+` anywhere in the response.

## 17. Regression results

- `tsc --noEmit` — clean
- ESLint — clean (one pre-existing, unrelated warning in `portfolio-sections.tsx` about a non-component export, not introduced by this phase)
- `npm run build` — succeeds
- Smoke test: `/`, `/portfolio/dharti-panchal`, `/dashboard/profile`, `/dashboard/reviews`, `/dashboard/seo`, `/admin/profiles`, `/admin/reviews`, `/sitemap.xml`, `/robots.txt` — all 200 OK

## 18. Manual tests you should perform

I verified Test A (3 published reviews → 4.7/3 everywhere) directly against live SSR output. These require dashboard interaction I can't perform without your login:
- **Test B**: Unpublish one review in `/dashboard/reviews`, confirm the rating/count recalculate and update everywhere (hero, About, Reviews header, JSON-LD).
- **Test C**: On a profile with zero published reviews, confirm no rating chip, no About rating cell, and the entire Reviews section is absent — not just empty.
- **Test D**: Change `years_experience` in `/dashboard/profile`, confirm every public location reflects the new value.
- **Test F/G**: Toggle `is_verified` in `/admin/profiles`, confirm the Verified badge appears/disappears accordingly.
- **Test H**: Refresh and log out/in, confirm no inconsistency.

## 19. Known limitations

- `client_count` remains visible read-only in the internal `/admin/profiles` view — intentionally left, since that's an admin moderation tool reading raw stored data, not a public trust claim; flagged here for visibility, not treated as in-scope for this phase's "public portfolio" objective.
- No dashboard field was added for "approximate clients served" — per the explicit instruction not to add an input just to preserve a legacy metric when the product doesn't already support it; if the product later decides this is a wanted feature, that's a distinct future decision, not assumed here.

## 20. Recommended next phase

None proposed — this phase intentionally stops for manual review, per the stop condition. If a future phase is warranted, the most natural follow-up would be a decision on whether to build a legitimate "approximate clients served" dashboard input (Case A) if the product team decides that's worth adding, or to formally deprecate/drop the `rating`/`review_count`/`client_count` columns in a database cleanup pass once confirmed nothing else reads them.
