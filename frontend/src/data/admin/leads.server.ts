// Server-only. Platform-wide leads visibility for admins.
// leads_owner_read/update RLS already resolves true for admins via
// owns_beautician_profile()'s built-in has_role(...,'admin') OR-clause — no
// new RLS needed, this is pure app-layer visibility across every beautician.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";

export type AdminLeadSummary = Tables<"leads"> & {
  beautician_profiles: Pick<Tables<"beautician_profiles">, "display_name" | "slug"> | null;
  services: Pick<Tables<"services">, "name"> | null;
  packages: Pick<Tables<"packages">, "name"> | null;
};

export async function listAllLeads(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AdminLeadSummary[]> {
  await assertIsAdmin(supabase, userId);

  const { data, error } = await supabase
    .from("leads")
    .select("*, beautician_profiles(display_name, slug), services(name), packages(name)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load leads: ${error.message}`);
  return data ?? [];
}

export async function updateLeadStatusAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
  leadId: string,
  status: Database["public"]["Enums"]["lead_status"],
): Promise<void> {
  await assertIsAdmin(supabase, userId);

  const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
  if (error) throw new Error(`Failed to update lead: ${error.message}`);
}

/**
 * QA-1P — confirms `leadId` actually belongs to `targetProfileId` before a
 * per-beautician mutation. RLS alone already fully secures the
 * platform-wide page above (an admin's session legitimately passes RLS for
 * every beautician's leads), but the per-beautician workspace tab needs
 * this defense-in-depth so a stale/crafted leadId can't silently update a
 * DIFFERENT beautician's lead while viewing this one's tab — the same
 * pattern already applied to Gallery/Before & After/Videos/Packages/FAQs/
 * Reviews in earlier phases.
 */
async function assertLeadBelongsToProfile(
  supabase: SupabaseClient<Database>,
  targetProfileId: string,
  leadId: string,
): Promise<void> {
  const { data: existing, error } = await supabase
    .from("leads")
    .select("beautician_profile_id")
    .eq("id", leadId)
    .maybeSingle();
  if (error || !existing) {
    throw new Error(`Failed to load lead: ${error?.message ?? "not found"}`);
  }
  if (existing.beautician_profile_id !== targetProfileId) {
    throw new Error("This lead does not belong to the selected professional.");
  }
}

export async function listLeadsForBeautician(
  supabase: SupabaseClient<Database>,
  userId: string,
  targetProfileId: string,
): Promise<AdminLeadSummary[]> {
  await assertIsAdmin(supabase, userId);

  const { data, error } = await supabase
    .from("leads")
    .select("*, beautician_profiles(display_name, slug), services(name), packages(name)")
    .eq("beautician_profile_id", targetProfileId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load leads: ${error.message}`);
  return data ?? [];
}

export async function updateLeadStatusForBeautician(
  supabase: SupabaseClient<Database>,
  userId: string,
  targetProfileId: string,
  leadId: string,
  status: Database["public"]["Enums"]["lead_status"],
): Promise<void> {
  await assertIsAdmin(supabase, userId);
  await assertLeadBelongsToProfile(supabase, targetProfileId, leadId);

  const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
  if (error) throw new Error(`Failed to update lead: ${error.message}`);
}

// ---------- Lead Performance Dashboard ----------
// Reuses the exact same bpId-parameterized core functions the
// professional's own /dashboard/leads Insights view uses
// (getLeadInsightsForProfile / getInsightDrilldownMatchesForProfile in
// src/data/lead-insights.server.ts; fetchLeadActivitiesForProfile in
// src/data/lead-activity-insights.server.ts) — no analytics logic
// duplicated here, only the admin authorization gate.

export async function getLeadInsightsAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
  targetProfileId: string,
  range: import("@/data/lead-insights.server").InsightsDateRange,
) {
  await assertIsAdmin(supabase, userId);
  const { getLeadInsightsForProfile } = await import("@/data/lead-insights.server");
  return getLeadInsightsForProfile(supabase, targetProfileId, range);
}

export async function getLeadDrilldownAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
  targetProfileId: string,
  range: import("@/data/lead-insights.server").InsightsDateRange,
  filter: import("@/data/lead-insights.server").InsightFilter,
) {
  await assertIsAdmin(supabase, userId);
  const { getInsightDrilldownMatchesForProfile } = await import("@/data/lead-insights.server");
  return getInsightDrilldownMatchesForProfile(supabase, targetProfileId, range, filter);
}

export async function listLeadActivitiesAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
  targetProfileId: string,
) {
  await assertIsAdmin(supabase, userId);
  const { fetchLeadActivitiesForProfile } = await import("@/data/lead-activity-insights.server");
  return fetchLeadActivitiesForProfile(supabase, targetProfileId);
}
