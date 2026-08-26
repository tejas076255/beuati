// Server-only. Phase 3G.3B — read-only CRM attribution + channel-performance
// rollup. Analyzes ENQUIRIES (lead_inquiries), not customer (leads) rows —
// one customer can submit many enquiries with different attribution, so
// counting `leads` rows would understate acquisition volume and blur
// per-enquiry channel performance (Phase 3G.3A's core architecture point).
//
// PRIVACY (§32/§33): the select() below never touches name/phone/email/
// message/notes — only the columns this rollup actually needs. Aggregation
// happens entirely in this server function; only the final aggregated
// counts cross the network to the browser, never raw per-enquiry rows.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getOwnBeauticianProfileId } from "./dashboard/shared.server";

export type InsightsDateRange = "7d" | "30d" | "90d" | "all";

const RANGE_DAYS: Record<Exclude<InsightsDateRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export const RANGE_LABELS: Record<InsightsDateRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

interface Bucket {
  count: number;
}

export interface SourceBreakdownRow {
  /** null represents "Unknown / historical" — never relabeled as a real
   * channel (§3/§30). */
  source: string | null;
  count: number;
  share: number;
}

export interface UtmChannelRow {
  utmSource: string;
  utmMedium: string | null;
  count: number;
}

export interface CampaignRow {
  campaign: string;
  utmSource: string | null;
  utmMedium: string | null;
  count: number;
  share: number;
}

export interface ServiceDemandRow {
  service: string;
  count: number;
}

export interface CtaRow {
  /** null represents "Unknown / historical" — never defaulted to
   * availability_section (§11). */
  ctaLocation: string | null;
  count: number;
  share: number;
}

export interface PathRow {
  path: string;
  count: number;
}

export interface ReferrerRow {
  host: string;
  count: number;
}

export interface LeadInsights {
  range: InsightsDateRange;
  rangeLabel: string;
  /** Total lead_inquiries rows in range — the authoritative enquiry count. */
  totalEnquiries: number;
  /** Distinct lead_id among those enquiries. */
  uniqueCustomers: number;
  /** Enquiries with a recognized utm_source present. */
  utmAttributedCount: number;
  /** Enquiries with NO attribution signal at all (source, utm_source,
   * referrer_host, and cta_location all null) — genuinely unknown, never
   * labeled "Direct" (§3/§30). */
  unattributedCount: number;
  sourceBreakdown: SourceBreakdownRow[];
  utmChannelBreakdown: UtmChannelRow[];
  campaignBreakdown: CampaignRow[];
  /** §10 — an enquiry with multiple linked service tags contributes once to
   * EACH service's count, so the sum across rows can exceed totalEnquiries.
   * This is the documented, deliberate counting rule (service demand, not a
   * partition of enquiries). */
  serviceBreakdown: ServiceDemandRow[];
  ctaBreakdown: CtaRow[];
  landingPageBreakdown: PathRow[];
  conversionPageBreakdown: PathRow[];
  /** null when there isn't enough non-null referrer data to be worth a
   * section (§14) — the UI renders nothing in that case, not an empty table. */
  referrerBreakdown: ReferrerRow[] | null;
  coverage: {
    /** % of enquiries with a non-null `source`. */
    sourceRecordedPct: number;
    /** % of enquiries with a non-null `utm_source`. */
    utmRecordedPct: number;
    /** % of enquiries with a non-null `cta_location`. */
    ctaRecordedPct: number;
  };
}

function pct(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function bump(map: Map<string, Bucket>, key: string): void {
  const existing = map.get(key);
  if (existing) existing.count++;
  else map.set(key, { count: 1 });
}

type InquiryRow = {
  id: string;
  lead_id: string;
  created_at: string;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  landing_path: string | null;
  conversion_path: string | null;
  referrer_host: string | null;
  cta_location: string | null;
  lead_inquiry_services: { service_tag: string }[] | null;
};

/**
 * Shared by getOwnLeadInsights() and getInsightDrilldownMatches() (Phase
 * 3G.3C §15) — one query, one row shape, so the drill-down's match
 * predicates can never drift from the exact counting rules the rollup
 * already displays. PRIVACY (§32/§33 from 3G.3B): never selects name/
 * phone/email/message/notes.
 */
async function fetchOwnInquiriesInRange(
  supabase: SupabaseClient<Database>,
  userId: string,
  range: InsightsDateRange,
): Promise<InquiryRow[]> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);

  // §5 (3G.3B) — created_at is the authoritative enquiry-acquisition date,
  // never event_date (which is the customer's event date, not when the
  // enquiry arrived).
  let query = supabase
    .from("lead_inquiries")
    .select(
      "id, lead_id, created_at, source, utm_source, utm_medium, utm_campaign, landing_path, conversion_path, referrer_host, cta_location, leads!inner(beautician_profile_id), lead_inquiry_services(service_tag)",
    )
    // Explicit profile scoping in addition to RLS (§22/§23 from 3G.3B,
    // §16 here) — never relies on RLS alone, never assumes a single
    // global profile.
    .eq("leads.beautician_profile_id", bpId);

  if (range !== "all") {
    const cutoff = new Date(Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("created_at", cutoff);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[lead-insights] failed to load inquiries", error);
    throw new Error(`Failed to load insights: ${error.message}`);
  }
  return data ?? [];
}

export async function getOwnLeadInsights(
  supabase: SupabaseClient<Database>,
  userId: string,
  range: InsightsDateRange,
): Promise<LeadInsights> {
  const rows = await fetchOwnInquiriesInRange(supabase, userId, range);
  const totalEnquiries = rows.length;
  const uniqueCustomers = new Set(rows.map((r) => r.lead_id)).size;

  const sourceMap = new Map<string, Bucket>();
  const utmChannelMap = new Map<string, Bucket & { utmSource: string; utmMedium: string | null }>();
  const campaignMap = new Map<
    string,
    Bucket & { campaign: string; utmSource: string | null; utmMedium: string | null }
  >();
  const serviceMap = new Map<string, Bucket>();
  const ctaMap = new Map<string, Bucket>();
  const landingMap = new Map<string, Bucket>();
  const conversionMap = new Map<string, Bucket>();
  const referrerMap = new Map<string, Bucket>();

  let utmAttributedCount = 0;
  let unattributedCount = 0;
  let sourceRecordedCount = 0;
  let ctaRecordedCount = 0;

  const UNKNOWN_KEY = "__unknown__";

  for (const row of rows) {
    bump(sourceMap, row.source ?? UNKNOWN_KEY);
    if (row.source) sourceRecordedCount++;

    if (row.utm_source) {
      utmAttributedCount++;
      const key = `${row.utm_source}::${row.utm_medium ?? ""}`;
      const existing = utmChannelMap.get(key);
      if (existing) existing.count++;
      else
        utmChannelMap.set(key, { count: 1, utmSource: row.utm_source, utmMedium: row.utm_medium });
    }

    if (row.utm_campaign) {
      const key = `${row.utm_campaign}::${row.utm_source ?? ""}::${row.utm_medium ?? ""}`;
      const existing = campaignMap.get(key);
      if (existing) existing.count++;
      else
        campaignMap.set(key, {
          count: 1,
          campaign: row.utm_campaign,
          utmSource: row.utm_source,
          utmMedium: row.utm_medium,
        });
    }

    for (const s of row.lead_inquiry_services ?? []) {
      bump(serviceMap, s.service_tag);
    }

    bump(ctaMap, row.cta_location ?? UNKNOWN_KEY);
    if (row.cta_location) ctaRecordedCount++;

    if (row.landing_path) bump(landingMap, row.landing_path);
    if (row.conversion_path) bump(conversionMap, row.conversion_path);
    if (row.referrer_host) bump(referrerMap, row.referrer_host);

    if (!row.source && !row.utm_source && !row.referrer_host && !row.cta_location) {
      unattributedCount++;
    }
  }

  const sourceBreakdown: SourceBreakdownRow[] = Array.from(sourceMap.entries())
    .map(([key, b]) => ({
      source: key === UNKNOWN_KEY ? null : key,
      count: b.count,
      share: pct(b.count, totalEnquiries),
    }))
    .sort((a, b) => b.count - a.count);

  const utmChannelBreakdown: UtmChannelRow[] = Array.from(utmChannelMap.values())
    .map((b) => ({ utmSource: b.utmSource, utmMedium: b.utmMedium, count: b.count }))
    .sort((a, b) => b.count - a.count);

  const campaignBreakdown: CampaignRow[] = Array.from(campaignMap.values())
    .map((b) => ({
      campaign: b.campaign,
      utmSource: b.utmSource,
      utmMedium: b.utmMedium,
      count: b.count,
      share: pct(b.count, totalEnquiries),
    }))
    .sort((a, b) => b.count - a.count);

  const serviceBreakdown: ServiceDemandRow[] = Array.from(serviceMap.entries())
    .map(([service, b]) => ({ service, count: b.count }))
    .sort((a, b) => b.count - a.count);

  const ctaBreakdown: CtaRow[] = Array.from(ctaMap.entries())
    .map(([key, b]) => ({
      ctaLocation: key === UNKNOWN_KEY ? null : key,
      count: b.count,
      share: pct(b.count, totalEnquiries),
    }))
    .sort((a, b) => b.count - a.count);

  const landingPageBreakdown: PathRow[] = Array.from(landingMap.entries())
    .map(([path, b]) => ({ path, count: b.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const conversionPageBreakdown: PathRow[] = Array.from(conversionMap.entries())
    .map(([path, b]) => ({ path, count: b.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // §14 — only render a referrer section at all when there's genuine
  // non-null data; an almost-entirely-empty section is worse than no
  // section.
  const referrerEntries = Array.from(referrerMap.entries());
  const referrerBreakdown: ReferrerRow[] | null =
    referrerEntries.length > 0
      ? referrerEntries
          .map(([host, b]) => ({ host, count: b.count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
      : null;

  return {
    range,
    rangeLabel: RANGE_LABELS[range],
    totalEnquiries,
    uniqueCustomers,
    utmAttributedCount,
    unattributedCount,
    sourceBreakdown,
    utmChannelBreakdown,
    campaignBreakdown,
    serviceBreakdown,
    ctaBreakdown,
    landingPageBreakdown,
    conversionPageBreakdown,
    referrerBreakdown,
    coverage: {
      sourceRecordedPct: pct(sourceRecordedCount, totalEnquiries),
      utmRecordedPct: pct(utmAttributedCount, totalEnquiries),
      ctaRecordedPct: pct(ctaRecordedCount, totalEnquiries),
    },
  };
}

// ---------- Phase 3G.3C — Insights -> CRM drill-down ----------

/**
 * One insight row a user can click. `value: null` on source/cta represents
 * the exact same "Unknown / historical" bucket shown in Insights (§9) — it
 * is a genuine filter (source IS NULL), never treated as "Direct".
 */
export type InsightFilter =
  | { type: "source"; value: string | null }
  | { type: "utmChannel"; utmSource: string; utmMedium: string | null }
  | { type: "campaign"; value: string }
  | { type: "service"; value: string }
  | { type: "cta"; value: string | null };

export interface DrilldownMatch {
  leadId: string;
  /** How many of this customer's enquiries matched the filter (§7) — the
   * customer still appears once in the CRM list; this is the count shown
   * alongside them, never a duplicated row. */
  matchCount: number;
  /** Context for the single most recent matching enquiry (§6) — enough to
   * show "Matched enquiry: HD Bridal Makeup, received Aug 25, 2026" without
   * restructuring the lead detail dialog. */
  latestMatchedAt: string;
  latestMatchedService: string | null;
}

function inquiryMatchesFilter(row: InquiryRow, filter: InsightFilter): boolean {
  switch (filter.type) {
    case "source":
      return row.source === filter.value;
    case "utmChannel":
      return row.utm_source === filter.utmSource && (row.utm_medium ?? null) === filter.utmMedium;
    case "campaign":
      return row.utm_campaign === filter.value;
    case "cta":
      return row.cta_location === filter.value;
    case "service":
      return (row.lead_inquiry_services ?? []).some((s) => s.service_tag === filter.value);
  }
}

/**
 * Enquiry-aware drill-down (§4/§5): a customer qualifies when AT LEAST ONE
 * of their enquiries matches the selected insight — never leads.source or
 * leads.service_id, which only reflect the latest/current snapshot (Phase
 * 3G.1A/3G.2A). Reuses the exact same in-range row set and date-range
 * semantics as getOwnLeadInsights() (§8 — same range, no silent expansion
 * to all-time), so a drill-down count can never disagree with what the
 * Insights view just showed.
 */
export async function getInsightDrilldownMatches(
  supabase: SupabaseClient<Database>,
  userId: string,
  range: InsightsDateRange,
  filter: InsightFilter,
): Promise<DrilldownMatch[]> {
  const rows = await fetchOwnInquiriesInRange(supabase, userId, range);

  const byLead = new Map<string, InquiryRow[]>();
  for (const row of rows) {
    if (!inquiryMatchesFilter(row, filter)) continue;
    const existing = byLead.get(row.lead_id);
    if (existing) existing.push(row);
    else byLead.set(row.lead_id, [row]);
  }

  const matches: DrilldownMatch[] = [];
  for (const [leadId, matchingRows] of byLead.entries()) {
    const latest = matchingRows.reduce((a, b) => (a.created_at > b.created_at ? a : b));
    matches.push({
      leadId,
      matchCount: matchingRows.length,
      latestMatchedAt: latest.created_at,
      latestMatchedService: latest.lead_inquiry_services?.[0]?.service_tag ?? null,
    });
  }
  return matches;
}
