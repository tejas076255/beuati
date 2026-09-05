// Server-only. Platform-wide beautician_profiles moderation for admins.
// RLS already grants admins full access to every profile (every owner
// policy on beautician_profiles is `OR has_role(auth.uid(),'admin')`), but
// this file explicitly checks the caller's role first rather than relying
// solely on RLS to silently filter results — a non-admin owner should see a
// clear "not authorized" message, not a table that looks like "the whole
// platform has 1 profile" (their own, via the owner policy).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { assertIsAdmin } from "./shared.server";
import { logAdminAction } from "./audit.server";
import {
  getPlanLimit,
  planAllowsGtm,
  PLAN_LABELS,
  type PlanLimitedModule,
  type PortfolioPlan,
} from "@/lib/plan-limits";

export type AdminProfileSummary = Pick<
  Tables<"beautician_profiles">,
  | "id"
  | "slug"
  | "display_name"
  | "status"
  | "is_demo"
  | "is_verified"
  | "is_featured"
  | "created_at"
  | "review_count"
  | "client_count"
  | "plan"
>;

export async function listAllProfiles(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AdminProfileSummary[]> {
  await assertIsAdmin(supabase, userId);

  const { data, error } = await supabase
    .from("beautician_profiles")
    .select(
      "id, slug, display_name, status, is_demo, is_verified, is_featured, created_at, review_count, client_count, plan",
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load profiles: ${error.message}`);
  return data ?? [];
}

type CountableModule = Exclude<PlanLimitedModule, "gallery_photos">;
type CountableTableName =
  | "services"
  | "packages"
  | "before_after_items"
  | "portfolio_videos"
  | "faqs"
  | "service_areas"
  | "reviews";

const COUNTABLE_MODULES: CountableModule[] = [
  "services",
  "packages",
  "before_after_items",
  "portfolio_videos",
  "faqs",
  "service_areas",
  "reviews",
];

// A literal table name per branch (rather than a dynamic/union-typed
// `.from(variable)`) is required — the generated Supabase types resolve
// `.eq()`'s allowed columns as the intersection across every table in a
// union, which collapses to far fewer columns than any single table
// actually has.
async function countForModule(
  supabase: SupabaseClient<Database>,
  module: CountableModule,
  profileId: string,
): Promise<number> {
  const table: CountableTableName = module;
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("beautician_profile_id", profileId);
  if (error) throw new Error(`Failed to check ${module} for downgrade: ${error.message}`);
  return count ?? 0;
}

/**
 * Before a downgrade, validate the portfolio against the target tier
 * without deleting or hiding anything. Returns a list of human-readable
 * reasons (empty = the downgrade may proceed). Never called for an upgrade
 * (upgrades are always allowed) — callers should skip this check whenever
 * the target plan's rank is not lower than the current one.
 */
export async function validatePlanDowngrade(
  supabase: SupabaseClient<Database>,
  profileId: string,
  targetPlan: PortfolioPlan,
): Promise<string[]> {
  const reasons: string[] = [];

  for (const module of COUNTABLE_MODULES) {
    const limit = getPlanLimit(targetPlan, module);
    const count = await countForModule(supabase, module, profileId);
    if (count > limit) {
      reasons.push(
        limit === 0
          ? `${count} ${module.replace(/_/g, " ")} exist, but ${PLAN_LABELS[targetPlan]} does not allow this content type — remove them first.`
          : `${count} ${module.replace(/_/g, " ")} exist, exceeding ${PLAN_LABELS[targetPlan]}'s limit of ${limit} — remove some first.`,
      );
    }
  }

  // Gallery photos: two-hop relationship, counted across all of this
  // profile's portfolio_items.
  const galleryLimit = getPlanLimit(targetPlan, "gallery_photos");
  const { data: items, error: itemsError } = await supabase
    .from("portfolio_items")
    .select("id")
    .eq("beautician_profile_id", profileId);
  if (itemsError)
    throw new Error(`Failed to check gallery photos for downgrade: ${itemsError.message}`);
  const itemIds = (items ?? []).map((item) => item.id);
  if (itemIds.length > 0) {
    const { count, error: countError } = await supabase
      .from("portfolio_images")
      .select("*", { count: "exact", head: true })
      .in("portfolio_item_id", itemIds);
    if (countError)
      throw new Error(`Failed to check gallery photos for downgrade: ${countError.message}`);
    if ((count ?? 0) > galleryLimit) {
      reasons.push(
        `${count} gallery photos exist, exceeding ${PLAN_LABELS[targetPlan]}'s limit of ${galleryLimit} — remove some first.`,
      );
    }
  }

  // Active GTM tracking exists but the target tier doesn't allow it.
  if (!planAllowsGtm(targetPlan)) {
    const { data: tracking, error: trackingError } = await supabase
      .from("portfolio_tracking_settings")
      .select("beautician_profile_id")
      .eq("beautician_profile_id", profileId)
      .maybeSingle();
    if (trackingError)
      throw new Error(`Failed to check GTM tracking for downgrade: ${trackingError.message}`);
    if (tracking) {
      reasons.push(
        `A GTM tracking container is configured, but ${PLAN_LABELS[targetPlan]} does not allow tracking — remove it first.`,
      );
    }
  }

  return reasons;
}

const PLAN_RANK: Record<PortfolioPlan, number> = {
  free: 0,
  starter: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

/**
 * Admin-only plan change. Upgrades are always allowed. Downgrades are
 * validated first (see validatePlanDowngrade) and rejected with an
 * actionable reason if the portfolio doesn't fit the target tier — content
 * is never deleted or hidden automatically. Admin can clean up the
 * portfolio first and retry.
 */
export async function updateProfilePlan(
  supabase: SupabaseClient<Database>,
  userId: string,
  profileId: string,
  targetPlan: PortfolioPlan,
): Promise<void> {
  await assertIsAdmin(supabase, userId);

  const { data: before, error: fetchError } = await supabase
    .from("beautician_profiles")
    .select("plan")
    .eq("id", profileId)
    .maybeSingle();
  if (fetchError || !before)
    throw new Error(`Failed to load profile: ${fetchError?.message ?? "not found"}`);

  if (before.plan === targetPlan) return;

  if (PLAN_RANK[targetPlan] < PLAN_RANK[before.plan]) {
    const reasons = await validatePlanDowngrade(supabase, profileId, targetPlan);
    if (reasons.length > 0) {
      throw new Error(`Cannot downgrade to ${PLAN_LABELS[targetPlan]}: ${reasons.join(" ")}`);
    }
  }

  const { error } = await supabase
    .from("beautician_profiles")
    .update({ plan: targetPlan })
    .eq("id", profileId);
  if (error) throw new Error(`Failed to update plan: ${error.message}`);

  await logAdminAction(
    supabase,
    "plan_changed",
    "beautician_profile",
    profileId,
    { plan: before.plan },
    { plan: targetPlan },
  );
}

export async function updateProfileStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  profileId: string,
  status: Database["public"]["Enums"]["portfolio_status"],
): Promise<void> {
  await assertIsAdmin(supabase, userId);

  const { data: before } = await supabase
    .from("beautician_profiles")
    .select("status")
    .eq("id", profileId)
    .maybeSingle();

  const { error } = await supabase
    .from("beautician_profiles")
    .update({ status })
    .eq("id", profileId);
  if (error) throw new Error(`Failed to update status: ${error.message}`);

  if (before && before.status !== status) {
    await logAdminAction(
      supabase,
      "profile_status_changed",
      "beautician_profile",
      profileId,
      { status: before.status },
      { status },
    );
  }
}

// Trigger-guarded: guard_beautician_profile_flags() resets these columns to
// their previous value on UPDATE unless the caller has the admin role, so
// this is defense-in-depth on top of the DB-level protection, not the only
// protection — same pattern as updateReviewModeration's is_verified field.
export async function updateProfileFlags(
  supabase: SupabaseClient<Database>,
  userId: string,
  profileId: string,
  updates: Partial<Pick<Tables<"beautician_profiles">, "is_verified" | "is_featured">>,
): Promise<void> {
  await assertIsAdmin(supabase, userId);

  const { data: before } = await supabase
    .from("beautician_profiles")
    .select("is_verified, is_featured")
    .eq("id", profileId)
    .maybeSingle();

  const { error } = await supabase.from("beautician_profiles").update(updates).eq("id", profileId);
  if (error) throw new Error(`Failed to update profile flags: ${error.message}`);

  if (before) {
    if ("is_verified" in updates && updates.is_verified !== before.is_verified) {
      await logAdminAction(
        supabase,
        "verification_changed",
        "beautician_profile",
        profileId,
        { is_verified: before.is_verified },
        { is_verified: updates.is_verified },
      );
    }
    if ("is_featured" in updates && updates.is_featured !== before.is_featured) {
      await logAdminAction(
        supabase,
        "featured_changed",
        "beautician_profile",
        profileId,
        { is_featured: before.is_featured },
        { is_featured: updates.is_featured },
      );
    }
  }
}
