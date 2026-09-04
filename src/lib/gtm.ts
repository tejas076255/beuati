// Shared GTM container ID validation/normalization — the single
// application-layer rule for Admin's per-portfolio tracking config, mirrors
// the existing src/lib/phone.ts convention (one small shared file, used by
// both the write path and any UI that needs to pre-validate). The database
// CHECK constraint on portfolio_tracking_settings.gtm_container_id enforces
// the same shape as defense-in-depth — this file is not the sole guard.
const GTM_ID_PATTERN = /^GTM-[A-Z0-9]{4,10}$/;

/** Trims and uppercases — GTM container IDs are conventionally uppercase;
 * never persisted in any other case. */
export function normalizeGtmContainerId(raw: string): string {
  return raw.trim().toUpperCase();
}

/** True only for a canonical `GTM-XXXXXXX`-shaped container ID. Never
 * accepts arbitrary script/snippet text — this is the one input this
 * feature ever stores. */
export function isValidGtmContainerId(value: string): boolean {
  return GTM_ID_PATTERN.test(value);
}
