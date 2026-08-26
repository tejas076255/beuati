// Shared phone normalization/validation — the single application-layer rule
// used by both the public Availability form (portfolio-sections.tsx) and
// the dashboard's manual Add Lead form (Phase 3G.2A §3), so the two paths
// can never disagree. Deliberately country-agnostic (8–15 digits after
// stripping non-digits) rather than hardcoded to India's 10-digit mobile
// format — matches the authoritative server-side rule already enforced in
// submit_lead() (Phase 3G.1A). This is a client-side/application-layer
// convenience only; each server path still enforces its own authoritative
// check (the SQL RPC for public submissions, createLead() for manual adds)
// so a crafted request can never bypass validation by skipping this file.
export function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidPhone(value: string): boolean {
  const digits = normalizePhoneDigits(value);
  return digits.length >= 8 && digits.length <= 15;
}

export const INVALID_PHONE_MESSAGE = "Enter a valid phone number.";
