# Provider boundary

Generic contract: [`provider.ts`](./provider.ts) — `QaProvider`. No
BeautyFolio (or any project's) table/column names belong here; a concrete
adapter implements it, and project-specific test code passes schema details
in as arguments.

Supabase adapter: [`supabase-provider.ts`](./supabase-provider.ts) —
`SupabaseQaProvider` / `createSupabaseProviderFromEnv()`. The **only** place
`@supabase/supabase-js` may be imported from generic QA infrastructure.
Node-only — reads `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` from
`process.env` directly, never import this from a Playwright spec (browser
context) or from `tests/e2e/**`.

Secret-safe config check: [`env-validation.ts`](./env-validation.ts) —
reports missing variable _names_ only, never values.

Destructive-test safety gate: [`../safety-gate.ts`](../safety-gate.ts) —
`assertDestructiveQaAllowed()`. Every future create/update/delete method a
provider adds must be called only after this gate passes. Fail-closed: all
conditions independent, all must hold, missing evidence denies.

A future backend migration (Supabase → RDS/S3, etc.) only requires a new
file here implementing `QaProvider` — functional tests depend on the
interface, not on Supabase.

No destructive (create/update/delete) provider methods exist yet — reserved
for a later phase, once explicitly scoped alongside the safety gate that
must guard them.
