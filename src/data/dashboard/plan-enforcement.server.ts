// Server-only. Plan-limit checks — the application-layer mirror of the
// DB-level enforcement triggers (see the plan-entitlements migration). Both
// layers exist deliberately: the DB triggers are the real security boundary
// (a crafted direct Supabase request cannot bypass them), while these
// checks exist purely for a fast, friendly error message before that
// boundary is even reached.
//
// Called from BOTH the owner-facing outer wrapper of each create function
// (createService, createPackage, etc.) AND the corresponding Admin
// delegating wrapper (createServiceAdmin, etc.) — never from the shared
// bpId-parameterized `*ForProfile` core they both call into, since that
// core has no way to distinguish which caller invoked it. The product rule
// is that Admin retains full edit/delete/reorder/plan-change/status rights,
// but creating NEW content must still respect the target portfolio's
// stored plan, with no override mechanism — Admin's path to add more
// content than a plan allows is to change the plan first, then create.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  assertWithinPlanLimit,
  getPlanLimit,
  PLAN_LABELS,
  type PlanLimitedModule,
  type PortfolioPlan,
} from "@/lib/plan-limits";
import { getOwnBeauticianProfileId } from "./shared.server";

async function getOwnPlan(supabase: SupabaseClient<Database>, bpId: string) {
  const { data, error } = await supabase
    .from("beautician_profiles")
    .select("plan")
    .eq("id", bpId)
    .single();
  if (error || !data) throw new Error("Failed to load profile plan.");
  return data.plan;
}

/** Read-only lookup for the professional's own plan — used by every
 * dashboard content page to render capacity ("3 of 5") and locked-module
 * UI. RLS (owns_beautician_profile) already scopes this to the caller's
 * own row; no admin check needed since this never mutates anything. */
export async function getOwnPortfolioPlan(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PortfolioPlan> {
  const bpId = await getOwnBeauticianProfileId(supabase, userId);
  return getOwnPlan(supabase, bpId);
}

async function countRows(
  supabase: SupabaseClient<Database>,
  module: Exclude<PlanLimitedModule, "gallery_photos">,
  bpId: string,
): Promise<number> {
  // A literal table name per branch (rather than a dynamic/union-typed
  // `.from(variable)`) is required here — the generated Supabase types
  // resolve `.eq()`'s allowed columns as the intersection across every
  // table in a union, which collapses to far fewer columns than any single
  // table actually has.
  switch (module) {
    case "services":
      return countFor(supabase, "services", bpId);
    case "packages":
      return countFor(supabase, "packages", bpId);
    case "before_after_items":
      return countFor(supabase, "before_after_items", bpId);
    case "portfolio_videos":
      return countFor(supabase, "portfolio_videos", bpId);
    case "faqs":
      return countFor(supabase, "faqs", bpId);
    case "service_areas":
      return countFor(supabase, "service_areas", bpId);
    case "reviews":
      return countFor(supabase, "reviews", bpId);
  }
}

async function countFor(
  supabase: SupabaseClient<Database>,
  table:
    | "services"
    | "packages"
    | "before_after_items"
    | "portfolio_videos"
    | "faqs"
    | "service_areas"
    | "reviews",
  bpId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("beautician_profile_id", bpId);
  if (error) throw new Error(`Failed to check plan limit: ${error.message}`);
  return count ?? 0;
}

/** Checks the plan limit for every module except gallery photos (which uses
 * its own dedicated check below, since photos live in a child table). */
export async function assertOwnerCanCreate(
  supabase: SupabaseClient<Database>,
  bpId: string,
  module: Exclude<PlanLimitedModule, "gallery_photos">,
): Promise<void> {
  // Independent reads — run concurrently rather than sequentially to keep
  // this check's added latency to roughly one round trip, not two.
  const [plan, count] = await Promise.all([
    getOwnPlan(supabase, bpId),
    countRows(supabase, module, bpId),
  ]);
  assertWithinPlanLimit(module, plan, count);
}

/** Gallery photos count is a two-hop relationship
 * (portfolio_images -> portfolio_item_id -> portfolio_items.beautician_profile_id),
 * so it can't reuse the generic single-table count check above. `photosToAdd`
 * lets one call cover creating a new gallery entry with multiple photos at
 * once, or adding more photos to an existing entry. */
export async function assertOwnerCanAddGalleryPhotos(
  supabase: SupabaseClient<Database>,
  bpId: string,
  photosToAdd: number,
): Promise<void> {
  const [plan, itemsResult] = await Promise.all([
    getOwnPlan(supabase, bpId),
    supabase.from("portfolio_items").select("id").eq("beautician_profile_id", bpId),
  ]);
  const limit = getPlanLimit(plan, "gallery_photos");
  if (limit === 0) {
    throw new Error(
      `Gallery photos are not available on the ${PLAN_LABELS[plan]} plan. Upgrade to unlock this.`,
    );
  }

  const { data: items, error: itemsError } = itemsResult;
  if (itemsError) throw new Error(`Failed to check gallery limit: ${itemsError.message}`);
  const itemIds = (items ?? []).map((item) => item.id);

  let existingCount = 0;
  if (itemIds.length > 0) {
    const { count, error: countError } = await supabase
      .from("portfolio_images")
      .select("*", { count: "exact", head: true })
      .in("portfolio_item_id", itemIds);
    if (countError) throw new Error(`Failed to check gallery limit: ${countError.message}`);
    existingCount = count ?? 0;
  }

  if (existingCount + photosToAdd > limit) {
    throw new Error(
      `Adding ${photosToAdd} photo${photosToAdd === 1 ? "" : "s"} would exceed your ${PLAN_LABELS[plan]} plan's gallery limit of ${limit}. Upgrade for more capacity.`,
    );
  }
}
