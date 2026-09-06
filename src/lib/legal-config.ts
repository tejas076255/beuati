// The ONE place every mutable legal/business detail lives — Privacy,
// Terms, Refund Policy, the signup acknowledgement, and the lead-form
// notice all import from here rather than hardcoding any of these
// values locally. Update this file when the business supplies real
// values; the legal pages themselves should never need editing for a
// contact-detail or date change.
//
// `legalEntityName` and `businessAddress` are deliberately left
// unset/omitted — inventing a registered company name or address would
// be a false statement, not a placeholder. `supportEmail` reflects the
// intended production address; see the LAUNCH BLOCKER note below.
export const legalConfig = {
  serviceName: "BeautyFolio",

  // Not yet a confirmed registered entity name — omitted rather than
  // guessed. When supplied, the legal pages should refer to this value
  // instead of just the "BeautyFolio" brand name.
  legalEntityName: null as string | null,

  // LAUNCH BLOCKER: this domain and mailbox do not exist yet. This is
  // the intended production support/legal contact address, recorded
  // here so it only needs to change in one place once it goes live —
  // it must not be treated as currently operational.
  supportEmail: "support@beautyfolio.in",
  supportEmailOperational: false,

  // Omitted until the business owner supplies one — never invent an
  // address to fill this field.
  businessAddress: null as string | null,

  governingLaw: "Laws of India",
  jurisdiction: "Ahmedabad, Gujarat, India",

  // ISO dates (YYYY-MM-DD) shown on every legal page. Update both when
  // a page's substance changes; effectiveDate should only move forward
  // when the actual terms change, not on every cosmetic edit.
  effectiveDate: "2026-09-06",
  lastUpdated: "2026-09-06",
} as const;
