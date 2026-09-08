# BeautyFolio QA Bootstrap Plan (QA-1D Step 2A)

Companion document to `beautyfolio-qa-schema.sql`. **Nothing in this file has
been applied to any database.** Written for review before Step 2B.

## 1. Schema export method actually used

No live, high-fidelity introspection method (pg_dump, Supabase CLI, MCP
Management API) was available in this environment without requesting new
source-DB credentials — the Supabase MCP connection is authenticated but the
platform API denies access to project `ivbujlyilzmlublqzalu` ("your account
does not have the necessary privileges... access token may be scoped to a
different organization"), and the Supabase CLI has no access token
configured (`supabase login` never run). Requesting either was out of scope
per this phase's explicit instructions.

**Method used:** full read of all 25 files in `supabase/migrations/`,
cross-checked object-for-object against `src/integrations/supabase/types.ts`
(Lovable's own live-generated types file — not authored by this session).
**Result: 26/26 tables and all 11 enum types match exactly** between
migrations and generated types. This is strong corroborating evidence for
table/column/enum shape, but it **cannot verify** RLS policy text, trigger
bodies, function bodies, index definitions, or grants — those exist only in
the migration files, and the architecture note's warning ("migration history
is NOT guaranteed to be a complete reconstruction") applies fully to those.

## 2. Storage bootstrap plan (NOT executed)

**Bucket:** `portfolio-media`
- Public: `true` (confirmed via `setup-portfolio-media-bucket.sql`'s
  `insert into storage.buckets (id, name, public) values ('portfolio-media',
  'portfolio-media', true)`)
- File-size limit / MIME restrictions: **not found in any tracked file** —
  if configured on the live bucket, it was set via the Supabase dashboard,
  out of band. **SOURCE-ONLY / unverifiable without live introspection.**
- Path convention (app-enforced, not DB-enforced):
  `profiles/{beautician_profile_slug}/{profile|gallery|before-after|videos}/{filename}`
  (per `src/lib/storage-upload.ts`, `src/lib/storage-path.ts`)

**Storage policies** (from `20260821054621_portfolio_media_storage_policies.sql`
+ hardening in `20260827090000_p2_security_relational_hardening.sql`):
| Policy | Operation | Role | Rule |
|---|---|---|---|
| `portfolio_media_public_read` | SELECT | anon, authenticated | `bucket_id = 'portfolio-media'` |
| `portfolio_media_owner_insert` | INSERT | authenticated | bucket + first path segment `profiles` + slug ownership via `owns_beautician_profile_by_slug()` |
| `portfolio_media_owner_delete` | DELETE | authenticated | same as insert |
| (no UPDATE policy — uploads never overwrite in place, confirmed in `storage-upload.ts`) | | | |

**Step 2B action:** create the `portfolio-media` bucket (public) + apply
these 3 storage policies + the `owns_beautician_profile_by_slug()` function
dependency. **Storage objects/files themselves must never be copied** — QA
will start with an empty bucket.

## 3. Auth bootstrap plan (NOT executed — identities not created)

Three future QA identities, not created in this step:

| Identity | Purpose | Rows it will require once created |
|---|---|---|
| `qa-admin` | Admin console testing | `auth.users` row → `handle_new_user()` trigger auto-creates `profiles` + `user_roles(role='beautician')` → a **second** `user_roles` row must be inserted/updated to `role='admin'` (via the existing `user_roles_admin_insert` policy, itself admin-gated — so the very first admin requires a service-role insert, matching how the real BeautyFolio admin was almost certainly first provisioned) |
| `qa-professional-a` | Primary owner-flow testing (dashboard CRUD, leads, etc.) | `auth.users` row → auto `profiles` + `user_roles('beautician')` → a `beautician_profiles` row (slug prefixed `qa-test-`, e.g. `qa-test-professional-a`) created by the owner themselves via the app's own provisioning flow (`ensureOwnPortfolio`, confirmed in `src/data/dashboard/provisioning.server.ts` from earlier phases) — never inserted directly by a bootstrap script |
| `qa-professional-b` | Cross-tenant isolation testing (confirming A can never read/write B's data) | Same pattern as professional-a, distinct slug e.g. `qa-test-professional-b` |

All three require `auth.users` creation, which is **explicitly out of scope
for schema bootstrap** per this phase's instructions ("AUTH users are NOT
part of schema bootstrap"). Step 2B / a later step must use Supabase's admin
auth API (service-role) to create these three users, gated by the same
`assertDestructiveQaAllowed()` safety gate already built in QA-1C.

## 4. Seed / reference data classification

| Candidate | Classification | Reasoning |
|---|---|---|
| `specializations` rows (e.g. "Bridal Makeup", "HD Makeup") | **A. Structural/reference — safe to reproduce** | Public taxonomy, not customer/professional content. Currently only ever inserted via the excluded demo seed script (`ON CONFLICT (slug) DO NOTHING`), so QA starts with **zero** rows unless deliberately seeded later — not included in this bootstrap SQL (would be DML). |
| `service_categories` rows | **A. Structural/reference — safe to reproduce** | Same reasoning as specializations. Not currently seeded anywhere in migrations (dormant, app has no visible category picker driven by this table in the audited routes — flagged for confirmation, not assumed). |
| `beautician_profiles`, `services`, `packages`, `reviews`, `service_areas`, `faqs`, `portfolio_items`/`images`, `before_after_*`, `portfolio_videos`, `leads` rows from `seed-demo-dharti.sql` / `link-demo-media.sql` | **C. Production/business data — NEVER copy** | Real professional's real name, phone, email, address, bio, and real customer review names. Explicitly excluded from the bootstrap SQL; not to be reproduced under any identity, including `is_demo=true` rows. |
| `auth.users` rows | **C. Never copy** | Out of scope per instructions; QA identities are created fresh, not copied. |

**No reference/lookup rows are included in `beautyfolio-qa-schema.sql`** —
it is genuinely schema-only. If `specializations`/`service_categories`
reference rows are later judged necessary for realistic QA fixtures, that is
a **B. test fixture to generate later** decision for Step 2B/2C, using
synthetic values, not copied from source.

## 5. Step 2B apply strategy (design only — NOT executed)

```
1. Resolve provider.identity().backendRef via createSupabaseProviderFromEnv()
2. FAIL CLOSED if backendRef !== QA_EXPECTED_PROJECT_REF (tidymcyhgxzqhpbmcmyr)
3. FAIL CLOSED if backendRef === any ref in beautyfolioProject.protectedBackendRefs
   (ivbujlyilzmlublqzalu) — redundant with #2 by construction, defense in depth
4. Require QA_ALLOW_WRITES=true, set ONLY for this controlled execution window
   (never left true in a committed .env.test default)
5. Apply beautyfolio-qa-schema.sql inside a single transaction where the
   Postgres/Supabase apply path permits (CREATE TYPE cannot run inside the
   same transaction as a later statement that uses the new enum value in
   some Postgres versions — verify per-statement transactionality before
   Step 2B; batch by natural migration boundaries if a single transaction
   isn't possible, since each original migration file was itself designed
   to apply atomically)
6. Apply storage bucket + 3 storage policies (see §2)
7. Run the full validation plan (§6 below)
8. Immediately set QA_ALLOW_WRITES back to false in the operator's local
   .env.test after the controlled window closes
```

## 6. Validation plan for Step 2B (exact checks, designed now)

| # | Check | Method |
|---|---|---|
| 1 | All 26 tables present | `provider` read of `information_schema.tables` or `list_tables` equivalent once live introspection is available on the QA project (a personal-org-scoped connection may work there even though it doesn't for the source) |
| 2 | All 11 enum types present with correct value sets | Compare against the exact lists in this document (§ "authoritative live schema inventory" in the main report) |
| 3 | All 11 functions present, all SECURITY DEFINER ones retain `SET search_path` | Source inspection + `pg_proc` query |
| 4 | All 21 triggers present and attached to the correct table | `information_schema.triggers` |
| 5 | RLS enabled on all 26 tables | `pg_tables`/`pg_class.relrowsecurity` |
| 6 | 57 policies present (54 table + 3 storage) | `pg_policies` |
| 7 | `portfolio-media` bucket exists, `public=true` | `storage.buckets` read |
| 8 | 3 storage policies present | `pg_policies` filtered to `storage.objects` |
| 9 | Zero rows in every business table | `SELECT count(*)` per table = 0 |
| 10 | Zero `auth.users` beyond whatever Supabase itself seeds | read-only count |
| 11 | Provider health check passes | `SupabaseQaProvider.healthCheck()` — already proven working in QA-1D Step 1 |
| 12 | Trusted schema read passes | A new read-only check (e.g. `getRow('specializations', {})` returning `null` on an empty seeded table, or a `beautician_profiles` count of 0) — **not** the existing `beautyfolio-trusted-read.test.ts`, which intentionally looks for the real `dharti-panchal` row that must never exist on QA |

## 7. Security review of generated SQL

| Item | Finding | Classification |
|---|---|---|
| SECURITY DEFINER functions (11 total) | All have explicit `SET search_path = public` (or `SET search_path TO 'public'`) — the correct hardening against search_path hijacking | **COPY-AS-CURRENT** |
| PUBLIC/anon grants | All `anon` grants are SELECT-only on public-facing tables (RLS still filters by publish-state) or EXECUTE on the two intentionally-public RPCs (`submit_lead`, `record_portfolio_event`) — no broad/superuser-shaped grant found | **COPY-AS-CURRENT** |
| `REVOKE ... FROM PUBLIC` (7 occurrences) | Existing hardening already present in the P2 migration (`has_role`, `log_admin_action`, both `submit_lead` overloads) | **COPY-AS-CURRENT** |
| Storage bucket file-size/MIME limits | Not present in any tracked file/migration | **SOURCE-ONLY / unverifiable** — flag for live confirmation before treating QA parity as complete, not a security defect to fix here |
| RLS bypass risk | None found — every table has RLS enabled and at least one policy; ownership checks consistently route through `owns_beautician_profile()`/`owns_beautician_profile_by_slug()`/`is_published_profile()` | **COPY-AS-CURRENT** |

No "improvements" over current production behavior were made in this
artifact — test parity with the real backend comes first, per the phase
instructions.
