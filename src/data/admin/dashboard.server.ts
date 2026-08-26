// Server-only. Platform-wide summary counts + recent-activity slices for the
// /admin dashboard. Every number is a live COUNT or a small limited SELECT
// over existing tables/RLS — no new tables, no DB-side aggregation function.
// Recent-activity lists reuse the existing Step 1/3 admin data-access files
// rather than re-implementing their joins here.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";
import { listAuditLogs, type AdminAuditLogEntry } from "./audit.server";
import { listAllLeads, type AdminLeadSummary } from "./leads.server";

const RECENT_LIMIT = 5;

export type RecentSignup = Pick<
  Tables<"beautician_profiles">,
  "id" | "slug" | "display_name" | "status" | "is_verified" | "created_at"
>;

export type DashboardSummary = {
  professionals: { total: number; published: number; suspended: number };
  leads: { new: number; contacted: number; qualified: number; booked: number; lost: number };
  services: { categories: number; specializations: number };
  verification: { verified: number; unverified: number };
  featured: { featured: number; notFeatured: number };
  recentActivity: AdminAuditLogEntry[];
  recentLeads: AdminLeadSummary[];
  recentSignups: RecentSignup[];
};

export async function getDashboardSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<DashboardSummary> {
  await assertIsAdmin(supabase, userId);

  const [
    professionalsTotal,
    professionalsPublished,
    professionalsSuspended,
    leadsNew,
    leadsContacted,
    leadsQualified,
    leadsBooked,
    leadsLost,
    categoriesTotal,
    specializationsTotal,
    verifiedTotal,
    featuredTotal,
    recentActivity,
    recentLeads,
    recentSignupsRes,
  ] = await Promise.all([
    supabase.from("beautician_profiles").select("*", { count: "exact", head: true }),
    supabase
      .from("beautician_profiles")
      .select("*", { count: "exact", head: true })
      .eq("status", "published"),
    supabase
      .from("beautician_profiles")
      .select("*", { count: "exact", head: true })
      .eq("status", "suspended"),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "contacted"),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "qualified"),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "booked"),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "lost"),
    supabase.from("service_categories").select("*", { count: "exact", head: true }),
    supabase.from("specializations").select("*", { count: "exact", head: true }),
    supabase
      .from("beautician_profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_verified", true),
    supabase
      .from("beautician_profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_featured", true),
    listAuditLogs(supabase, userId),
    listAllLeads(supabase, userId),
    supabase
      .from("beautician_profiles")
      .select("id, slug, display_name, status, is_verified, created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
  ]);

  const errors = [
    professionalsTotal.error,
    professionalsPublished.error,
    professionalsSuspended.error,
    leadsNew.error,
    leadsContacted.error,
    leadsQualified.error,
    leadsBooked.error,
    leadsLost.error,
    categoriesTotal.error,
    specializationsTotal.error,
    verifiedTotal.error,
    featuredTotal.error,
    recentSignupsRes.error,
  ].filter(Boolean);
  if (errors.length > 0) {
    throw new Error(`Failed to load dashboard summary: ${errors[0]!.message}`);
  }

  const total = professionalsTotal.count ?? 0;
  const verified = verifiedTotal.count ?? 0;
  const featured = featuredTotal.count ?? 0;

  return {
    professionals: {
      total,
      published: professionalsPublished.count ?? 0,
      suspended: professionalsSuspended.count ?? 0,
    },
    leads: {
      new: leadsNew.count ?? 0,
      contacted: leadsContacted.count ?? 0,
      qualified: leadsQualified.count ?? 0,
      booked: leadsBooked.count ?? 0,
      lost: leadsLost.count ?? 0,
    },
    services: {
      categories: categoriesTotal.count ?? 0,
      specializations: specializationsTotal.count ?? 0,
    },
    verification: { verified, unverified: total - verified },
    featured: { featured, notFeatured: total - featured },
    recentActivity: recentActivity.slice(0, RECENT_LIMIT),
    recentLeads: recentLeads.slice(0, RECENT_LIMIT),
    recentSignups: recentSignupsRes.data ?? [],
  };
}
