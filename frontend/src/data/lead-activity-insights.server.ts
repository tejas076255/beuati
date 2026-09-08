// Server-only. Read-only lead_activities rollup for the per-beautician
// Admin Lead Performance dashboard — recent activity feed + first-response
// time. Scoped to one beautician_profile_id via a join through leads
// (lead_activities has no beautician_profile_id column of its own),
// matching the exact `leads!inner(...)` filtering pattern already
// established in src/data/lead-insights.server.ts. Deliberately not date-
// range limited (unlike lead-insights' enquiry rollup) — first-response
// time needs each lead's full activity history to find the true first
// contact, not just a recent slice.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";

export type LeadActivityRow = Tables<"lead_activities"> & {
  leads: { name: string | null; beautician_profile_id: string } | null;
};

export async function fetchLeadActivitiesForProfile(
  supabase: SupabaseClient<Database>,
  bpId: string,
): Promise<LeadActivityRow[]> {
  const { data, error } = await supabase
    .from("lead_activities")
    .select("*, leads!inner(name, beautician_profile_id)")
    .eq("leads.beautician_profile_id", bpId)
    .order("occurred_at", { ascending: false });

  if (error) {
    console.error("[lead-activity-insights] failed to load activities", error);
    throw new Error(`Failed to load lead activity: ${error.message}`);
  }
  return data ?? [];
}
