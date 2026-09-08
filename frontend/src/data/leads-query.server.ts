// Server-only. Owner-scoped leads/CRM data access for the Leads dashboard.
// Every function here expects an RLS-scoped Supabase client (the one handed
// back by requireSupabaseAuth's middleware context) — never the anon client
// from portfolio-query.server.ts and never the service-role admin client.
// The owner-only RLS policies on leads/lead_inquiries/lead_inquiry_services/
// lead_activities do the actual access control; these functions intentionally
// do not re-implement that filtering.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables, TablesInsert } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./dashboard/shared.server";
import { isValidPhone, normalizePhoneDigits, INVALID_PHONE_MESSAGE } from "@/lib/phone";
import { sourceLabel } from "@/lib/lead-config";

type LeadStatus = Database["public"]["Enums"]["lead_status"];
type ActivityType = Database["public"]["Enums"]["lead_activity_type"];
type ActivityChannel = Database["public"]["Enums"]["lead_activity_channel"];

export type LeadInquiry = Tables<"lead_inquiries"> & { services: string[] };
export type LeadWithInquiry = Tables<"leads"> & {
  /** The single latest inquiry — kept for the existing List/Cards/Pipeline
   * views and quick-summary reads, which only ever need the current
   * snapshot. */
  inquiry: LeadInquiry | null;
  /** Phase 3G.3D — every inquiry belonging to this customer, newest first.
   * The underlying query already fetches all of them via the join below;
   * this just stops discarding everything past index 0, so the customer
   * detail workspace can render full enquiry history with zero additional
   * queries (§24). */
  inquiries: LeadInquiry[];
};
export type LeadActivity = Tables<"lead_activities">;

const CONTACT_ACTIVITY_TYPES: ActivityType[] = [
  "call",
  "whatsapp",
  "sms",
  "email",
  "follow_up",
  "booking",
];

function mapInquiry(
  raw: Tables<"lead_inquiries"> & { lead_inquiry_services: { service_tag: string }[] },
): LeadInquiry {
  const { lead_inquiry_services, ...inquiry } = raw;
  return { ...inquiry, services: lead_inquiry_services.map((s) => s.service_tag) };
}

export async function listOwnLeadsWithInquiry(
  supabase: SupabaseClient<Database>,
): Promise<LeadWithInquiry[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("*, lead_inquiries(*, lead_inquiry_services(service_tag))")
    .order("created_at", { ascending: false })
    .order("created_at", { foreignTable: "lead_inquiries", ascending: false });

  if (error) {
    console.error("[leads-query] failed to list leads", error);
    throw new Error(`Failed to load leads: ${error.message}`);
  }

  return (data ?? []).map(({ lead_inquiries, ...lead }) => {
    const inquiries = lead_inquiries.map(mapInquiry);
    return {
      ...lead,
      inquiry: inquiries[0] ?? null,
      inquiries,
    };
  });
}

/**
 * Count of leads still in the default "new" status — used as the dashboard's
 * unread-lead badge. No separate read/unread column needed: submit_lead()
 * always inserts with status='new', and it naturally leaves that count once
 * the owner changes the status to anything else.
 */
export async function countNewLeads(supabase: SupabaseClient<Database>): Promise<number> {
  const { count, error } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  if (error) {
    console.error("[leads-query] failed to count new leads", error);
    throw new Error(`Failed to count new leads: ${error.message}`);
  }

  return count ?? 0;
}

export async function getLeadActivities(
  supabase: SupabaseClient<Database>,
  leadId: string,
): Promise<LeadActivity[]> {
  const { data, error } = await supabase
    .from("lead_activities")
    .select("*")
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: false });

  if (error) {
    console.error("[leads-query] failed to load activities", { leadId, error });
    throw new Error(`Failed to load activity timeline: ${error.message}`);
  }

  return data ?? [];
}

export interface LeadCoreInput {
  name: string;
  phone: string;
  email: string | null;
  source: string;
}

export interface LeadInquiryInput {
  event_date: string | null;
  event_type: string | null;
  num_persons: number | null;
  location_type: string | null;
  venue_area: string | null;
  requirement: string | null;
  budget: number | null;
  special_requirements: string | null;
  services: string[];
}

async function replaceInquiryServices(
  supabase: SupabaseClient<Database>,
  inquiryId: string,
  services: string[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("lead_inquiry_services")
    .delete()
    .eq("inquiry_id", inquiryId);
  if (deleteError) {
    throw new Error(`Failed to update requested services: ${deleteError.message}`);
  }

  const rows: TablesInsert<"lead_inquiry_services">[] = Array.from(new Set(services))
    .filter((tag) => tag.trim().length > 0)
    .map((tag) => ({ inquiry_id: inquiryId, service_tag: tag.trim() }));

  if (rows.length === 0) return;
  const { error: insertError } = await supabase.from("lead_inquiry_services").insert(rows);
  if (insertError) {
    throw new Error(`Failed to save requested services: ${insertError.message}`);
  }
}

/**
 * Phase 3G.3A §19 — `source` here is the enquiry-level origin (the same
 * LEAD_SOURCES vocabulary the "Add Lead" dialog already offers — no new
 * options invented). Manually created inquiries never carry UTM/landing/
 * conversion/referrer/cta_location values, since none of that is genuinely
 * known for a manually entered enquiry; those columns are left NULL by
 * omission below.
 */
async function insertInquiry(
  supabase: SupabaseClient<Database>,
  leadId: string,
  inquiry: LeadInquiryInput,
  source: string,
): Promise<string> {
  const { data: inquiryRow, error: inquiryError } = await supabase
    .from("lead_inquiries")
    .insert({
      lead_id: leadId,
      event_date: inquiry.event_date,
      event_type: inquiry.event_type,
      num_persons: inquiry.num_persons,
      location_type: inquiry.location_type,
      venue_area: inquiry.venue_area,
      requirement: inquiry.requirement,
      budget: inquiry.budget,
      special_requirements: inquiry.special_requirements,
      source,
    })
    .select("id")
    .single();

  if (inquiryError || !inquiryRow) {
    console.error("[leads-query] failed to create inquiry", inquiryError);
    throw new Error(`Failed to save inquiry details: ${inquiryError?.message ?? "unknown error"}`);
  }

  await replaceInquiryServices(supabase, inquiryRow.id, inquiry.services);
  return inquiryRow.id;
}

function normalizedServiceSet(services: string[]): string {
  return Array.from(new Set(services.map((s) => s.trim().toLowerCase())))
    .sort()
    .join("|");
}

export interface CreateLeadResult {
  id: string;
  /** True when this enquiry was attached to an already-existing customer
   * lead rather than creating a new one (Phase 3G.2A §4/§7). */
  reused: boolean;
  /** The customer's existing canonical name — only set when `reused` is
   * true, so the UI can show "Existing customer found: {name}" without a
   * second query. */
  existingName: string | null;
}

/**
 * Phase 3G.2A §4/§6/§7/§8/§9/§12/§13 — an existing customer was found by
 * normalized phone within this beautician profile. Adds a new
 * lead_inquiries row for this enquiry (unless it's an accidental duplicate
 * of one submitted in the last 5 minutes for the same service(s) + event
 * date — the same idempotency window submit_lead() uses, Phase 3G.1A §6)
 * and refreshes only the "current enquiry" snapshot fields on the lead —
 * never the customer's name, phone, source, status, or follow-up state,
 * since those represent customer identity / pipeline progress, not the
 * latest enquiry's details (§8/§12/§13). `lead_inquiries` has no
 * inquiry-level source column (audited — see §9 in the phase report), so
 * this enquiry's source is preserved durably in the activity note instead
 * of being silently lost when `leads.source` isn't overwritten.
 */
async function reuseExistingLead(
  supabase: SupabaseClient<Database>,
  existing: { id: string; name: string | null; phone: string | null },
  core: LeadCoreInput,
  inquiry: LeadInquiryInput,
): Promise<CreateLeadResult> {
  const { data: recentInquiries, error: recentError } = await supabase
    .from("lead_inquiries")
    .select("id, event_date, created_at, lead_inquiry_services(service_tag)")
    .eq("lead_id", existing.id)
    .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());
  if (recentError) {
    throw new Error(`Failed to check recent enquiries: ${recentError.message}`);
  }

  const newServiceSet = normalizedServiceSet(inquiry.services);
  const isDuplicate = (recentInquiries ?? []).some((ri) => {
    const tags = (ri.lead_inquiry_services ?? []).map((s) => s.service_tag);
    return (
      (ri.event_date ?? null) === (inquiry.event_date ?? null) &&
      normalizedServiceSet(tags) === newServiceSet
    );
  });

  if (isDuplicate) {
    return { id: existing.id, reused: true, existingName: existing.name };
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      event_date: inquiry.event_date,
      location: inquiry.venue_area,
      message: inquiry.requirement,
      service_requested: inquiry.services[0] ?? null,
    })
    .eq("id", existing.id);
  if (updateError) {
    throw new Error(`Failed to update customer record: ${updateError.message}`);
  }

  // Enrich a missing email only — never overwrite one the customer already has.
  if (core.email?.trim()) {
    await supabase
      .from("leads")
      .update({ email: core.email.trim() })
      .eq("id", existing.id)
      .is("email", null);
  }

  await insertInquiry(supabase, existing.id, inquiry, core.source);

  await supabase.from("lead_activities").insert({
    lead_id: existing.id,
    activity_type: "note",
    channel: "manual",
    body: `New enquiry added manually via ${sourceLabel(core.source)}.`,
  });

  return { id: existing.id, reused: true, existingName: existing.name };
}

/**
 * Creates or reuses a lead manually from the dashboard's "Add Lead" form —
 * both Quick Add and Full Details call this same function, so both get
 * identical validation/customer-matching behavior (Phase 3G.2A §15), and a
 * crafted request hitting the server function directly gets the same
 * authoritative checks as the dialog UI (§20). Mirrors the public
 * submit_lead() identity model (Phase 3G.1A): one customer per
 * (beautician_profile_id, normalized phone), many lead_inquiries — never a
 * second, competing deduplication model.
 */
export async function createLead(
  supabase: SupabaseClient<Database>,
  userId: string,
  core: LeadCoreInput,
  inquiry: LeadInquiryInput,
): Promise<CreateLeadResult> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);

  if (!isValidPhone(core.phone)) {
    throw new Error(INVALID_PHONE_MESSAGE);
  }
  const normalizedPhone = normalizePhoneDigits(core.phone);

  // Phase 3G.2A §4/§21 — match scoped strictly to this beautician profile,
  // never globally. A profile's own lead list is never large enough to
  // justify a dedicated SQL matching function; this reuses the same
  // digits-only comparison submit_lead() enforces server-side.
  const { data: candidates, error: candidatesError } = await supabase
    .from("leads")
    .select("id, name, phone")
    .eq("beautician_profile_id", bpId);
  if (candidatesError) {
    throw new Error(`Failed to check for an existing customer: ${candidatesError.message}`);
  }
  const existing = (candidates ?? []).find(
    (c) => normalizePhoneDigits(c.phone ?? "") === normalizedPhone,
  );

  if (existing) {
    return reuseExistingLead(supabase, existing, core, inquiry);
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      beautician_profile_id: bpId,
      name: core.name.trim(),
      phone: core.phone.trim(),
      email: core.email?.trim() || null,
      source: core.source,
      status: "new",
      // Legacy single-inquiry columns kept in sync for anything that still
      // reads them directly (e.g. the sidebar badge count query).
      event_date: inquiry.event_date,
      location: inquiry.venue_area,
      message: inquiry.requirement,
      service_requested: inquiry.services[0] ?? null,
    })
    .select("id")
    .single();

  if (leadError || !lead) {
    console.error("[leads-query] failed to create lead", leadError);
    throw new Error(`Failed to create lead: ${leadError?.message ?? "unknown error"}`);
  }

  await insertInquiry(supabase, lead.id, inquiry, core.source);

  await supabase.from("lead_activities").insert({
    lead_id: lead.id,
    activity_type: "note",
    channel: "manual",
    body: "Lead added manually.",
  });

  return { id: lead.id, reused: false, existingName: null };
}

/** Updates a lead's core profile plus its primary inquiry (creating one if none exists yet). */
export async function updateLead(
  supabase: SupabaseClient<Database>,
  leadId: string,
  core: LeadCoreInput,
  inquiry: LeadInquiryInput,
  existingInquiryId: string | null,
): Promise<void> {
  const { error: leadError } = await supabase
    .from("leads")
    .update({
      name: core.name.trim(),
      phone: core.phone.trim(),
      email: core.email?.trim() || null,
      source: core.source,
      event_date: inquiry.event_date,
      location: inquiry.venue_area,
      message: inquiry.requirement,
      service_requested: inquiry.services[0] ?? null,
    })
    .eq("id", leadId);

  if (leadError) {
    console.error("[leads-query] failed to update lead", { leadId, leadError });
    throw new Error(`Failed to update lead: ${leadError.message}`);
  }

  let inquiryId = existingInquiryId;
  if (inquiryId) {
    const { error: inquiryError } = await supabase
      .from("lead_inquiries")
      .update({
        event_date: inquiry.event_date,
        event_type: inquiry.event_type,
        num_persons: inquiry.num_persons,
        location_type: inquiry.location_type,
        venue_area: inquiry.venue_area,
        requirement: inquiry.requirement,
        budget: inquiry.budget,
        special_requirements: inquiry.special_requirements,
      })
      .eq("id", inquiryId);
    if (inquiryError) {
      throw new Error(`Failed to update inquiry details: ${inquiryError.message}`);
    }
  } else {
    const { data: created, error: createError } = await supabase
      .from("lead_inquiries")
      .insert({
        lead_id: leadId,
        event_date: inquiry.event_date,
        event_type: inquiry.event_type,
        num_persons: inquiry.num_persons,
        location_type: inquiry.location_type,
        venue_area: inquiry.venue_area,
        requirement: inquiry.requirement,
        budget: inquiry.budget,
        special_requirements: inquiry.special_requirements,
        source: core.source,
      })
      .select("id")
      .single();
    if (createError || !created) {
      throw new Error(`Failed to save inquiry details: ${createError?.message ?? "unknown error"}`);
    }
    inquiryId = created.id;
  }

  await replaceInquiryServices(supabase, inquiryId, inquiry.services);

  // Reuses the existing "note" activity type — editing a lead should appear
  // in the timeline like every other action, without inventing a new type.
  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    activity_type: "note",
    body: "Lead details updated.",
  });
}

/**
 * Changes a lead's pipeline status. The "previous" status used for the
 * activity record is always read fresh from the database inside this
 * function — never trusted from the caller — so a client racing two rapid
 * status changes can never log an inaccurate transition. If the requested
 * status matches what's already stored, this is a no-op: no update, no
 * activity (avoids meaningless "X → X" history entries).
 */
export async function updateLeadStatus(
  supabase: SupabaseClient<Database>,
  leadId: string,
  status: LeadStatus,
): Promise<{ changed: boolean; previousStatus: LeadStatus | null }> {
  const { data: current, error: readError } = await supabase
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .single();

  if (readError || !current) {
    console.error("[leads-query] failed to read lead status", { leadId, readError });
    throw new Error(`Failed to update lead: ${readError?.message ?? "lead not found"}`);
  }

  if (current.status === status) {
    return { changed: false, previousStatus: current.status };
  }

  // The `.eq("status", current.status)` guard means this only succeeds if
  // nothing changed the row between the read above and this write — if a
  // concurrent request already updated it, `updated` comes back empty and we
  // skip logging a transition against a value that's no longer accurate.
  const { data: updated, error } = await supabase
    .from("leads")
    .update({ status })
    .eq("id", leadId)
    .eq("status", current.status)
    .select("id");

  if (error) {
    console.error("[leads-query] failed to update lead status", { leadId, status, error });
    throw new Error(`Failed to update lead: ${error.message}`);
  }

  if (!updated || updated.length === 0) {
    return { changed: false, previousStatus: current.status };
  }

  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    activity_type: "status_change",
    metadata: { from: current.status, to: status },
  });

  return { changed: true, previousStatus: current.status };
}

export async function updateLeadNotes(
  supabase: SupabaseClient<Database>,
  leadId: string,
  notes: string,
): Promise<void> {
  const trimmed = notes.trim();
  const { error } = await supabase
    .from("leads")
    .update({ notes: trimmed || null })
    .eq("id", leadId);

  if (error) {
    console.error("[leads-query] failed to update lead notes", { leadId, error });
    throw new Error(`Failed to save notes: ${error.message}`);
  }

  // Reuses the existing "note" activity type so saved internal notes show up
  // in the timeline like every other action, without inventing a new type.
  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    activity_type: "note",
    body: trimmed ? `Internal note updated: ${trimmed}` : "Internal note cleared.",
  });
}

export interface AddActivityInput {
  activityType: ActivityType;
  channel: ActivityChannel | null;
  body: string | null;
  outcome: string | null;
  occurredAt: string | null;
  nextFollowupAt: string | null;
  nextFollowupReason: string | null;
  metadata?: Record<string, unknown> | undefined;
}

/** Logs one timeline entry (follow-up, call, note, …) and keeps the lead's
 * denormalized next_followup_at / last_contacted_at columns in sync. */
export async function addLeadActivity(
  supabase: SupabaseClient<Database>,
  leadId: string,
  input: AddActivityInput,
): Promise<void> {
  const { error } = await supabase.from("lead_activities").insert({
    lead_id: leadId,
    activity_type: input.activityType,
    channel: input.channel,
    body: input.body,
    outcome: input.outcome,
    ...(input.occurredAt ? { occurred_at: input.occurredAt } : {}),
    next_followup_at: input.nextFollowupAt,
    metadata: (input.metadata as Json) ?? null,
  });

  if (error) {
    console.error("[leads-query] failed to log activity", { leadId, error });
    throw new Error(`Failed to save activity: ${error.message}`);
  }

  const leadUpdate: Database["public"]["Tables"]["leads"]["Update"] = {};
  if (input.activityType === "follow_up") {
    // Logging a follow-up always replaces the scheduled one — including
    // clearing it (nulls) when no new date is given, since the previously
    // due follow-up has now been acted on.
    leadUpdate.next_followup_at = input.nextFollowupAt;
    leadUpdate.next_followup_reason = input.nextFollowupReason;
  } else if (input.nextFollowupAt) {
    leadUpdate.next_followup_at = input.nextFollowupAt;
    leadUpdate.next_followup_reason = input.nextFollowupReason;
  }
  if (CONTACT_ACTIVITY_TYPES.includes(input.activityType)) {
    leadUpdate.last_contacted_at = input.occurredAt ?? new Date().toISOString();
  }

  if (Object.keys(leadUpdate).length > 0) {
    const { error: leadError } = await supabase.from("leads").update(leadUpdate).eq("id", leadId);
    if (leadError) {
      console.error("[leads-query] failed to sync lead follow-up fields", { leadId, leadError });
    }
  }
}

/** Clears the scheduled next follow-up (e.g. once it's been logged/completed). */
export async function clearNextFollowup(
  supabase: SupabaseClient<Database>,
  leadId: string,
): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ next_followup_at: null, next_followup_reason: null })
    .eq("id", leadId);

  if (error) {
    console.error("[leads-query] failed to clear next follow-up", { leadId, error });
    throw new Error(`Failed to clear follow-up: ${error.message}`);
  }
}
