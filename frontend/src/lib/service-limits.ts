// Shared, client-safe constants (Phase 3F.8 §7/§9/§29) — imported by both
// the dashboard form (client) and services.server.ts's authoritative
// server-side validation, so the two can never drift on a threshold.
export const MAX_INCLUDED_ITEMS = 12;
export const MAX_SUITABLE_FOR_ITEMS = 12;
export const MAX_LIST_ITEM_LENGTH = 120;
export const MAX_PREPARATION_NOTES_LENGTH = 1000;
