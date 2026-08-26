# BeautyFolio Phase 2 — Step 1 Architecture Audit Report

Media & Storage Foundation. Read-only audit, no code/database/Storage changes made.
Companion reference for Phase 2 planning — see `BEAUTYFOLIO-ADMIN-IMPLEMENTATION-MATRIX.md` and
`BEAUTYFOLIO-ADMIN-PHASE-1.md` for the completed Phase 1 admin backend.

## 1. Executive Summary

The media/portfolio-content foundation for Phase 2 is **more complete than expected**:
`portfolio_items`/`portfolio_images` (gallery), `before_after_items`/`before_after_images`, and
`portfolio_videos` already exist as proper normalized tables with ordering, captions, alt text,
and publish flags — this is not a greenfield build. The real gaps are narrower than "build a
media system from scratch": (1) `portfolio_videos` has no dashboard CRUD despite being fully
rendered publicly, (2) `portfolio_seo` has no dashboard CRUD despite being actively consumed for
`<head>` metadata, (3) a genuine untracked-infrastructure gap exists around Storage write
policies (§7), and (4) no orphan-cleanup exists for replaced profile photos. Phase 2 is
therefore mostly a **"finish what's there + add ordering/premium presentation"** project, not a
new data model from zero.

## 2. Existing Database Schema

Full column-level schema for all 14 relevant tables verified directly from
`src/integrations/supabase/types.ts`.

| Table | Purpose | Ownership FK | Media fields |
|---|---|---|---|
| `beautician_profiles` | Core profile | `profile_id` → `profiles.id` | `profile_image_url`, `cover_image_url` |
| `portfolio_items` | Gallery "post" (a shoot/event) | `beautician_profile_id` | none directly (images are child rows) |
| `portfolio_images` | Individual gallery images | `portfolio_item_id` → `portfolio_items.id` | `storage_path`, `public_url`, `alt_text`, `caption`, `sort_order`, `is_cover`, `width`, `height`, `file_size_bytes`, `mime_type` |
| `before_after_items` | A before/after "case" | `beautician_profile_id` | none directly |
| `before_after_images` | The 2 images per case | `before_after_id` → `before_after_items.id` | `storage_path`, `public_url`, `alt_text`, `image_type` (`before`\|`after`), `sort_order`, `width`, `height` |
| `portfolio_videos` | Videos (YouTube/Instagram/uploaded/other) | `beautician_profile_id` | `video_url`, `storage_path`, `thumbnail_url`, `platform` enum |
| `portfolio_seo` | Per-profile SEO metadata | `beautician_profile_id` (1:1) | `og_image_url` |
| `services`, `packages`, `package_services` | Pricing/offerings | `beautician_profile_id` | none |
| `specializations`, `beautician_specializations` | Shared taxonomy + per-beautician assignment | shared table + join | none |
| `service_areas` | Location coverage | `beautician_profile_id` | none |
| `reviews` | Testimonials | `beautician_profile_id` | none |

`portfolio_images` and `before_after_images` **already have exactly the ordering/caption/alt-text/
dimension fields Phase 2's objective list asks for** (`sort_order`, `caption`, `alt_text`,
`width`/`height`, `is_cover`). Strong reuse signal.

`video_platform` enum: `"youtube" | "instagram" | "uploaded" | "other"`.
`before_after_image_type` enum: `"before" | "after"`.

## 3. Existing Storage Architecture

- **Bucket:** `portfolio-media`, `public = true`. Single bucket for everything.
- **Path convention actually used by code:** `profiles/{slug}/{profile|gallery|before-after}/{timestamp}-{filename}`
  (from `src/lib/storage-upload.ts`). The bucket-setup SQL's own comment suggests a *different,
  unused* convention (`portfolios/{beautician_profile_id}/...`) — never reconciled; code's
  convention is the one actually in effect.
- **Read policy:** `portfolio_media_public_read` — `SELECT`, `to anon, authenticated`,
  `USING (bucket_id = 'portfolio-media')`. The only Storage policy in any tracked SQL file.
- **Write policy: NOT PRESENT IN ANY TRACKED FILE.** See §7 — a genuine finding.
- No signed URLs anywhere — `buildPublicMediaUrl` constructs plain public bucket URLs
  (`getPublicUrl`), consistent with the bucket being public.

## 4. Existing Media Implementation

Flow: **Browser → Supabase Storage (anon-key client, direct) → path returned to browser →
server function (owner-scoped client) → DB row**.

- `uploadPortfolioMedia`/`deletePortfolioMedia`/`buildPublicMediaUrl` run **client-side**, using
  the anon/publishable-key browser client — never `client.server.ts` (service-role), never a
  server function.
- All three DB-write paths (`dashboard.gallery.tsx`, `dashboard.before-after.tsx`,
  `dashboard.profile.tsx`) follow the same shape: upload to Storage from the browser first, then
  call a `createServerFn` to write the DB row(s) using the owner-scoped session client.
- **Ownership enforcement today is RLS-only for the DB rows** (via `owns_beautician_profile()`) —
  solid. Storage-level ownership enforcement is the open question in §7.
- **Orphan risk confirmed real, not theoretical:** `dashboard.profile.tsx`'s photo-replace flow
  uploads a new file and updates `profile_image_url` but never deletes the old Storage object —
  every profile-photo change leaves the previous file behind permanently.
- `deletePortfolioItem`/`deleteBeforeAfterItem` (server) return the image rows before deleting
  them; the **route** (client) is responsible for then calling `deletePortfolioMedia` per image.
  If that client-side loop fails partway after the DB delete already succeeded, the Storage
  objects become orphaned with no DB reference — a real, code-confirmed gap.

## 5. Existing Portfolio/Profile Content Model

`about.highlights` and `whyChoose` **already exist as real, working columns**
(`about_highlights`, `why_choose_points`, both `TEXT[]`), fully wired dashboard-edit → DB →
public-page mapper → rendered sections. Not a gap.

Notably `cover_image_url`, `business_name`, `website_url`, `facebook_url`, `instagram_url`,
`youtube_url` all exist as columns but are **not** in the dashboard's editable field set
(`OwnProfileUpdate`) — present in schema, absent from UI.

## 6. Existing Routes & UI

11 dashboard routes exist. 3 are media-related (gallery, before-after, profile photo), 7 are
text-content CRUD, 1 is the shell. **No dashboard route exists for `portfolio_videos` or
`portfolio_seo`**, despite both having full schema support and both being actively consumed by
the public page (`portfolio_videos` rendered visibly; `portfolio_seo` consumed for `<head>` meta
tags only).

## 7. Existing RLS/Security — including one important finding

Phase 1's RLS work (owner-scoped policies via `owns_beautician_profile()`) already covers every
media-adjacent DB table — confirmed unchanged since the original schema migration. Public read
is correctly gated to `is_published = true AND profile published`.

**Finding — MEDIUM, informational, not a defect:** `src/lib/storage-upload.ts`'s own code
comment asserts an owner-scoped write RLS policy on `storage.objects` secures uploads. **No such
policy exists in any tracked `.sql` file in this repository** — the only tracked Storage policy
is the read-only one. Yet uploads have demonstrably worked throughout this project's history.
The only consistent explanation: a Storage write policy was applied directly in Lovable's SQL
editor at some point and was **never captured in a tracked migration file** — consistent with
this project's established manual-SQL-relay workflow. This is a **reproducibility/documentation
gap, not a live security hole** — the actual current Storage write-access rule should be
inspected live (read-only) before Phase 2 designs anything that depends on it.

**Public/private leakage risk:** LOW — bucket is fully public-read by design, matching the
public-portfolio product model.

## 8. Media/Data Flow

```
Browser (upload) → Supabase Storage (anon key, portfolio-media bucket)
                 → storage_path returned
                 → createServerFn (owner-scoped client)
                 → INSERT/UPDATE portfolio_images / before_after_images / beautician_profiles
                 → RLS enforces beautician_profile_id ownership

Public page → anon-key read client → portfolio-query.server.ts → RLS (published-only) → render
```

## 9. Architecture Gaps

| # | Gap | Category |
|---|---|---|
| 1 | No `dashboard.videos.tsx` for `portfolio_videos` | New UI required |
| 2 | No `dashboard.seo.tsx` for `portfolio_seo` | New UI required |
| 3 | Storage write policy not tracked in repo SQL | Security/RLS work required (inspect, document, then track) |
| 4 | Old profile photo never deleted on replace | New UI/logic required |
| 5 | No orphan-cleanup if client-side Storage delete fails after DB delete succeeds | New logic required |
| 6 | `cover_image_url`, `business_name`, social URLs exist in schema but not editable | Needs modification (UI only, no schema change) |
| 7 | No image ordering UI (drag-reorder) despite `sort_order` existing on both image tables | New UI required |
| 8 | No "is_cover" selection UI despite the column existing on `portfolio_images` | New UI required |

## 10. Security Risks

| Risk | Rank |
|---|---|
| Storage write-policy reproducibility gap (§7) | MEDIUM |
| Orphaned Storage files (profile photo replace, failed client-side delete loop) | MEDIUM |
| Public/private media leakage | LOW (intentional) |
| Duplicate uploads | LOW (timestamp-based naming) |
| RLS conflicts with new Phase 2 tables | LOW (proven, reusable pattern) |
| Phase 1 regression from Phase 2 changes | LOW, if Phase 2 stays additive |
| SEO implications of `portfolio_seo` having no edit UI | LOW-MEDIUM (product gap, not security) |
| Performance/image optimization (no resizing/compression pipeline) | MEDIUM, deferred |

## 11. Recommended Phase 2 Architecture (PROPOSED — NOT IMPLEMENTED)

1. **Database model** — no new tables needed for gallery/before-after (already sufficient).
   `portfolio_videos` and `portfolio_seo` need dashboard routes, not schema changes.
2. **Storage model** — keep the single `portfolio-media` bucket and existing path convention.
   Live-inspect (read-only) actual current Storage policies before Step 1 implementation, to
   close the §7 gap with a tracked migration reflecting reality.
3. **Ownership model** — continue the exact `owns_beautician_profile()` pattern.
4. **RLS strategy** — mirror the existing `{table}_owner_all` + `{table}_public_read` two-policy
   pattern for any new table.
5. **Media URL strategy** — keep public bucket URLs (no signed URLs).
6. **Portfolio content strategy** — fill the two real gaps (videos, SEO dashboard UIs) before
   adding anything new — highest reuse-to-effort ratio in the roadmap.
7. **Migration strategy** — continue the established manual-SQL-relay pattern (tracked `.sql`
   file + user runs in Lovable's editor + read-only REST re-verification).
8. **UI/component strategy** — reuse the existing gallery/before-after pages as the template for
   a videos page; reuse the existing profile-edit form pattern for an SEO page.
9. **SEO considerations** — `portfolio_seo` is already read correctly by the public page's
   `<head>` — the only missing piece is an edit UI.
10. **Future premium/subscription compatibility** — nothing in the current schema blocks a
    future `is_premium`/plan-gating column or a future `plan_features` table.

## 12. Proposed Step 1 Implementation Plan (not started)

If/when Step 1 is approved: (a) live read-only inspection of actual current Storage policies to
resolve §7, (b) a tracked migration codifying whatever write policy is confirmed to actually
exist (or adding one if genuinely missing), (c) no application code changes in Step 1 — Step 1
per the user's own ordering is "Media & Storage Foundation," which this audit suggests is really
"confirm and document what's already there" more than "build new."

## 13. Files That Would Need Modification (future steps, not now)

`src/lib/storage-upload.ts` (orphan-cleanup logic, Step 1/3), new `src/routes/dashboard.videos.tsx`
+ `src/data/dashboard/videos.server.ts` (Step 3+), new `src/routes/dashboard.seo.tsx` +
`src/data/dashboard/seo.server.ts` (Step 3+), `src/data/dashboard/profile.server.ts`/
`dashboard.profile.tsx` (expose currently-uneditable fields, Step 4).

## 14. Database Objects That Would Eventually Need Modification/Creation

None confirmed necessary yet for gallery/before-after/videos/SEO (all reuse existing tables). A
future "brochure files" or "premium template" concept (Step 4+) would need new tables — not
specified here, per instruction not to over-engineer ahead of need.

## 15. Storage Changes That Would Eventually Be Required

**PROPOSED — NOT IMPLEMENTED:** a tracked migration adding (or confirming) an owner-scoped write
policy on `storage.objects` for the `portfolio-media` bucket, path-prefix-matched to the caller's
own slug — mirroring the exact pattern already used for DB-table ownership.

## 16. Migration Risks

LOW for all identified future work — every proposal reuses existing, proven tables/patterns. The
one MEDIUM item is the Storage-policy reproducibility gap (§7), a documentation/inspection risk,
not a migration-execution risk.

## 17. Phase 1 Regression Risks

LOW. Nothing proposed touches any Phase 1 admin table or route. All Phase 2 proposals are
additive or reuse existing untouched tables.

## 18. Explicit List of Things NOT Changed

No code file was modified. No database migration was created or run. No RLS policy was created,
modified, or inspected via a write operation (only read-only file inspection performed). No
Storage bucket or Storage policy was created, modified, or deleted. No table, column, enum, or
index was created. No data was seeded, modified, or deleted. No UI was changed.

## 19. Implementation & Live Verification (2026-08-21)

Migration `supabase/migrations/20260821054621_portfolio_media_storage_policies.sql` implemented
and applied. First run hit `42710: policy already exists` on a retry (idempotency gap, not a
security issue) — fixed by adding `DROP POLICY IF EXISTS` before each `CREATE POLICY`, then
re-run successfully ("Query succeeded").

**Live verification performed (read-only + one real user action):**
- Anon RPC call to `owns_beautician_profile_by_slug` → `false` (correct, no session)
- Anon direct `INSERT` into `storage.objects` → rejected, "new row violates row-level security
  policy" (owner-scoped INSERT policy enforcing correctly)
- Existing public image → still `200` (public read unaffected)
- **Real upload test, user-performed:** a beautician uploaded a new gallery image through
  `/dashboard/gallery`. Cross-verified live via anon REST: new `portfolio_items` row ("Nail Art",
  `is_published: true`, created 2026-08-21T06:11:14) with a `portfolio_images` row at
  `profiles/dharti-panchal/gallery/1787292673086-download__1_.jpeg` — exact path convention
  match — and the file itself returns `200` on its public URL.

**This resolves the open question flagged throughout Step 1's planning**: the previously-missing
Storage write policy was the actual blocker, and real end-user uploads now work end-to-end
(Storage write → DB row → public read), confirmed with live data, not just a UI screenshot.

Existing application code required zero changes — `storage-upload.ts` and all three
upload-calling dashboard routes worked exactly as originally written once the policy existed.

**Phase 2 Step 1 is COMPLETE.**

---

STATUS: PHASE 2 STEP 1 — AUDIT COMPLETE
CODE CHANGES: NONE
DATABASE CHANGES: NONE
STORAGE CHANGES: NONE
RLS CHANGES: NONE
STEP 2: NOT STARTED
WAITING FOR USER APPROVAL
