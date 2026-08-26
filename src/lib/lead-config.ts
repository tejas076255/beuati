// Centralized CRM vocabulary for the Leads module. UI components read from
// these lists/maps instead of hard-coding source/status/type strings, so a
// new lead source, event type, follow-up type, or outcome can be added here
// without hunting through the dashboard components.
import type { Database } from "@/integrations/supabase/types";

export type LeadStatus = Database["public"]["Enums"]["lead_status"];
export type ActivityType = Database["public"]["Enums"]["lead_activity_type"];
export type ActivityChannel = Database["public"]["Enums"]["lead_activity_channel"];

// ---------- pipeline status ----------
// The `lead_status` enum (new/contacted/qualified/quoted/negotiation/booked/
// completed/lost/archived) is reused as-is; this only supplies the
// non-technical labels and pipeline order for the UI.
export const STATUS_ORDER: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "quoted",
  "negotiation",
  "booked",
  "completed",
  "lost",
  "archived",
];

export const STATUS_META: Record<LeadStatus, { label: string; className: string }> = {
  new: { label: "New", className: "border-primary/30 bg-primary/10 text-primary" },
  contacted: { label: "Contacted", className: "border-blue-200 bg-blue-50 text-blue-700" },
  qualified: { label: "Follow-up", className: "border-amber-200 bg-amber-50 text-amber-700" },
  quoted: { label: "Quoted", className: "border-violet-200 bg-violet-50 text-violet-700" },
  negotiation: {
    label: "Negotiation",
    className: "border-orange-200 bg-orange-50 text-orange-700",
  },
  booked: { label: "Confirmed", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  completed: { label: "Completed", className: "border-teal-200 bg-teal-50 text-teal-700" },
  lost: { label: "Lost", className: "border-border bg-secondary/60 text-muted-foreground" },
  archived: { label: "Closed", className: "border-border bg-secondary/40 text-muted-foreground" },
};

// Terminal stages that no longer need active follow-up chasing.
export const CLOSED_STATUSES: LeadStatus[] = ["completed", "lost", "archived"];

// ---------- lead source ----------
export const LEAD_SOURCES = [
  { value: "portfolio", label: "Portfolio" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "google", label: "Google" },
  { value: "referral", label: "Referral" },
  { value: "manual_entry", label: "Manual Entry" },
  { value: "other", label: "Other" },
] as const;

// Legacy values already stored in the database from before this config
// existed (e.g. the original public-form source string) — mapped here so
// old leads still display a friendly label.
const LEGACY_SOURCE_LABELS: Record<string, string> = {
  availability_request: "Portfolio",
};

export function sourceLabel(source: string | null): string {
  if (!source) return "Manual Entry";
  const known = LEAD_SOURCES.find((s) => s.value === source);
  if (known) return known.label;
  return LEGACY_SOURCE_LABELS[source] ?? source;
}

// ---------- event type ----------
export const EVENT_TYPES = [
  "Wedding",
  "Bridal",
  "Engagement",
  "Reception",
  "Party",
  "Pre-Wedding",
  "Photoshoot",
  "Other",
] as const;

// ---------- service location type ----------
export const LOCATION_TYPES = [
  { value: "studio", label: "At my studio" },
  { value: "client_location", label: "At client's location" },
  { value: "both", label: "Both" },
] as const;

export function locationTypeLabel(value: string | null): string {
  return LOCATION_TYPES.find((l) => l.value === value)?.label ?? "—";
}

// ---------- requested services checklist ----------
// Generic fallback categories, shown alongside the beautician's own service
// catalog (fetched at runtime) so the checklist reflects what they actually
// offer wherever possible, per the "reuse existing services" requirement.
export const DEFAULT_SERVICE_TAGS = [
  "Bridal Makeup",
  "HD Makeup",
  "Airbrush Makeup",
  "Party Makeup",
  "Hair Styling",
  "Nail Art",
  "Mehndi",
  "Eyelash",
  "Eyebrow",
  "Skin Treatment",
] as const;

// ---------- follow-up type ----------
// The activity/channel enums (call/whatsapp/sms/email + phone/whatsapp/sms/
// email/manual) don't have quite enough granularity to tell "In Person"
// apart from "Other" on their own, so the specific follow-up type label is
// additionally stored in the activity row's `metadata.followup_type` — the
// `value` below — while `channel` carries the closest DB-level category.
export const FOLLOWUP_TYPES: { value: string; label: string; channel: ActivityChannel }[] = [
  { value: "call", label: "Phone Call", channel: "phone" },
  { value: "whatsapp", label: "WhatsApp", channel: "whatsapp" },
  { value: "sms", label: "SMS", channel: "sms" },
  { value: "email", label: "Email", channel: "email" },
  { value: "in_person", label: "In Person", channel: "manual" },
  { value: "other", label: "Other", channel: "manual" },
];

export function followupTypeLabel(value: string | null | undefined): string {
  return FOLLOWUP_TYPES.find((t) => t.value === value)?.label ?? "Other";
}

export const FOLLOWUP_OUTCOMES = [
  "No response",
  "Discussed requirements",
  "Price shared",
  "Waiting for confirmation",
  "Interested",
  "Not interested",
  "Booking confirmed",
  "Follow up later",
  "Other",
] as const;

// Dedicated outcome list for the "Complete Follow-up" flow — deliberately
// shorter/more decisive than FOLLOWUP_OUTCOMES above (used when logging an
// in-progress follow-up), since completing one is a summary judgement.
export const COMPLETION_OUTCOMES = [
  "Interested",
  "Needs More Time",
  "Quote Requested",
  "Booking Confirmed",
  "Not Interested",
  "No Response",
  "Other",
] as const;

export function activityTypeLabel(type: ActivityType): string {
  switch (type) {
    case "call":
      return "Phone Call";
    case "whatsapp":
      return "WhatsApp";
    case "sms":
      return "SMS";
    case "email":
      return "Email";
    case "note":
      return "Note";
    case "status_change":
      return "Status change";
    case "follow_up":
      return "Follow-up";
    case "booking":
      return "Booking";
    default:
      return type;
  }
}
