# Provider boundary (placeholder)

Trusted DB/storage assertions (Layer 4) must not spread raw Supabase calls
across generic test code. When that layer is built, put the
Supabase-specific implementation behind a small adapter here (e.g.
`supabase-provider.ts`) exposing a generic interface (`getRow`,
`objectExists`, ...). Functional tests should depend on that interface, not
on `@supabase/supabase-js` directly — so a future migration to another
backend (RDS/S3, etc.) only requires a new provider implementation.

No provider is implemented yet — Phase QA-1B only reserves the directory.
