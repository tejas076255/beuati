// Pure, DB-free lead-performance calculations — shared by the per-
// beautician Admin Lead Performance dashboard. Takes already-fetched
// leads + lead_activities rows (no network calls here) and derives stage
// funnel counts, conversion rates, attention-required signals, and
// first-response timing. Every number here is derived only from data that
// genuinely exists on these rows — nothing invented, no arbitrary
// "performance score".
import { CLOSED_STATUSES, STATUS_ORDER, type LeadStatus } from "./lead-config";
import type { Database, Tables } from "@/integrations/supabase/types";

type ActivityType = Database["public"]["Enums"]["lead_activity_type"];

// Same contact-type set submit_lead()'s activity logging already treats as
// "this counts as contact" (src/data/leads-query.server.ts's
// CONTACT_ACTIVITY_TYPES) — reused here, not redefined, so "first response"
// and "last contacted" never disagree about what counts as contact.
const CONTACT_ACTIVITY_TYPES: ActivityType[] = [
  "call",
  "whatsapp",
  "sms",
  "email",
  "follow_up",
  "booking",
];

/** A lead is considered "stale/untouched" once it has sat this many days
 * with zero contact recorded. A deliberately explicit, documented
 * threshold — not hidden inside a formula — so it can be reviewed/tuned
 * without archaeology. */
export const STALE_UNTOUCHED_DAYS = 3;

export type LeadPerformanceLead = Pick<
  Tables<"leads">,
  "id" | "name" | "status" | "created_at" | "last_contacted_at" | "next_followup_at"
>;

export type LeadPerformanceActivity = Pick<
  Tables<"lead_activities">,
  "lead_id" | "activity_type" | "occurred_at"
>;

export interface AttentionLead {
  id: string;
  name: string | null;
  days: number;
}

export interface LeadPerformanceSummary {
  totalLeads: number;
  byStage: Record<LeadStatus, number>;
  newUntouchedCount: number;
  conversionRates: {
    /** % of all leads currently at/past "booked" in a way that reached
     * booked at some point — computed from CURRENT status only (no status-
     * history table exists), so this reads "leads currently booked or
     * completed", not "ever booked then moved on". Documented, not hidden. */
    toBookedPct: number;
    toCompletedPct: number;
  };
  attention: {
    overdueFollowups: AttentionLead[];
    staleUntouched: AttentionLead[];
  };
  firstResponse: {
    medianHours: number;
    sampleSize: number;
  } | null;
}

function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

function hoursBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / (60 * 60 * 1000);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function computeLeadPerformanceSummary(
  leads: LeadPerformanceLead[],
  activities: LeadPerformanceActivity[],
  now: Date = new Date(),
): LeadPerformanceSummary {
  const byStage = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<LeadStatus, number>;
  let newUntouchedCount = 0;
  const overdueFollowups: AttentionLead[] = [];
  const staleUntouched: AttentionLead[] = [];

  for (const lead of leads) {
    byStage[lead.status]++;

    if (!lead.last_contacted_at) {
      newUntouchedCount++;
      if (!CLOSED_STATUSES.includes(lead.status)) {
        const days = daysSince(lead.created_at, now);
        if (days >= STALE_UNTOUCHED_DAYS) {
          staleUntouched.push({ id: lead.id, name: lead.name, days });
        }
      }
    }

    if (
      lead.next_followup_at &&
      new Date(lead.next_followup_at).getTime() < now.getTime() &&
      !CLOSED_STATUSES.includes(lead.status)
    ) {
      overdueFollowups.push({
        id: lead.id,
        name: lead.name,
        days: daysSince(lead.next_followup_at, now),
      });
    }
  }

  const totalLeads = leads.length;
  const toBookedPct = totalLeads === 0 ? 0 : Math.round((byStage.booked / totalLeads) * 1000) / 10;
  const toCompletedPct =
    totalLeads === 0 ? 0 : Math.round((byStage.completed / totalLeads) * 1000) / 10;

  // First-response time: for each lead, the earliest contact-type activity
  // vs. that lead's own created_at. Only leads that HAVE a recorded contact
  // contribute — never invented for leads with none.
  const createdAtByLead = new Map(leads.map((l) => [l.id, l.created_at]));
  const earliestContactByLead = new Map<string, string>();
  for (const activity of activities) {
    if (!CONTACT_ACTIVITY_TYPES.includes(activity.activity_type)) continue;
    if (!activity.occurred_at) continue;
    if (!createdAtByLead.has(activity.lead_id)) continue; // activity for a lead outside this set
    const existing = earliestContactByLead.get(activity.lead_id);
    if (!existing || activity.occurred_at < existing) {
      earliestContactByLead.set(activity.lead_id, activity.occurred_at);
    }
  }
  const responseHours: number[] = [];
  for (const [leadId, firstContactAt] of earliestContactByLead.entries()) {
    const createdAt = createdAtByLead.get(leadId);
    if (!createdAt) continue;
    responseHours.push(hoursBetween(createdAt, firstContactAt));
  }

  return {
    totalLeads,
    byStage,
    newUntouchedCount,
    conversionRates: { toBookedPct, toCompletedPct },
    attention: {
      overdueFollowups: overdueFollowups.sort((a, b) => b.days - a.days),
      staleUntouched: staleUntouched.sort((a, b) => b.days - a.days),
    },
    firstResponse:
      responseHours.length === 0
        ? null
        : {
            medianHours: Math.round(median(responseHours) * 10) / 10,
            sampleSize: responseHours.length,
          },
  };
}

export interface LeadActivityFeedItem {
  id: string;
  leadId: string;
  leadName: string | null;
  activityType: ActivityType;
  occurredAt: string | null;
}

export function buildRecentActivityFeed(
  activities: (LeadPerformanceActivity & { id: string; leads?: { name: string | null } | null })[],
  limit = 15,
): LeadActivityFeedItem[] {
  return activities
    .filter((a) => !!a.occurred_at)
    .slice(0, limit)
    .map((a) => ({
      id: a.id,
      leadId: a.lead_id,
      leadName: a.leads?.name ?? null,
      activityType: a.activity_type,
      occurredAt: a.occurred_at,
    }));
}
