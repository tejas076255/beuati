# BeautyFolio QA Reference Seed Audit (QA-1D Step 3A)

**Outcome: no seed SQL file was generated.** The audit found that neither
candidate table (`specializations`, `service_categories`) is actually
required for a QA professional to set up a working profile, and no tracked
source evidence establishes canonical values for either — inventing them
would violate the "do NOT invent them" instruction. This document records
the audit and its conclusion; **nothing was applied to any database.**

## 1. Reference-data dependency inventory

Traced every table a new professional's setup flow touches, starting from
`ensureOwnPortfolio()` (`src/data/dashboard/provisioning.server.ts`):

| Table | Created by | External reference dependency |
|---|---|---|
| `profiles` | `handle_new_user()` trigger on signup | none |
| `user_roles` | same trigger (`role='beautician'`) | none |
| `beautician_profiles` | `ensureOwnPortfolio()` — inserts only `profile_id`, `slug`, `display_name`, `status='draft'` | **none** |
| `availability_settings` | Own server file (`availability.server.ts`), upserted on first dashboard visit | none |
| `portfolio_seo` | Own server file (`seo.server.ts`), upserted on first dashboard visit | none |
| `services` | Beautician's own form submission | **none** — `category` is a free-text column populated from a hardcoded in-app constant, not a DB table (see §2) |
| `packages`, `portfolio_items`, `before_after_items`, `portfolio_videos`, `reviews`, `service_areas`, `faqs` | Beautician's own form submissions | none |

**Conclusion: zero tables in the professional setup path have an external
reference-table dependency.** A QA professional can be created and can
create services/packages/etc. with the QA backend's reference tables
completely empty.

## 2. Specializations audit

Schema (`supabase/migrations/20260814053705_...sql`): `id, name, slug
(UNIQUE), description, is_active, sort_order, created_at`. RLS:
`spec_public_read` (anon+authenticated, `is_active`), `spec_admin_write`
(admin-only ALL). Table-level grants: SELECT to anon/authenticated, full
write later opened to `authenticated` in `20260819074500_...sql` but RLS
still restricts actual writes to admins.

**Usage:** admin-only CRUD via `src/data/admin/taxonomy.server.ts` +
`src/routes/admin.services.tsx` (a generic reference-table manager
component). Publicly read on the portfolio via the `beautician_specializations`
join (`src/data/portfolio-query.server.ts`) and rendered in
`portfolio-sections.tsx`.

**Critical finding: no beautician-facing UI writes to `beautician_specializations`
anywhere in `src/`.** Grepped the entire tree — the only write path visible
is a bare admin CRUD on `specializations` itself; nothing lets a
beautician attach a specialization to their own profile today. This is a
dormant/read-only-in-practice feature from the professional's perspective.

**Canonical values:** none found in any migration or app constant. The only
place specialization *names* ever appeared is `supabase/seed-demo-dharti.sql`
("Bridal Makeup", "HD Makeup") — explicitly excluded, real-demo-profile
content, not a designed taxonomy. **No confident canonical value set exists.**

## 3. Service categories audit

Schema: `id, name, slug (UNIQUE), description, sort_order, is_active,
created_at`. RLS: `svc_cat_public_read` (public, `is_active`),
`svc_cat_admin_write` (admin-only).

**Usage:** admin-only CRUD, same taxonomy-manager component as
specializations. **Critical finding:** `services.category_id` (the FK to
this table) is never written anywhere in `src/` — grepped for
`category_id` across `services.server.ts` and every admin data file, zero
hits. The actual beautician-facing Services form
(`src/components/services/services-manager.tsx:71`) uses a **hardcoded
in-app constant**, `CATEGORY_OPTIONS` (Bridal Makeup, Party/Occasion
Makeup, Makeup Services, Hair Services, Nail Services, Skin & Beauty,
Eyelash & Eyebrow, Mehndi, Other), written into the free-text
`services.category` TEXT column — **completely independent of the
`service_categories` table.** The code comment at that line confirms this
was a deliberate design choice ("Phase 3F.6... service_categories taxonomy
table isn't wired up here instead").

**Conclusion: `service_categories` is dormant for the beautician flow.**
It only matters for testing the Admin Taxonomy Manager UI itself.

**Canonical values:** `CATEGORY_OPTIONS` is real, tracked, current source
evidence — but it populates a free-text column directly, not this table.
Using those same strings as `service_categories` rows would be a plausible,
low-risk choice *if* seeding were needed, but per §6 below it currently
isn't.

## 4. Other candidate tables

`availability_settings` and `portfolio_seo`, both named as candidates in
the phase brief: confirmed **profile-owned**, not shared reference/lookup
tables (one row per `beautician_profile_id`, created lazily by each
professional's own dashboard visit). Per the phase's own default rule
("do NOT seed profile-owned tables... created later by normal application
provisioning"), these are correctly excluded from any reference seed.

## 5. Classification summary

| Table | Classification |
|---|---|
| `specializations` | **B. Optional reference data** — not required by any current write path; safe to leave empty |
| `service_categories` | **B. Optional reference data** — not required by any current write path; safe to leave empty |
| `availability_settings`, `portfolio_seo` | Profile-owned — not reference data at all, never seed |
| `profiles`, `user_roles`, `beautician_profiles`, `beautician_specializations`, `services`, `packages`, `package_services`, `portfolio_items`, `portfolio_images`, `before_after_items`, `before_after_images`, `portfolio_videos`, `reviews`, `service_areas`, `faqs`, `leads`, `lead_inquiries`, `lead_inquiry_services`, `lead_activities`, `audit_logs`, `portfolio_events` | **D. Production/business data — never seed** (all confirmed profile/user-owned or append-only audit/analytics, no purely-structural subset found in any of them) |

No table was found to contain a purely-structural, non-user-owned subset
that would justify an exception to the §7 exclusion list.

## 6. Why no seed SQL was generated

Two independent reasons, either alone sufficient to stop here:

1. **Not required.** The full provisioning/setup dependency trace (§1)
   shows zero external reference-table dependency anywhere in the QA
   professional setup path. Creating `qa-professional-a`/`qa-professional-b`
   today, with both reference tables empty, causes **no** empty dropdown,
   no missing option, no invalid readiness state, no FK error, and no
   manager failure (see §7 detail below).
2. **No canonical values to seed confidently.** No migration, no tracked
   app constant, and no non-demo source establishes real
   `specializations`/`service_categories` row values. `CATEGORY_OPTIONS`
   is real but belongs to a different, DB-independent mechanism. Inventing
   plausible-sounding category/specialization names to fill this table
   would violate the explicit "do NOT invent them" instruction.

## 7. Consequence of proceeding to Step 3B without any reference seed

| Flow | Consequence of empty `specializations`/`service_categories` |
|---|---|
| Create `qa-professional-a`/`-b` (auth + profile + role + `beautician_profiles`) | **None** — zero dependency |
| Create a service via the dashboard form | **None** — category picker is the hardcoded `CATEGORY_OPTIONS` list, not DB-backed |
| Public portfolio page render | **None** — `specializations` badge section renders an empty list gracefully (maps over `profile.specializations`, which is simply `[]` when `beautician_specializations` has no rows) |
| Admin Taxonomy Manager (`/admin/services`) | Shows empty category/specialization lists — expected and correct until an admin (or a later, deliberately-scoped QA fixture) adds some; not a defect |

**No blocker exists.** Step 3B (QA identity creation) may proceed without
any reference seed.

## 8. QA identity provisioning prerequisites (planning only — Step 3B, not this step)

| Identity | `auth.users` | `profiles` | `user_roles` | `beautician_profiles` | Notes |
|---|---|---|---|---|---|
| `qa-admin` | Created via admin auth API | Auto (trigger) | Auto row (`beautician`) + a **second** row (`admin`) — the first admin grant must be a service-role insert, since `user_roles_admin_insert` RLS requires an existing admin to grant the role | Not required (admin doesn't need a portfolio) | Slug/email must use `QA_PROFILE_SLUG_PREFIX`/a recognizable QA-only address |
| `qa-professional-a` | Created via admin auth API | Auto | Auto (`beautician`) | Created via `ensureOwnPortfolio()` (app's own provisioning call), slug prefixed `qa-test-` | No reference-table dependency, per this audit |
| `qa-professional-b` | Same pattern | Auto | Auto | Same, distinct slug e.g. `qa-test-professional-b` | Used for cross-tenant isolation testing |

All three still require `assertDestructiveQaAllowed()` to pass with
`QA_ALLOW_WRITES=true` set only for the controlled creation window, exactly
as already demonstrated safe in QA-1C/QA-1D.
