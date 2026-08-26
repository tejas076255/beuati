# BeautyFolio — Backend Portability & Migration Readiness

Phase 3F.4A (read-only audit) + Phase 3F.4A.1 (controlled cleanup of the findings below). Findings are read-only-verified against the live Lovable Cloud database; the 3F.4A.1 remediation section records the specific, narrow changes actually made afterward.

**Exact verified active backend project reference: `ivbujlyilzmlublqzalu`** — confirmed identical across `.env` (`SUPABASE_URL`/`VITE_SUPABASE_URL`/`SUPABASE_PROJECT_ID`), the Supabase MCP connection's `get_project_url`, and a live database row's own stored absolute Storage URL. A reference `iybujlyilzmlublqzalu` that appeared once in a user message was a typo (`iy` vs `iv`) — it matches no configuration value anywhere in this project.

## 1. Current architecture

BeautyFolio's database runs on **Lovable Cloud**, Lovable's managed Supabase backend (project ref `ivbujlyilzmlublqzalu`). It is a genuine, standard Postgres/Supabase instance — normal `public`/`auth`/`storage` schemas, standard RLS, standard Storage buckets — accessed by the application through the ordinary `@supabase/supabase-js` client (anon key client-side, anon/publishable key server-side for public reads, `requireSupabaseAuth` middleware for owner-scoped writes). It is **not** browsable through a personal Supabase dashboard login/org — access for this audit and for the Phase 3F.4 migration was performed through the linked Lovable project's own database connection (`mcp__claude_ai_Lovable__query_database`, project id `57a20777-d6f4-466c-9e84-03d4b6818b81`). See `reference_supabase_db_access.md` in the assistant's session memory for the full explanation of why the personal Supabase dashboard cannot see this project.

## 2–3. Live DB vs. migration files — comparison method

Every table, column, constraint, index, enum, function, trigger, and RLS policy was read live via SQL introspection (`information_schema`, `pg_catalog`) and compared against the 13 files under `supabase/migrations/`, applied in filename-timestamp order (`20260814053705` … `20260823180000`).

## 4. Schema drift findings

**One real finding, self-inflicted and harmless — remediated in Phase 3F.4A.1 (see §31):** `services` and `packages` already had a full `UNIQUE (beautician_profile_id, slug)` constraint since the very first migration (`20260814053705_...sql` lines 220 and 255, inline in the `CREATE TABLE` statements) — auto-named `services_beautician_profile_id_slug_key` / `packages_beautician_profile_id_slug_key`. Because a plain `UNIQUE` constraint on a nullable column already allows unlimited `NULL`s and only enforces uniqueness among non-null values, **this already provided the exact guarantee the Phase 3F.4 migration re-added**. My Phase 3F.4 audit missed this constraint (a grep pattern that didn't match a bare `UNIQUE (...)` line inside a `CREATE TABLE` block), so `20260823180000_service_slugs.sql` added a second, redundant partial unique index (`idx_services_bp_slug`) on `services` (note: `packages` was never touched by Phase 3F.4, so it only ever had the one original constraint — no redundancy there). The redundant index on `services` was dropped in Phase 3F.4A.1 — see §31.

No other drift found: every column, type, default, `NOT NULL`, `CHECK`, foreign key, and index seen live matches a migration file. No schema change exists live that is absent from the repository, and no migration file was found to differ from what's live.

## 5. Migration-history findings

Lovable Cloud does not expose the standard Supabase CLI migration-history table (`supabase_migrations.schema_migrations`) to this audit's access path. There is no way to confirm "migration X was formally recorded as applied" the way `supabase db push` would — the only verification available is **direct comparison of live schema state against migration file content**, which was done exhaustively (§4) and found consistent. Practically: the repository's migration files appear to be an accurate, faithful history of how the live schema was built, applied in order, with no evidence of manual out-of-band schema edits.

## 6. Tables / schema inventory (26 tables, all in `public`)

`audit_logs`, `availability_blocked_dates`, `availability_settings`, `beautician_profiles` (43 cols), `beautician_specializations`, `before_after_images`, `before_after_items`, `faqs`, `lead_activities`, `lead_inquiries`, `lead_inquiry_services`, `leads`, `package_services`, `packages`, `portfolio_events`, `portfolio_images`, `portfolio_items`, `portfolio_seo`, `portfolio_videos`, `profiles`, `reviews`, `service_areas`, `service_categories`, `services`, `specializations`, `user_roles`.

No views, no materialized views, no sequences (every PK uses `gen_random_uuid()`, not `serial`).

**`portfolio_events`** (0 live rows) and its RPC **`record_portfolio_event()`** exist in both the base migration and the live DB — genuinely built, but never called anywhere in the current application code (confirmed by a full-codebase grep). Dormant analytics infrastructure, not drift.

## 7. RLS inventory

All 26 tables have RLS **enabled** (none forced, i.e. table owners could bypass — irrelevant here since the app never connects as the table owner). Every owner-write policy uses the shared `owns_beautician_profile(_bp_id uuid)` helper (`SECURITY DEFINER`, checks `profiles.auth_user_id = auth.uid()` OR `has_role(auth.uid(),'admin')`); every public-read policy gates on the parent profile's `is_published_profile(_bp_id)` (checks `status = 'published'`) **and** the row's own `is_active`/`is_published` flag. `beautician_profiles` itself has 4 distinct policies (owner select/insert/update/delete, admin-aware) plus a public-read policy scoped to `status = 'published'`. `profiles` and `user_roles` are self/admin-scoped only, no public read. Full policy-by-policy detail (37 policies total) was captured live and matches the shared-helper pattern documented in every prior phase's audit — no policy or helper exists live that isn't representable from migration SQL.

## 8. RPC / function inventory (11 functions, all `public` schema, all `SECURITY DEFINER` except `set_updated_at`)

| Function | Purpose | Called from app code? |
|---|---|---|
| `has_role(uuid, app_role)` | Role check used inside RLS policies | Indirectly (via RLS) |
| `owns_beautician_profile(uuid)` | Ownership check used inside RLS policies | Indirectly (via RLS) |
| `owns_beautician_profile_by_slug(text)` | Same, slug-keyed — used by **Storage** policies (`portfolio-media` bucket) | Indirectly (via Storage RLS), not called directly from TS |
| `is_published_profile(uuid)` | Public-read gate used inside RLS policies | Indirectly (via RLS) |
| `guard_beautician_profile_flags()` | Trigger: blocks a non-admin from setting `is_verified`/`is_featured` on their own row | Trigger only |
| `guard_review_verification()` | Trigger: forces `is_verified=false` on owner-authored review writes | Trigger only |
| `set_updated_at()` | Trigger: maintains `updated_at` | Trigger only, 15 tables |
| `handle_new_user()` | Trigger on `auth.users` insert: creates `profiles` + default `beautician` role | Trigger only |
| `log_admin_action(...)` | Writes an `audit_logs` row | Called from `src/data/admin/*.server.ts` |
| `submit_lead(...)` | Public lead-capture RPC — atomically inserts `leads` + `lead_inquiries` + optional `lead_inquiry_services` + a `lead_activities` note | Called from the public portfolio's enquiry form |
| `record_portfolio_event(...)` | Analytics event logger | **Defined, never called** (see §6) |

No "code references function not found live" case exists — every RPC the codebase calls (`submit_lead`, `log_admin_action`) exists live and matches its migration definition.

## 9. Trigger inventory

15 `BEFORE UPDATE ... EXECUTE FUNCTION set_updated_at()` triggers (one per table with an `updated_at` column: `availability_settings`, `beautician_profiles`, `before_after_images`, `before_after_items`, `faqs`, `lead_inquiries`, `leads`, `packages`, `portfolio_images`, `portfolio_items`, `portfolio_seo`, `portfolio_videos`, `profiles`, `reviews`, `service_areas`, `services`). Plus: `trg_beautician_profiles_flags` (INSERT+UPDATE guard), `trg_reviews_verification` (INSERT+UPDATE guard), and `on_auth_user_created` (`AFTER INSERT` on `auth.users`, the signup-automation trigger). All 18 triggers trace to a migration file; none exist live-only.

## 10. Auth architecture

- Provider: Supabase Auth, email/password only — no OAuth provider or magic-link code path found in the app.
- Signup flow: `auth.users` insert → `on_auth_user_created` trigger → `handle_new_user()` creates a `profiles` row (`auth_user_id`, `display_name` from `raw_user_meta_data`, `email`) and a default `user_roles` row (`'beautician'`), both `ON CONFLICT DO NOTHING`.
- Role/admin determination: `user_roles(user_id, role)` where `role` is the `app_role` enum (`beautician`, `admin`) — checked via `has_role()`. No metadata-based role check.
- Beautician-ownership determination: `owns_beautician_profile()` — joins `beautician_profiles.profile_id → profiles.id` and compares `profiles.auth_user_id = auth.uid()`.
- Session handling: standard Supabase client session (cookie/localStorage per the SDK default), read server-side via `requireSupabaseAuth` middleware (`src/integrations/supabase/auth-middleware.ts`) on every owner-scoped server function.
- No password-reset route or custom email-redirect-URL logic was found in the app code beyond what the Supabase client SDK provides by default.

## 11. Auth migration risk & future migration plan

**Risk summary** (unchanged from the original audit):
- **`profiles.auth_user_id` has no database-level foreign key to `auth.users.id`** — it's a plain unique `uuid` column, kept in sync only by the `handle_new_user()` trigger at signup time. This means a future Auth migration would need to explicitly remap `auth_user_id` values; there's no FK-driven cascade to rely on (this cuts both ways: no cascade risk, but no DB-enforced integrity either).
- Every `beautician_profile_id`/`lead_id`/etc. foreign key in the schema points to internal `profiles`/`beautician_profiles` UUIDs, **not directly to `auth.users.id`** — so as long as `profiles.auth_user_id` is correctly remapped to new Auth UUIDs during a migration, no other table needs to change.
- Supabase Auth does not support exporting/importing password hashes through the standard dashboard/API; a real migration would require either (a) a `gotrue` GUID-preserving `pg_dump` of the `auth` schema (only possible with direct Postgres access, not the dashboard), or (b) a "reset password" flow for every existing user post-migration.
- OAuth identities: none exist currently, so no OAuth-identity migration risk applies today.

**Future Auth migration plan** (documentation only — no Auth change made in Phase 3F.4A or 3F.4A.1):

1. **Preserving user UUIDs where possible.** If the destination is provisioned via a direct Postgres-level `pg_dump`/`pg_restore` of the source's `auth` schema (requires infrastructure-level access to both projects, not the standard dashboard), `auth.users.id` values — and therefore every `profiles.auth_user_id` reference — can be preserved exactly, and step 2 below becomes a no-op verification rather than an active remapping. This is the preferred path if available.
2. **`profiles.auth_user_id` mapping (if UUIDs cannot be preserved).** Export `profiles(id, auth_user_id, email)` from the source before migration. After creating each user in the destination Auth (matched by email), build an old-UUID → new-UUID map and run a single `UPDATE public.profiles SET auth_user_id = <new-uuid> WHERE id = <profiles.id>` per row. No other table needs touching, since nothing else references `auth.users.id` directly (§11 risk summary above).
3. **`user_roles` relationships.** `user_roles.user_id` also refers to `auth.users.id` directly (not `profiles.id`) — it must be remapped through the *same* old→new UUID map used in step 2, in the same pass, or admin/beautician role assignments will silently point at the wrong (or a nonexistent) user.
4. **Signup trigger behavior.** `handle_new_user()` (on `auth.users` INSERT) auto-creates a `profiles` row and a default `'beautician'` `user_roles` row, both `ON CONFLICT DO NOTHING`. If users are recreated in the destination via the Auth API/dashboard (rather than a raw `auth` schema restore), this trigger will fire again and attempt to create fresh `profiles`/`user_roles` rows — which is *safe* (idempotent no-op) only if the migration script runs its own `profiles`/`user_roles` restore **before** relying on the trigger's output, or explicitly accounts for the trigger already having created a (wrong-`id`) row that then needs merging/deleting rather than assuming a clean slate.
5. **Password reset requirement.** Unless a raw `auth` schema `pg_dump`/`pg_restore` is used (step 1), password hashes cannot be carried over through any standard Supabase API — every existing user must go through "forgot password" after cutover. This should be planned as a communication step (email/SMS to existing beauticians), not a silent expectation.
6. **Validation after migration.** Row-count match on `profiles`/`user_roles` between source and destination; every `profiles.auth_user_id` resolves to a real destination `auth.users.id`; every `user_roles.user_id` resolves the same way; spot-check that `has_role()`/`owns_beautician_profile()` return the same answers for a sample of migrated users as they did pre-migration (i.e., the right person still owns the right portfolio).

## 12. Storage inventory

One bucket: **`portfolio-media`** — public, no bucket-level MIME-type or file-size restriction configured (enforced client-side only, e.g. `accept="image/jpeg,image/png,image/webp"` in dropzone components). Path convention: `profiles/{beauticianSlug}/{gallery|before-after|videos|profile}/{timestamp}-{filename}`. Storage RLS (4 policies): public `SELECT` on the whole bucket; owner-scoped `INSERT`/`DELETE`/`UPDATE` gated by `owns_beautician_profile_by_slug((storage.foldername(name))[2])` — i.e. the second path segment must match the caller's own profile slug. Bucket creation and its 4 policies are present in `20260821054621_portfolio_media_storage_policies.sql`.

## 13. Storage migration risk

Database backup alone would **not** reproduce the actual image/video files — those live only in Supabase Storage, not in any table. A future Storage Migration Plan (not executed now):
1. Enumerate every object under `portfolio-media` (via Storage API list, paginated).
2. Preserve the exact same path structure in the destination bucket (paths are already stored in `storage_path` columns and referenced by the RLS ownership policy — changing path shape would break both).
3. Copy binaries object-by-object (Storage API has no native cross-project copy; requires download+re-upload).
4. Recreate the `portfolio-media` bucket (public, same name) in the destination.
5. Recreate the 4 storage RLS policies verbatim (they depend on `owns_beautician_profile_by_slug`, which must exist in the destination first).
6. Validate object count matches source exactly.
7. Validate a sample of URLs resolve (200, correct content-type).
8. Update any environment/domain references (see §14) — a ready-to-use, non-executed rewrite script for exactly this step now exists at `supabase/tooling/rewrite-storage-origin.sql` (Phase 3F.4A.1, see §31): dry-run mode, before/after row preview, only touches rows matching the known old origin, never touches YouTube/Instagram URLs or already-relative `storage_path` values, and is safely re-runnable (idempotent).

## 14. Storage URL dependency audit

| Field | Stores | Classification |
|---|---|---|
| `portfolio_images.storage_path` | Relative path | **PORTABLE** |
| `portfolio_images.public_url` | `NULL` on every live row — app resolves the URL dynamically from `SUPABASE_URL` + `storage_path` at read time | **PORTABLE** |
| `before_after_images.storage_path` / `.public_url` | Same pattern — path-only, `public_url` unused/null | **PORTABLE** |
| `portfolio_videos.storage_path` | Relative path (only for `platform='uploaded'`) | **PORTABLE** |
| `portfolio_videos.thumbnail_url` | **Absolute** `https://ivbujlyilzmlublqzalu.supabase.co/...` baked in at upload time | **REQUIRES URL REWRITE** |
| `portfolio_videos.video_url` | External URL (YouTube/Instagram) for those platforms — unrelated to Supabase backend | **PORTABLE** (not backend-specific) |
| `beautician_profiles.profile_image_url` | **Absolute** Supabase Storage URL | **REQUIRES URL REWRITE** |
| `beautician_profiles.cover_image_url` | **Absolute** Supabase Storage URL (when set) | **REQUIRES URL REWRITE** |

A migration would need a one-time `UPDATE` pass rewriting the domain segment of every absolute URL in `beautician_profiles.profile_image_url`/`cover_image_url` and `portfolio_videos.thumbnail_url` (only these 3 columns) — not touched now, per the audit-only instruction.

## 15. Environment variable inventory (names only, no values)

| Variable | Scope | Purpose | Changes on migration? |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Frontend public, build-time | Client Supabase URL | Yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend public, build-time | Client anon key | Yes |
| `VITE_SUPABASE_PROJECT_ID` | Frontend public, build-time | Project ref, used in a couple of display contexts | Yes |
| `SUPABASE_URL` | Server-only | Server-side anon/admin client base URL | Yes |
| `SUPABASE_PUBLISHABLE_KEY` | Server-only | Server-side anon client key | Yes |
| `SUPABASE_PROJECT_ID` | Server-only | Mirrors the frontend var, server context | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret, **runtime-injected by Lovable Cloud — not present in the repo's `.env` at all** | Powers `src/integrations/supabase/client.server.ts`'s `supabaseAdmin` (service-role, RLS-bypassing client) | Yes — and would need to be manually added to `.env`/hosting env for a non-Lovable deployment, since it isn't in version control |
| `VITE_SITE_URL` | Frontend+server, build-time | Canonical/absolute-URL base (`src/lib/site-url.ts`) | Only if the domain changes, independent of backend migration |

**`SUPABASE_SERVICE_ROLE_KEY` finding:** `supabaseAdmin` (the admin/service-role client) is defined but **not imported or used anywhere else in the codebase** — confirmed by a full-source grep. It exists as Lovable-generated boilerplate (`client.server.ts` header: "This file is automatically generated. Do not edit it directly."), dormant, not a current runtime dependency of any working feature.

## 16. Lovable-specific dependencies

| Dependency | Where | Classification |
|---|---|---|
| `@lovable.dev/vite-tanstack-config` (npm package, `vite.config.ts`) | Build | **D. Backend infrastructure dependency / build-only** — the entire Vite/TanStack Start build pipeline (React plugin, Tailwind, tsconfig-paths, Nitro/Cloudflare target, `VITE_*` env injection, dev-only TanStack devtools) is bundled inside this one Lovable-published package. Losing access to it would require manually reconstructing an equivalent plain Vite config — a real but *recoverable* migration cost (all the underlying pieces are standard OSS tools), not a hard blocker. |
| `window.__lovableEvents` / `window.__lovableReportRuntimeError` (`src/lib/lovable-error-reporting.ts`, wired in `src/routes/__root.tsx`) | Runtime, but no-op outside Lovable's own preview iframe | **A. Development-only / E. Safe to remove later** — optional-chained, silently does nothing when the Lovable globals aren't present (i.e. in any real production browser). |
| `SUPABASE_SERVICE_ROLE_KEY` injected by Lovable Cloud, absent from `.env` | Runtime | **D. Backend infrastructure dependency** — but see §15, currently unused by any real feature. |
| "Connect Supabase in Lovable Cloud" error strings (`client.ts`, `client.server.ts`, `auth-middleware.ts`) | Error messages only | **E. Safe to remove/reword later** — cosmetic, no functional dependency. |

No Lovable-specific SDK is used for database, auth, or storage access — every one of those goes through the plain `@supabase/supabase-js` client.

## 17. Edge functions / server functions

**No Supabase Edge Functions exist** — `supabase/functions/` does not exist in this repository. All server-side logic runs through TanStack Start server functions (`createServerFn`) executed by the app's own SSR server (`src/server.ts`, a thin wrapper around `@tanstack/react-start/server-entry`), deployed as a single Nitro/Cloudflare-Worker-target build. There is no separate function-deployment step to account for during a migration beyond redeploying this one app.

## 18. Admin-system portability

Admin authorization is entirely `has_role(auth.uid(),'admin')`-based (§7/§8) — a plain database row in `user_roles`, no Lovable-specific identity state involved. Profile verification (`beautician_profiles.is_verified`/`is_featured`) is guarded by the `guard_beautician_profile_flags()` trigger (blocks non-admin self-modification) and logged via `log_admin_action()` → `audit_logs`. Review moderation follows the identical pattern (`guard_review_verification()` trigger + `reviews.is_verified`). All fully portable — standard Postgres/RLS mechanisms only.

## 19. CRM (Leads) portability

`leads` → `lead_inquiries` (1:many) → `lead_inquiry_services` (1:many) → `lead_activities` (1:many, independent FK to `leads`). All FKs present and correctly ordered in `20260814053705` (base) + `20260822120000_leads_crm_upgrade.sql`. `lead_status` enum: **9 values** live (`new, contacted, qualified, quoted, negotiation, booked, completed, lost, archived`) — base migration created the original 6, the CRM-upgrade migration correctly `ALTER TYPE ... ADD VALUE`'d the 3 newer ones (`quoted`, `negotiation`, `completed`) in the right relative position. Live state and migration files agree exactly. (An older internal doc, `BEAUTYFOLIO-ADMIN-IMPLEMENTATION-MATRIX.md`, still says "6 values" — that note predates the CRM upgrade and is now stale documentation, not a schema problem.) `submit_lead()` RPC is `SECURITY DEFINER`, callable by `anon`, and atomically writes across all 4 tables in one transaction.

## 20. Enum inventory (11 enums, all `public` schema)

`admin_audit_action`, `admin_audit_entity_type`, `app_role`, `before_after_image_type`, `lead_activity_channel`, `lead_activity_direction`, `lead_activity_type`, `lead_status`, `portfolio_status`, `price_type`, `video_platform`. All defined before their dependent tables/columns in migration order — no ordering risk for a fresh replay.

## 21. Seed / demo data separation

**No seed/demo-data migration file exists.** Every migration file under `supabase/migrations/` is schema-only (`CREATE TABLE`/`ALTER TABLE`/`CREATE POLICY`/etc.) — none contain `INSERT` statements populating demo profiles, test reviews, or sample content. The real data currently live (`dharti-panchal`, `janvi-panchal`, their services/reviews/gallery/etc.) was entered through the running application (dashboard forms, admin actions), not through a seed script. **Conclusion: a clean replay of the migration files reproduces schema only — zero risk of accidentally seeding demo content into a production migration, because there is no seed script to accidentally run.** The `beautician_profiles.is_demo` boolean column exists (for a *possible* future demo-profile concept) but no row currently has it set — not a live seeding mechanism today.

## 22. Legacy / deprecated fields

Carried forward from Phase 3F.3A's audit, re-confirmed still accurate:

| Field | Classification |
|---|---|
| `beautician_profiles.rating` | Legacy — not read by public UI or structured data (Phase 3F.3A) |
| `beautician_profiles.review_count` | Legacy — same |
| `beautician_profiles.client_count` | Unverified — no dashboard/admin write path; still displayed read-only in `/admin/profiles` |
| `beautician_profiles.metrics_verified` | Deprecated — gates only the original demo-profile stat display (per the Phase 1 admin migration's own comment), unrelated to professional verification, never set `true` live |

New this phase: `idx_services_bp_slug` on `services` — functionally redundant now that `services_beautician_profile_id_slug_key` is confirmed to already provide the same guarantee (§4). Not deleted (per the audit-only, no-fix instruction).

## 23. Service-slug state verification (Phase 3F.4)

Confirmed live and matching the migration file exactly:
- `services.slug` column: `text`, nullable — present.
- `services_slug_format` CHECK constraint: present, `slug IS NULL OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`.
- `idx_services_bp_slug` unique index: present, `(beautician_profile_id, slug) WHERE slug IS NOT NULL` — see §4 for the redundancy note against the pre-existing `services_beautician_profile_id_slug_key`.
- All 5 of Dharti Panchal's services have a persisted, non-null slug (backfilled in the prior session turn) — zero remaining `NULL`s, zero duplicates.
- `updateService()` code confirmed (§8 of the Phase 3F.4 report, re-verified this phase by reading the source directly) to preserve an existing slug on every future name change.

## 24. SEO backend dependencies

`portfolio_seo` (title/description/robots/canonical overrides), `beautician_profiles.status`/`is_demo` (publish gating), `availability_settings.working_hours` (opening hours structured data), `services.slug`/`is_active`/description length (service-page eligibility, Phase 3F.4), and the RLS-scoped anon read path used by `portfolio-query.server.ts`/`service-page-query.server.ts` are the complete set of backend dependencies for SEO output. None of them depend on undocumented Lovable Cloud state — every one is a plain table/column already covered in migration files.

## 25. Future migration procedure (not executed)

1. Freeze writes / maintenance window.
2. Export schema (replay `supabase/migrations/*.sql` in filename order against a fresh Supabase project — see §4 for the one known-redundant-but-harmless index to optionally skip).
3. Provision destination project.
4. Replay reconciled migrations (all 13 files, chronological order; enums before dependent tables is already satisfied by file order).
5. Migrate Auth identities (see §11 — requires either raw `auth` schema dump access or a password-reset flow for existing users).
6. Migrate application tables (standard `pg_dump`/`pg_restore` of `public` schema data, or Supabase's own project-to-project migration tooling if available for the destination).
7. Migrate Storage files (see §13 Storage Migration Plan).
8. Recreate storage policies (4 policies, `portfolio-media` bucket, §12).
9. Recreate RLS/functions/triggers (already fully captured in migration files, §4/§7/§9).
10. Configure environment variables (§15 — 7 variables, all repo-known except `SUPABASE_SERVICE_ROLE_KEY` which must be freshly generated/retrieved from the destination project).
11. Validate row counts per table (§26).
12. Validate Storage object counts (§13).
13. Validate FK integrity (no orphans).
14. Run full application regression (`tsc`, ESLint, build, route smoke tests — the same suite used in every phase this session).
15. Change backend environment URL/key in the deployment target.
16. Production cutover.
17. Monitor.
18. Retain a rollback window (keep the Lovable Cloud project live/read-only for a defined period).

## 26. Future validation checklist (not executed — no destination exists)

Table row counts (all 26 tables) · profile counts by `status` · published portfolio count · services count (+ non-null slug count, + duplicate-slug check) · gallery image count · before/after count · video count · review count (+ published subset) · FAQ count · lead / lead_inquiry / lead_activity counts · Storage object count vs. `storage_path` reference count (detect orphans both directions) · Auth user count · broken-FK scan · unexpected-NULL scan on `NOT NULL`-intended-but-nullable-legacy columns · duplicate-slug scan (`beautician_profiles.slug`, `services.slug` per profile) · sample URL resolution check post-rewrite (§14).

## 27. GREEN / AMBER / RED risk matrix

| Area | Rating | Why |
|---|---|---|
| Database schema | 🟢 GREEN | Fully reproducible from migration files; one harmless redundant index found and documented |
| Migration history | 🟡 AMBER | No formal CLI-tracked migration-history table visible from this access path; reconciled by direct schema comparison instead, which is thorough but manual |
| RLS | 🟢 GREEN | Every policy traces to a migration file; shared-helper pattern fully documented |
| Functions / RPC | 🟢 GREEN | All 11 functions present in migrations and matching live definitions |
| Triggers | 🟢 GREEN | All 18 triggers traced to migration source |
| Auth | 🟡 AMBER | Standard email/password, well-documented — but real user migration (password hashes) is a genuine, unavoidable Supabase-platform limitation, not something this repo controls |
| Storage | 🟡 AMBER | Bucket + policies fully reproducible from migrations; but binaries themselves need a separate object-copy procedure (§13), and 3 columns store absolute URLs needing rewrite (§14) |
| Environment variables | 🟢 GREEN | Fully inventoried; only `SUPABASE_SERVICE_ROLE_KEY` isn't in the repo (expected — it's a secret, correctly excluded) |
| Lovable-specific dependencies | 🟡 AMBER | One build-time npm package (`@lovable.dev/vite-tanstack-config`) is a real dependency, though replaceable with standard Vite/TanStack tooling; everything else is dev-only/no-op in production |
| Application code | 🟢 GREEN | Uses only standard `@supabase/supabase-js` — no proprietary Lovable database/auth/storage SDK anywhere |
| SEO infrastructure | 🟢 GREEN | Fully backed by plain tables/columns, no undocumented state |
| CRM data | 🟢 GREEN | Full FK chain, enum evolution, and RPC all present and consistent between live DB and migrations |

No meaningless single overall percentage is given, per instruction — the matrix above is the answer.

## 28. Repository documentation created

- `docs/architecture/backend-portability.md` — this file.
- `docs/architecture/backend-portability-manifest.json` — machine-readable companion (tables, RPCs, storage buckets, env var names, critical triggers/indexes) — see §29 below.

## 29. Manual actions required from the user

- None required right now — this is an audit-only phase.
- When a real migration is eventually decided on: retrieving a **destination** project's `SUPABASE_SERVICE_ROLE_KEY` and other secrets will need to happen through whatever Supabase account will own the new project (not discoverable by the assistant, and not attempted here).
- If Auth user migration ever becomes necessary, expect to plan for a password-reset communication to existing users (§11) — no way around this with standard Supabase tooling.

## 30. Recommended remediation phases (not started)

1. **Low-risk schema cleanup**: drop the redundant `idx_services_bp_slug` OR the older `services_beautician_profile_id_slug_key` (keep one), once confirmed nothing depends on the specific index name. Purely cosmetic/performance, zero behavior change either way.
2. **Storage URL rewrite tooling**: a small, reusable script/migration-helper for rewriting the 3 absolute-URL columns (§14), ready to run only if/when an actual migration is approved.
3. **`SUPABASE_SERVICE_ROLE_KEY` decision**: either wire up a genuine admin use case for `supabaseAdmin` or remove the dormant generated file — currently harmless but worth a deliberate decision rather than leaving it unused indefinitely.

## 31. Phase 3F.4A.1 remediation record

Controlled cleanup performed against the confirmed live project (`ivbujlyilzmlublqzalu`, see the top of this document) after identity verification.

**A. Redundant index — removed.** Confirmed `services_beautician_profile_id_slug_key` (the original, full `UNIQUE (beautician_profile_id, slug)` constraint) already provides identical protection to `idx_services_bp_slug` (standard SQL: a plain UNIQUE index already treats every NULL as distinct, so it already permitted unlimited NULL slugs while rejecting duplicate non-null pairs). Dropped `idx_services_bp_slug` live. `services_slug_format` and all 5 existing persisted service slugs (Dharti Panchal) confirmed untouched. Duplicate protection re-verified with a deliberately-failing, rolled-back test insert against `hd-bridal-makeup` — correctly rejected with `23505 duplicate key value violates unique constraint "services_beautician_profile_id_slug_key"`, and a post-check confirmed no stray row was left behind (`count = 1`, unchanged). Matching repo migration: `supabase/migrations/20260824090000_drop_redundant_service_slug_index.sql`.

**B. Dormant service-role client — audited, kept as-is.** Repo-wide search confirmed `supabaseAdmin`/`createSupabaseAdminClient` (`src/integrations/supabase/client.server.ts`) has zero imports anywhere in application code, server functions, admin actions, build scripts, or tests. **Decision: not deleted.** The file is marked "automatically generated. Do not edit it directly" (Lovable-managed integration scaffold) — editing/removing it risks silent regeneration or conflicting with Lovable's own codegen assumptions, for no real benefit: an unimported module with a lazy-init `Proxy` has zero runtime footprint whether or not the file exists, so "the application doesn't depend on unused privileged code" is already true by construction. `SUPABASE_SERVICE_ROLE_KEY` was not rotated, exposed, or removed from Lovable Cloud.

**C. Storage URL rewrite tooling — created, not executed.** `supabase/tooling/rewrite-storage-origin.sql` — dry-run-first (read-only count + before/after preview), only rewrites rows whose value currently starts with the exact old origin, never touches `video_url`/`storage_path`/external platform links, idempotent (a completed rewrite naturally excludes itself from the WHERE clause on re-run). Not run against any database.

**D. Auth migration documentation — expanded.** See the rewritten §11 above: UUID-preservation-if-possible path, `profiles.auth_user_id`/`user_roles.user_id` remapping procedure, `handle_new_user()` trigger interaction warning, explicit password-reset requirement, and a post-migration validation checklist. No Auth change made.

**E. This document — updated** with the verified project reference, the §4/§11/§13 amendments above, and this record.

**Validation performed:**
- `tsc --noEmit` — clean
- ESLint — clean
- Production build — succeeds
- Live-verified: services list unchanged (5 rows, same slugs), sitemap unchanged, `/portfolio/dharti-panchal` and a sample service page unchanged, RLS policies unchanged (no policy touched — only an index was dropped), duplicate-slug protection re-verified working (see item A)
- Admin: not touched by this remediation (no admin-facing schema/RLS/code was in scope)

**Remaining AMBER risks** (unchanged from the original audit — this remediation narrowed §4 to closed and documented §11/§13 further, but did not change the underlying risk *level* for Auth or Storage, since nothing was executed): migration-history visibility, Auth (password migration limitation is a Supabase-platform constraint, not fixable from this repo), Storage (binaries still require a separate copy step when a real migration happens), Lovable-specific build dependency (`@lovable.dev/vite-tanstack-config`).

**Manual actions required:** none. No database write beyond the confirmed-safe index drop; no secret touched; no migration executed.

## 32. Migration tracking policy (Phase 3H / 3H.1)

Phase 3H's production launch readiness audit re-confirmed §5/§27's AMBER finding with a live count: **18 migration files exist under `supabase/migrations/` as of Phase 3H.1, but `supabase_migrations.schema_migrations` on the live project shows only 1 row (`20260814053705`, the original base migration).** Every migration file from `20260814053705` through `20260825220000` was applied via the verified Lovable MCP `query_database` connection (raw SQL, matching the file content), never through `supabase db push`/`migration up` — so the CLI's own tracking table was never updated for 17 of the 18 files, even though the live schema content has been exhaustively verified (§4, and every phase's own live-verification steps) to match what those files describe.

**This is untracked, not drifted.** No live schema change exists that isn't represented in a migration file, and no migration file describes something that isn't live.

**Operating policy (in effect as of Phase 3H.1):**

> BeautyFolio database schema changes must be applied through the verified Lovable MCP connection against project `ivbujlyilzmlublqzalu`, with a corresponding timestamped migration file preserved in the repository for every change, exactly as done throughout Phases 3F.4 through 3G.3D.

**Explicit safeguard:** **do not run `supabase db push`, `supabase migration repair`, or replay any historical migration file against this live project until the historical tracking gap above has been intentionally reconciled in its own dedicated phase.** Because the CLI's tracking table believes only 1 of 18 migrations has been applied, a blind CLI-driven push would attempt to re-run schema that already exists live — at best a no-op-if-idempotent, at worst a hard failure on `CREATE TABLE`/`ALTER TYPE ADD VALUE`/etc. statements that assume a clean slate. This policy is a process safeguard, not a schema change — no reconciliation was attempted in Phase 3H.1.

**Manual actions required:** none. This section is documentation only.
