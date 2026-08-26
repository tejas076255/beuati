# BeautyFolio Phase 2 — Step 2A: Portfolio Content Data Model

Data/backend foundation only — no UI, no CRUD, no migration in this step. Companion to
`BEAUTYFOLIO-PHASE2-STEP1-ARCHITECTURE-AUDIT.md`.

## Inspection Result

Every table named in the Step 2A objective was re-verified fresh against the live migration
files (not assumed from prior audits): `profiles`, `beautician_profiles`, `portfolio_items`,
`portfolio_images`, `before_after_items`, `before_after_images`, `portfolio_videos`,
`portfolio_seo`, `services`, `packages`, `package_services`, `specializations`,
`beautician_specializations`, `service_areas`, `reviews`, `faqs`, `availability_settings`.

**Conclusion: the complete relational ownership chain the objective describes already exists,
correctly, in production.** No table, column, foreign key, enum, index, or RLS policy is
missing for the relational structure itself.

## Ownership Chain

```
auth.users
  → profiles (auth_user_id FK)
    → beautician_profiles (profile_id FK, 1:1)
      → portfolio_items → portfolio_images (portfolio_item_id FK)
      → before_after_items → before_after_images (before_after_id FK)
      → portfolio_videos
      → portfolio_seo (1:1, UNIQUE beautician_profile_id)
      → services → package_services ← packages
      → beautician_specializations ← specializations (shared taxonomy)
      → service_areas
      → reviews
      → faqs
      → availability_settings (1:1, UNIQUE beautician_profile_id)
```

All FKs confirmed `ON DELETE CASCADE` from the parent chain — no relational-level orphan risk.
(The only orphan risk anywhere in the system is at the Storage-file level, already documented in
the Step 2 Readiness Audit, unrelated to this relational model.)

## RLS/Security — Every Table, Freshly Confirmed

| Table | RLS | Public read policy | Owner write policy | Admin compatible |
|---|---|---|---|---|
| `beautician_profiles` | ✅ | `bp_public_read_published` | `bp_owner_*` | ✅ |
| `portfolio_items` / `portfolio_images` | ✅ | `pitems`/`pimages`_public_read | `_owner_all` | ✅ |
| `before_after_items` / `before_after_images` | ✅ | `ba`/`baimg`_public_read | `_owner_all` | ✅ |
| `portfolio_videos` | ✅ | `videos_public_read` | `videos_owner_all` | ✅ |
| `portfolio_seo` | ✅ | `seo_public_read` | `seo_owner_all` | ✅ |
| `services` / `packages` / `package_services` | ✅ | `*_public_read` | `*_owner_all` | ✅ |
| `specializations` (shared taxonomy) | ✅ | `spec_public_read` | `spec_admin_write` (admin-only, correct) | ✅ |
| `beautician_specializations` | ✅ | `bspec_public_read` | `bspec_owner_all` | ✅ |
| `service_areas` | ✅ | `areas_public_read` | `areas_owner_all` | ✅ |
| `reviews` | ✅ | `reviews_public_read` | `reviews_owner_all` | ✅ |
| `faqs` | ✅ | `faqs_public_read` | `faqs_owner_all` | ✅ |
| `availability_settings` | ✅ | `avail_public_read` | `avail_owner_all` | ✅ |

Every owner-write policy uses the identical `owns_beautician_profile()` helper, which already
contains the admin bypass (`OR has_role(auth.uid(),'admin')`) — admin compatibility is uniform
and automatic. No public/private leakage found: every public-read policy correctly gates on
`is_published`/`is_active` AND the parent profile being `published`.

## Media/Storage Reference Model

Confirmed already correct: `portfolio_images`/`before_after_images` store `storage_path` (the
source of truth) with `public_url` as a denormalized convenience field, not the primary
reference. Both tables carry `sort_order`, `alt_text`/`caption`, and dimension/size metadata;
`portfolio_images` additionally carries `is_cover`. Storage-object ownership is enforced
separately by Phase 2 Step 1's policies (path-based, keyed by slug).

## Conclusion

**NO MIGRATION REQUIRED.** The relational data model Step 2A's objective describes is already
fully built, correctly related, and correctly secured. This formalizes and re-confirms (fresh,
not assumed) what the Step 2 Readiness Audit already concluded.

## Known Limitations (unchanged from Step 2 audit, not addressed in this step)

- `cover_image_url`, `business_name`, and 4 social-URL columns exist but aren't yet writable
  from any server function or dashboard UI (CRUD-layer gap, not a data-model gap — deferred to a
  future CRUD step).
- No dashboard CRUD exists yet for `portfolio_videos` or `portfolio_seo` (CRUD-layer gap, not a
  data-model gap).
- Storage orphan-cleanup ordering issue in gallery/before-after delete flows (application-layer,
  not a data-model gap).
- No unique constraint enforces single-`is_cover` per gallery item (documented risk, deferred).

None of the above require a schema change — all are CRUD/application-layer work belonging to a
later, separately-authorized step.

## Evidence

Fresh verbatim re-read of `supabase/migrations/20260814053705_20118a74-9740-449a-ad4b-3277671d43e6.sql`
this session confirming every RLS policy row above, including `faqs`/`availability_settings`
(not re-verified since the very first Phase 1 audit until this step).
