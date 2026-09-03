// Server-only. Pure, DB-free helpers for the lead-arrival notification
// email: content building and the "genuinely new vs. idempotent replay"
// decision. Kept free of any Supabase/network access so both can be unit
// tested directly, with no live backend and no timing flakiness.
import { absoluteUrl } from "@/lib/site-url";

export interface LeadNotificationLead {
  name: string | null;
  phone: string | null;
  location: string | null;
  event_date: string | null;
  message: string | null;
  service_requested: string | null;
  source: string | null;
}

export interface LeadNotificationEmail {
  subject: string;
  text: string;
}

/**
 * submit_lead() only ever returns a lead id — it never distinguishes a
 * genuinely new enquiry from its own ~5-minute idempotent-replay
 * short-circuit (see
 * supabase/migrations/20260825180000_submit_lead_phone_validation_and_dedup.sql).
 * On a genuine new (or genuinely distinct repeat) enquiry the RPC always
 * inserts a new lead_inquiries row; on a suppressed replay it returns early
 * and inserts nothing. So: the caller captures the moment just before
 * calling the RPC, then this compares it against the latest lead_inquiries
 * row's created_at for the returned lead id. A row from BEFORE that moment
 * means the RPC took the replay branch, and no notification should be sent
 * (the original submission already triggered one). This assumes the app
 * server and database clocks are reasonably in sync, the same assumption
 * every other created_at comparison in this codebase already relies on.
 */
export function shouldNotifyForInquiry(
  requestStartedAtIso: string,
  latestInquiryCreatedAtIso: string | null,
): boolean {
  if (!latestInquiryCreatedAtIso) return false;
  return new Date(latestInquiryCreatedAtIso).getTime() >= new Date(requestStartedAtIso).getTime();
}

function line(label: string, value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? `${label}: ${trimmed}` : null;
}

/**
 * Operational-only content — deliberately an ENQUIRY / AVAILABILITY
 * REQUEST throughout, never a booking/appointment/reservation, matching
 * the same product rule already enforced in the public form's own success
 * copy ("This is a request, not a confirmed booking.").
 */
export function buildLeadNotificationEmail(
  lead: LeadNotificationLead,
  professionalName: string,
): LeadNotificationEmail {
  const subject = "New BeautyFolio enquiry";
  const bodyLines = [
    `Hi ${professionalName},`,
    "",
    "You've received a new enquiry / availability request through your BeautyFolio portfolio.",
    "",
    line("Customer name", lead.name),
    line("Phone", lead.phone),
    line("Location", lead.location),
    line("Requested service", lead.service_requested),
    line("Preferred date", lead.event_date),
    line("Message", lead.message),
    line("Source", lead.source),
    "",
    `Open your BeautyFolio Leads dashboard to respond: ${absoluteUrl("/dashboard/leads")}`,
    "",
    "This is an enquiry, not a confirmed booking.",
  ].filter((entry): entry is string => entry !== null);

  return { subject, text: bodyLines.join("\n") };
}
